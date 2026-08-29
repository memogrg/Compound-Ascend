import "server-only";
/**
 * Persistencia de la MEMORIA DE HECHOS del usuario (`user_memory`). Mismo molde que
 * `coaching-store`: seam `resolveAuth` (sin ctx = sesión por cookies bajo RLS; con ctx = cliente
 * inyectado + filtro `user_id` explícito, para el cron y las pruebas headless) y TODO best-effort
 * — la lectura devuelve `[]` y la escritura es no-op si algo falla, porque una respuesta del chat
 * jamás puede romperse por un fallo de memoria.
 *
 * PERSONAL, no del hogar: `user_memory` no lleva `household_id` a propósito (ver la migración
 * 20260828000002). Lo que me contaron a mí no aparece en el chat de mi pareja.
 *
 * El criterio (qué es un hecho, cuándo se duplica, cuándo se contradice) NO vive acá: vive en
 * `memory-facts`, que es puro. Acá solo hay IO.
 */
import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
import { logger } from "@/lib/logger";
import {
  MAX_ACTIVE_FACTS,
  MAX_MEMORY_INJECTED,
  MAX_FACT_LEN,
  MEMORY_CATEGORIES,
  planOverflow,
  tieneCifraFinanciera,
  type ExtractedFact,
  type MemoryCategory,
  type MemoryPlan,
  type StoredFact,
} from "@/lib/ai/memory-facts";

type Row = {
  id: string;
  fact: string;
  category: string;
  status: string;
  created_at: string;
  updated_at: string;
};

function toStored(r: Row): StoredFact {
  const category = (MEMORY_CATEGORIES as readonly string[]).includes(r.category)
    ? (r.category as MemoryCategory)
    : "otro";
  return {
    id: r.id,
    fact: r.fact,
    category,
    status: r.status === "archivada" ? "archivada" : "activa",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const COLS = "id, fact, category, status, created_at, updated_at";

/**
 * Hechos ACTIVOS del usuario, los más re-confirmados primero (`updated_at desc`). Es la lista que
 * se inyecta al contexto y la que ve Ajustes. `[]` ante cualquier fallo.
 */
export async function loadActiveMemory(
  ctx?: AuthContext,
  limit: number = MAX_ACTIVE_FACTS,
): Promise<StoredFact[]> {
  try {
    const { db, userId } = await resolveAuth(ctx);
    let q = db.from("user_memory").select(COLS).eq("status", "activa");
    if (ctx) q = q.eq("user_id", userId); // service-role → filtro explícito; sesión → RLS
    const { data, error } = await q.order("updated_at", { ascending: false }).limit(limit);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => toStored(r as Row));
  } catch (err) {
    logger.warn("loadActiveMemory falló", { message: err instanceof Error ? err.message : "?" });
    return [];
  }
}

/** Los hechos que se le muestran al LLM: los `MAX_MEMORY_INJECTED` más recientes/re-confirmados. */
export async function loadMemoryForContext(ctx?: AuthContext): Promise<StoredFact[]> {
  return loadActiveMemory(ctx, MAX_MEMORY_INJECTED);
}

/**
 * Todo lo que el usuario puede ver y administrar en Ajustes: activos primero, archivados después
 * (los archivados se muestran para que se entienda qué pasó con un hecho que ya no aplica).
 */
export async function listMemoryForUser(ctx?: AuthContext): Promise<StoredFact[]> {
  try {
    const { db, userId } = await resolveAuth(ctx);
    let q = db.from("user_memory").select(COLS);
    if (ctx) q = q.eq("user_id", userId);
    const { data, error } = await q.order("updated_at", { ascending: false }).limit(300);
    if (error) throw new Error(error.message);
    const rows = (data ?? []).map((r) => toStored(r as Row));
    return [
      ...rows.filter((r) => r.status === "activa"),
      ...rows.filter((r) => r.status === "archivada"),
    ];
  } catch (err) {
    logger.warn("listMemoryForUser falló", { message: err instanceof Error ? err.message : "?" });
    return [];
  }
}

/**
 * Aplica un plan de escritura (`planMemoryWrites`). Cada tramo va por separado y con su propio
 * error: si el archivado falla, los inserts igual entran. Devuelve cuánto hizo de verdad.
 *
 * La guarda de cifras se re-aplica ACÁ además de en el parseo: este es el último punto antes del
 * INSERT, y ninguna cifra puede entrar por ninguna puerta.
 */
export async function applyMemoryPlan(
  plan: MemoryPlan,
  ctx?: AuthContext,
): Promise<{ inserted: number; touched: number; archived: number }> {
  const res = { inserted: 0, touched: 0, archived: 0 };
  const { db, userId } = await resolveAuth(ctx);
  const ahora = new Date().toISOString();

  if (plan.archives.length > 0) {
    const { error } = await db
      .from("user_memory")
      .update({ status: "archivada", updated_at: ahora })
      .eq("user_id", userId)
      .in("id", plan.archives);
    if (error) logger.warn("applyMemoryPlan: archivar falló", { message: error.message });
    else res.archived = plan.archives.length;
  }

  if (plan.touches.length > 0) {
    const { error } = await db
      .from("user_memory")
      .update({ updated_at: ahora })
      .eq("user_id", userId)
      .in("id", plan.touches);
    if (error) logger.warn("applyMemoryPlan: re-confirmar falló", { message: error.message });
    else res.touched = plan.touches.length;
  }

  const limpios = plan.inserts.filter((f) => f.fact.trim() && !tieneCifraFinanciera(f.fact));
  if (limpios.length > 0) {
    const rows = limpios.map((f) => ({
      user_id: userId,
      fact: f.fact.trim().slice(0, MAX_FACT_LEN),
      category: f.category,
      source: "chat",
      status: "activa",
    }));
    const { error } = await db.from("user_memory").insert(rows);
    if (error) logger.warn("applyMemoryPlan: insertar falló", { message: error.message });
    else res.inserted = rows.length;
  }

  return res;
}

/**
 * Archiva los hechos que sobran del tope. Se corre después de insertar: sin esto, un usuario muy
 * conversador terminaría con cientos de hechos y una lista imposible de administrar (la inyección
 * al prompt ya está acotada aparte, así que esto protege la BD y la pantalla, no el prompt).
 */
export async function enforceMemoryCap(ctx?: AuthContext): Promise<number> {
  try {
    const activos = await loadActiveMemory(ctx, MAX_ACTIVE_FACTS + 50);
    const sobran = planOverflow(activos);
    if (sobran.length === 0) return 0;
    const { db, userId } = await resolveAuth(ctx);
    const { error } = await db
      .from("user_memory")
      .update({ status: "archivada", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .in("id", sobran);
    if (error) throw new Error(error.message);
    return sobran.length;
  } catch (err) {
    logger.warn("enforceMemoryCap falló", { message: err instanceof Error ? err.message : "?" });
    return 0;
  }
}

/** Inserta hechos sueltos (usado por las pruebas de aislamiento y por orígenes futuros). */
export async function insertFacts(facts: ExtractedFact[], ctx?: AuthContext): Promise<number> {
  const plan: MemoryPlan = { inserts: facts, touches: [], archives: [] };
  const { inserted } = await applyMemoryPlan(plan, ctx);
  return inserted;
}

// ── Control del usuario (Ajustes + "olvidá eso") ────────────────────────────
// Estas cuatro SÍ propagan el error: son acciones EXPLÍCITAS del usuario y un fallo silencioso
// le haría creer que borró algo que sigue ahí. El best-effort es para las lecturas y el batch.

/** Reescribe el texto de un hecho (el usuario corrige lo que el extractor entendió mal). */
export async function updateFactText(id: string, fact: string, ctx?: AuthContext): Promise<void> {
  const texto = fact.replace(/\s+/g, " ").trim();
  if (!texto) throw new Error("El recuerdo no puede quedar vacío.");
  if (texto.length > MAX_FACT_LEN) throw new Error("El recuerdo es demasiado largo.");
  if (tieneCifraFinanciera(texto))
    throw new Error("La memoria no guarda montos: esos datos se leen en vivo de tu cuenta.");
  const { db, userId } = await resolveAuth(ctx);
  const { error } = await db
    .from("user_memory")
    .update({ fact: texto, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Archiva un hecho: deja de inyectarse, pero el usuario lo sigue viendo en Ajustes. */
export async function archiveFact(id: string, ctx?: AuthContext): Promise<void> {
  const { db, userId } = await resolveAuth(ctx);
  const { error } = await db
    .from("user_memory")
    .update({ status: "archivada", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Borra un hecho de verdad (fila fuera). Solo desde una acción explícita del usuario. */
export async function deleteFact(id: string, ctx?: AuthContext): Promise<void> {
  const { db, userId } = await resolveAuth(ctx);
  const { error } = await db.from("user_memory").delete().eq("user_id", userId).eq("id", id);
  if (error) throw new Error(error.message);
}

/** "Borrar toda mi memoria": vacía la tabla para este usuario. Irreversible y explícito. */
export async function clearMemory(ctx?: AuthContext): Promise<void> {
  const { db, userId } = await resolveAuth(ctx);
  const { error } = await db.from("user_memory").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}

import "server-only";

/**
 * Sugerencia de sobre por IA, ACOTADA A LOS SOBRES DEL PROPIO USUARIO (sin taxonomía
 * canónica) y token-frugal: caché por (usuario, comercio) → cada comercio cuesta a lo sumo
 * 1 llamada de IA en su vida, con un tope de llamadas NUEVAS por carga. Sesión → RLS.
 *
 * Solo SUGIERE (pre-rellena el selector en "Por clasificar"); NO auto-asigna al registrar.
 */
import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { getActiveHouseholdId } from "@/lib/household/active";
import {
  listCategories,
  resolveOverrideTarget,
} from "@/modules/financial-base/services/categories-service";
import {
  selectableCategoryLeaves,
  categoryMatchesKind,
  type SelectableCategory,
} from "@/modules/financial-base/engine/classify";
import { normalize } from "@/lib/ai/biblia-knowledge";
import { logger } from "@/lib/logger";

export type Sobre = { id: string; name: string };
/** `source` es solo observabilidad; la UI del chip no lo usa. */
export type Suggestion = {
  categoryId: string | null;
  confidence: number;
  source?: "historial" | "cache" | "ia";
};

/** Cuántas transacciones categorizadas del hogar se miran para inferir el sobre dominante. */
const HISTORY_LIMIT = 1000;

/** Tope de llamadas NUEVAS a la IA por invocación (acota costo/latencia por carga). */
export const MAX_NEW_SUGGESTION_CALLS = 8;

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}

/** Extrae el primer objeto JSON aunque venga con ```json o texto alrededor. */
function parseSuggestion(text: string): { categoryId: string | null; confidence: number } | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]) as { categoryId?: unknown; confidence?: unknown };
    return {
      categoryId: typeof obj.categoryId === "string" ? obj.categoryId : null,
      confidence: typeof obj.confidence === "number" ? obj.confidence : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Pide a la IA el sobre de `merchant` SOLO entre `sobres`. Devuelve siempre algo seguro: si
 * la IA no está configurada, no responde JSON, o elige un id fuera de la lista → categoryId
 * null. Una sola llamada barata, sin estado.
 */
export async function suggestSobre(merchant: string, sobres: Sobre[]): Promise<Suggestion> {
  const provider = createGeminiProvider();
  if (!provider || sobres.length === 0) return { categoryId: null, confidence: 0 };

  const lista = sobres.map((s) => `${s.id}: ${s.name}`).join("\n");
  const system =
    "Sos un clasificador de gastos personales. Te doy un COMERCIO y una lista de SOBRES " +
    "(categorías) con su id. Elegí el sobre que mejor corresponda, SOLO de la lista. " +
    'Respondé ÚNICAMENTE un JSON: {"categoryId": "<id de la lista o null>", "confidence": <0..1>}. ' +
    "Sin texto extra. Si ninguno aplica, categoryId null.";
  const user = `COMERCIO: ${merchant}\nSOBRES:\n${lista}`;

  try {
    const res = await provider.chat({
      system,
      messages: [{ role: "user", content: user }],
      maxTokens: 60,
    });
    const parsed = parseSuggestion(res.text);
    if (!parsed) return { categoryId: null, confidence: 0 };
    const valid = parsed.categoryId != null && sobres.some((s) => s.id === parsed.categoryId);
    return { categoryId: valid ? parsed.categoryId : null, confidence: clamp01(parsed.confidence) };
  } catch (err) {
    logger.warn("suggestSobre falló", { message: err instanceof Error ? err.message : "?" });
    return { categoryId: null, confidence: 0 };
  }
}

export type SuggestItem = { id: string; merchant: string | null; kind: "gasto" | "ingreso" };

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Capa de HISTORIAL (gratis y precisa): la categoría DOMINANTE que el hogar ya le dio a cada
 * comercio en transacciones pasadas. Una sola query (RLS filtra por hogar). Dominante = más
 * frecuente; desempate = la más reciente. Devuelve Map<norm, categoryId> solo para los `norms`
 * pedidos. Si algo falla, devuelve vacío (degrada al flujo cache/IA).
 */
async function loadHistoryDominant(
  supabase: SupabaseServerClient,
  norms: string[],
  userId?: string,
): Promise<Map<string, string>> {
  const want = new Set(norms);
  const dominant = new Map<string, string>();
  try {
    let query = supabase
      .from("transactions")
      .select("merchant_or_source, description, category_id, kind")
      .not("category_id", "is", null);
    // Sesión → RLS filtra por hogar; service-role (webhook) → scoping explícito por usuario.
    if (userId) query = query.eq("user_id", userId);
    const { data } = await query.order("created_at", { ascending: false }).limit(HISTORY_LIMIT);

    // norm → (category_id → {count, idx}); idx = posición en orden desc (menor = más reciente).
    const agg = new Map<string, Map<string, { count: number; idx: number }>>();
    (data ?? []).forEach((row, idx) => {
      const catId = row.category_id;
      if (!catId) return;
      const label = (row.merchant_or_source ?? row.description ?? "").trim();
      const norm = normalize(label);
      if (!norm || !want.has(norm)) return;
      let byCat = agg.get(norm);
      if (!byCat) {
        byCat = new Map();
        agg.set(norm, byCat);
      }
      const cur = byCat.get(catId);
      if (cur) cur.count++;
      else byCat.set(catId, { count: 1, idx }); // primera aparición (desc) = uso más reciente
    });

    for (const [norm, byCat] of agg) {
      let bestId = "";
      let best = { count: -1, idx: Number.POSITIVE_INFINITY };
      for (const [catId, v] of byCat) {
        if (v.count > best.count || (v.count === best.count && v.idx < best.idx)) {
          best = v;
          bestId = catId;
        }
      }
      if (bestId) dominant.set(norm, bestId);
    }
  } catch (err) {
    logger.warn("historial de categorización falló", {
      message: err instanceof Error ? err.message : "?",
    });
  }
  return dominant;
}

/** Umbral de confianza para AUTO-ASIGNAR al registrar (señales deterministas, sin IA en vivo). */
export const AUTO_ASSIGN_MIN_CONFIDENCE = 0.9;

/**
 * Valida que `categoryId` sea usable como sobre para `kind`: existe, activa, HOJA (no es padre de
 * otra categoría activa) y su naturaleza matchea (gasto→expense/both, ingreso→income/both). Sin
 * depender de listCategories (que es de sesión) → sirve también con service-role.
 */
async function validateLeafForKind(
  supabase: SupabaseServerClient,
  categoryId: string,
  kind: "gasto" | "ingreso",
): Promise<boolean> {
  const { data: cat } = await supabase
    .from("expense_categories")
    .select("category_type, is_active")
    .eq("id", categoryId)
    .maybeSingle();
  if (!cat || cat.is_active === false) return false;
  if (!categoryMatchesKind(cat.category_type, kind)) return false;
  // Hoja = no es padre de ninguna categoría activa.
  const { count } = await supabase
    .from("expense_categories")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", categoryId)
    .eq("is_active", true);
  return (count ?? 0) === 0;
}

/**
 * AUTO-ASIGNACIÓN al registrar (cascada 3-3): resuelve el sobre de un comercio con señales
 * DETERMINISTAS ya guardadas — historial del usuario/hogar (0.95) y, si no hay, la caché de
 * sugerencias — SIN llamar a la IA. Solo devuelve algo si la confianza ≥ AUTO_ASSIGN_MIN_CONFIDENCE
 * Y la categoría valida como hoja de la naturaleza correcta. Cualquier fallo → null (best-effort,
 * nunca rompe el registro; el movimiento cae a "Por clasificar").
 */
export async function resolveAutoCategory(opts: {
  supabase: SupabaseServerClient;
  userId?: string;
  merchant: string;
  kind: "gasto" | "ingreso";
}): Promise<{ categoryId: string; source: "historial" | "cache" } | null> {
  const { supabase, userId, merchant, kind } = opts;
  const norm = normalize(merchant.trim());
  if (!norm) return null;

  try {
    // 1) Historial (0.95): dominante del comercio.
    const dominant = (await loadHistoryDominant(supabase, [norm], userId)).get(norm);
    let candidate: { categoryId: string; confidence: number; source: "historial" | "cache" } | null =
      dominant ? { categoryId: dominant, confidence: 0.95, source: "historial" } : null;

    // 2) Caché (si no hay historial).
    if (!candidate) {
      let q = supabase
        .from("merchant_suggestion_cache")
        .select("category_id, confidence")
        .eq("merchant_norm", norm);
      if (userId) q = q.eq("user_id", userId);
      const { data } = await q.limit(1).maybeSingle();
      if (data?.category_id) {
        candidate = {
          categoryId: data.category_id,
          confidence: Number(data.confidence ?? 0),
          source: "cache",
        };
      }
    }

    // 3) Umbral + validación de hoja/naturaleza.
    if (!candidate || candidate.confidence < AUTO_ASSIGN_MIN_CONFIDENCE) return null;
    const ok = await validateLeafForKind(supabase, candidate.categoryId, kind);
    if (!ok) return null;

    // 4) Respeta la personalización del hogar: forkeada → usa la copia; oculta sin
    // fork → no auto-asignes (el movimiento cae a "Por clasificar"). En sesión el
    // userId no viaja (RLS); lo resolvemos para acotar el scope del override.
    const scopeUserId = userId ?? (await requireUser()).id;
    const householdId = await getActiveHouseholdId(supabase, scopeUserId);
    const target = await resolveOverrideTarget(
      supabase,
      { userId: scopeUserId, householdId },
      candidate.categoryId,
    );
    return target ? { categoryId: target, source: candidate.source } : null;
  } catch (err) {
    logger.warn("resolveAutoCategory falló", { message: err instanceof Error ? err.message : "?" });
    return null;
  }
}

/**
 * Sugerencias para una lista de movimientos sin clasificar. Por cada COMERCIO distinto
 * (normalizado): cache hit en merchant_suggestion_cache → usar; si miss y hay sobres de esa
 * naturaleza → suggestSobre y guardar (incluido el "ninguno", para no re-llamar), con tope de
 * MAX_NEW_SUGGESTION_CALLS llamadas nuevas. Devuelve solo las entradas con sobre sugerido.
 */
export async function getSuggestionsFor(items: SuggestItem[]): Promise<Map<string, Suggestion>> {
  const out = new Map<string, Suggestion>();
  const withMerchant = items.filter((i) => i.merchant && i.merchant.trim());
  if (withMerchant.length === 0) return out;

  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const leaves = selectableCategoryLeaves(await listCategories());
  const leafById = new Map<string, SelectableCategory>(leaves.map((c) => [c.id, c]));

  const normOf = (i: SuggestItem) => normalize(i.merchant!.trim());
  const norms = [...new Set(withMerchant.map(normOf))];

  // 1) HISTORIAL (capa 2): la categoría dominante que el hogar ya dio al comercio. Precisa y
  //    GRATIS; pisa cache/IA. Solo vale si esa categoría es una hoja seleccionable que matchea
  //    la naturaleza del movimiento.
  const historyDominant = await loadHistoryDominant(supabase, norms);
  const resolved = new Map<string, Suggestion>();
  for (const norm of norms) {
    const catId = historyDominant.get(norm);
    if (!catId) continue;
    const leaf = leafById.get(catId);
    const sample = withMerchant.find((i) => normOf(i) === norm)!;
    if (leaf && categoryMatchesKind(leaf.categoryType, sample.kind)) {
      resolved.set(norm, { categoryId: catId, confidence: 0.95, source: "historial" });
    }
  }

  // Los norms cubiertos por historial NO consultan cache ni IA.
  const pending = norms.filter((n) => !resolved.has(n));

  // 2) Cache hits en bloque (solo para los pendientes).
  const cache = new Map<string, Suggestion>();
  if (pending.length > 0) {
    const { data: cached } = await supabase
      .from("merchant_suggestion_cache")
      .select("merchant_norm, category_id, confidence")
      .in("merchant_norm", pending);
    for (const row of cached ?? []) {
      cache.set(row.merchant_norm, {
        categoryId: row.category_id,
        confidence: Number(row.confidence ?? 0),
        source: "cache",
      });
    }
  }

  // 3) Misses: llamar a la IA hasta el tope y cachear el resultado.
  let newCalls = 0;
  for (const norm of pending) {
    if (cache.has(norm)) continue;
    if (newCalls >= MAX_NEW_SUGGESTION_CALLS) continue;

    const sample = withMerchant.find((i) => normOf(i) === norm)!;
    const sobres = leaves
      .filter((c) => categoryMatchesKind(c.categoryType, sample.kind))
      .map((c) => ({ id: c.id, name: c.name }));
    if (sobres.length === 0) continue;

    newCalls++;
    const sug = await suggestSobre(sample.merchant!.trim(), sobres);
    cache.set(norm, { ...sug, source: "ia" });
    try {
      await supabase
        .from("merchant_suggestion_cache")
        .upsert(
          {
            user_id: user.id,
            merchant_norm: norm,
            category_id: sug.categoryId,
            confidence: sug.confidence,
          },
          { onConflict: "user_id,merchant_norm" },
        );
    } catch (err) {
      logger.warn("merchant_suggestion_cache upsert falló", {
        message: err instanceof Error ? err.message : "?",
      });
    }
  }

  // 4) Mapear cada txn a su sugerencia (historial pisa cache/IA; solo las que tienen sobre).
  for (const it of withMerchant) {
    const norm = normOf(it);
    const sug = resolved.get(norm) ?? cache.get(norm);
    if (!sug || !sug.categoryId) continue;
    // El historial se validó con el item muestra; re-chequeamos la naturaleza por item
    // (por si dos movimientos comparten comercio con distinta naturaleza).
    if (sug.source === "historial") {
      const leaf = leafById.get(sug.categoryId);
      if (!leaf || !categoryMatchesKind(leaf.categoryType, it.kind)) continue;
    }
    out.set(it.id, sug);
  }
  return out;
}

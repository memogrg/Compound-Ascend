import "server-only";
/**
 * EXTRACCIÓN DIARIA de la memoria de hechos.
 *
 * Corre en BATCH, una vez al día, dentro del cron de retención del chat y JUSTO ANTES de la purga
 * — que es el único momento en que la conversación del día todavía existe y ya no va a cambiar.
 * Deliberadamente NO se extrae por mensaje: sería una llamada de LLM por turno para capturar algo
 * que el usuario dice una vez cada varias semanas.
 *
 * Una llamada de Flash-Lite por usuario con conversación del día. Todo lo que decide qué se guarda
 * (el prompt, el parseo, la guarda de cifras, el dedup y la contradicción) vive en `memory-facts`,
 * que es puro. Acá solo está la orquestación: leer, llamar, aplicar.
 *
 * BEST-EFFORT POR USUARIO: un fallo se loguea y el batch sigue con el siguiente. El cron NO puede
 * dejar de purgar porque la extracción se cayó.
 */
import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { retentionCutoffISO } from "@/lib/ai/chat-retention";
import { startOfCostaRicaDayISO } from "@/lib/ai/chat-store";
import { logger } from "@/lib/logger";
import type { AuthContext } from "@/lib/auth/auth-context";
import {
  buildExtractorSystemPrompt,
  parseExtractedFacts,
  planMemoryWrites,
  turnosParaExtractor,
  type ExtractedFact,
} from "@/lib/ai/memory-facts";
import { applyMemoryPlan, enforceMemoryCap, loadActiveMemory } from "@/lib/ai/memory-store";

/** El extractor corre en el modelo barato: es una tarea de clasificación, no de razonamiento. */
const EXTRACTOR_MODEL = "gemini-3.1-flash-lite";

/** Techo de salida. Ocho hechos cortos entran de sobra; más que esto es el modelo divagando. */
const MAX_OUT_TOKENS = 400;

/** Usuarios por corrida. Cota de costo y de tiempo del cron; sube cuando la base lo pida. */
const MAX_USERS_PER_RUN = 500;

export type ExtractionStats = {
  usuarios: number;
  extraidos: number;
  dedupeados: number;
  archivados: number;
  fallidos: number;
};

/** Mensajes del día de un usuario (los del USUARIO ya se filtran río abajo, en `turnosParaExtractor`). */
type DayMessage = { role: "user" | "assistant"; content: string };

/**
 * Una llamada al modelo → los hechos candidatos. Devuelve `[]` (nunca lanza) si no hay provider,
 * si el modelo no contesta o si lo que contestó no parsea: "hoy no hubo hechos" es una respuesta
 * perfectamente válida y mucho mejor que romper el cron.
 */
export async function extractFactsFromDay(msgs: DayMessage[]): Promise<ExtractedFact[]> {
  const bloque = turnosParaExtractor(msgs);
  if (!bloque.trim()) return [];
  const provider = createGeminiProvider(EXTRACTOR_MODEL);
  if (!provider) return [];
  try {
    const r = await provider.chat({
      system: buildExtractorSystemPrompt(),
      messages: [{ role: "user", content: bloque }],
      maxTokens: MAX_OUT_TOKENS,
    });
    return parseExtractedFacts(r.text);
  } catch (err) {
    logger.warn("memoria: el extractor falló", {
      message: err instanceof Error ? err.message : "?",
    });
    return [];
  }
}

/**
 * Extrae y guarda la memoria de UN usuario a partir de su conversación del día. Lanza solo si la
 * lectura de sus mensajes falla; el resto degrada a "no hubo hechos".
 */
export async function extractMemoryForUser(
  userId: string,
  ctx: AuthContext,
  desdeISO: string,
): Promise<{ extraidos: number; dedupeados: number; archivados: number }> {
  const { data, error } = await ctx.db
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("user_id", userId)
    .gte("created_at", desdeISO)
    .order("created_at", { ascending: true })
    .limit(300);
  if (error) throw new Error(error.message);

  const msgs: DayMessage[] = (data ?? []).map((r) => ({
    role: r.role === "assistant" ? "assistant" : "user",
    content: String(r.content ?? ""),
  }));

  const candidatos = await extractFactsFromDay(msgs);
  if (candidatos.length === 0) return { extraidos: 0, dedupeados: 0, archivados: 0 };

  // Se compara contra lo que YA sabemos: un hecho repetido re-confirma, no duplica; uno que
  // contradice archiva el viejo. Todo el criterio es puro y vive en `planMemoryWrites`.
  const existentes = await loadActiveMemory(ctx);
  const plan = planMemoryWrites(existentes, candidatos);
  const res = await applyMemoryPlan(plan, ctx);
  await enforceMemoryCap(ctx);

  return { extraidos: res.inserted, dedupeados: res.touched, archivados: res.archived };
}

/**
 * El batch. Recorre los usuarios con conversación desde el corte del día (hora de Costa Rica) y
 * extrae la memoria de cada uno. Best-effort POR USUARIO: un fallo se cuenta en `fallidos` y el
 * recorrido sigue. Nunca lanza — el caller (el cron de retención) tiene que poder purgar después
 * pase lo que pase.
 *
 * La ventana leída es el DÍA, no los 7 días de retención: el cron corre a diario, y releer la
 * semana entera cada día multiplicaría el costo por siete para extraer los mismos hechos.
 */
export async function extractMemoryForAllUsers(
  nowMs: number = Date.now(),
): Promise<ExtractionStats> {
  const stats: ExtractionStats = {
    usuarios: 0,
    extraidos: 0,
    dedupeados: 0,
    archivados: 0,
    fallidos: 0,
  };
  try {
    const db = createServiceRoleClient();
    // El corte del día, nunca antes del corte de retención (si el cron se saltó días, no se
    // reprocesa lo que ya se va a purgar igual).
    const inicioDia = startOfCostaRicaDayISO(nowMs);
    const corteRetencion = retentionCutoffISO(nowMs);
    const desde = inicioDia > corteRetencion ? inicioDia : corteRetencion;

    const { data, error } = await db
      .from("chat_messages")
      .select("user_id")
      .gte("created_at", desde)
      .limit(20000);
    if (error) throw new Error(error.message);

    const userIds = [...new Set((data ?? []).map((r) => r.user_id))].slice(0, MAX_USERS_PER_RUN);
    stats.usuarios = userIds.length;

    for (const userId of userIds) {
      try {
        const r = await extractMemoryForUser(userId, { db, userId }, desde);
        stats.extraidos += r.extraidos;
        stats.dedupeados += r.dedupeados;
        stats.archivados += r.archivados;
      } catch (err) {
        stats.fallidos += 1;
        logger.warn("memoria: extracción de un usuario falló", {
          message: err instanceof Error ? err.message : "?",
        });
      }
    }
  } catch (err) {
    logger.warn("memoria: el batch no pudo arrancar", {
      message: err instanceof Error ? err.message : "?",
    });
  }
  logger.info("memoria.extraccion", stats);
  return stats;
}

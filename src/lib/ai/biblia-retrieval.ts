import "server-only";

/**
 * Recuperación de la Biblia conductual (Fase 2b-2): emoción dominante DETERMINISTA + temas por
 * similitud SEMÁNTICA (embedding de la consulta × biblia_chunks vía RPC coseno). Cae a keyword
 * ante cualquier problema (sin key, corpus vacío, sin sesión, 0 matches, error) — NUNCA propaga.
 */
import { embedTexts } from "@/lib/ai/providers/gemini";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { bibliaEmotionRule, selectBibliaTopicsKeyword } from "@/lib/ai/biblia-knowledge";
import { logger } from "@/lib/logger";

/** Umbral mínimo de similitud de coseno para aceptar un chunk semántico (tuneable). */
const MIN_SIM = 0.5;
const MATCH_COUNT = 3;
const MAX_TOPICS = 2; // mismos 2 temas que la recuperación keyword
const MAX_TOTAL = 3; // emoción + hasta 2 temas

/** Temas por similitud semántica. Lanza si no hay nada utilizable → el caller cae a keyword. */
async function semanticTopics(text: string): Promise<string[]> {
  const [queryEmbedding] = await embedTexts([text], "RETRIEVAL_QUERY");
  if (!queryEmbedding) throw new Error("sin embedding");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("match_biblia_chunks", {
    query_embedding: queryEmbedding,
    match_count: MATCH_COUNT,
    min_similarity: MIN_SIM,
  });
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("sin matches");
  return data.slice(0, MAX_TOPICS).map((d) => d.content);
}

/**
 * Guía aplicable: 1 por emoción (determinista) + hasta 2 temas (semántico → fallback keyword).
 * Mismo tope (máx 3) y forma que la recuperación anterior, para no inflar el prompt.
 */
export async function retrieveBiblia(p: { emotion?: string; text?: string }): Promise<string[]> {
  const out: string[] = [];
  const er = bibliaEmotionRule(p.emotion);
  if (er) out.push(er);

  const text = p.text?.trim();
  let modo: "semantico" | "keyword" = "keyword";
  if (text) {
    try {
      out.push(...(await semanticTopics(text)));
      modo = "semantico";
    } catch {
      out.push(...selectBibliaTopicsKeyword(text));
    }
  }
  logger.info("biblia-retrieval", { modo });
  return out.slice(0, MAX_TOTAL);
}

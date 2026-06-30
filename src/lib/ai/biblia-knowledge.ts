/**
 * Recuperación determinista de conocimiento conductual (la "Biblia"), sin
 * embeddings ni pgvector: un mapa curado por emoción dominante + tema del mensaje.
 * Puro y testeable. Devuelve hasta 3 fragmentos para no inflar el prompt.
 *
 * La DATA cruda vive en biblia-corpus.ts (compartida con el sembrado semántico);
 * acá solo está la lógica de recuperación keyword (sin cambio de comportamiento).
 */
import {
  EMOTION_RULES,
  TOPIC_CHUNKS,
  PATRIMONIO_GUIDANCE,
} from "@/lib/ai/biblia-corpus";

/**
 * Quita acentos y pasa a minúsculas para que el match tolere "inversión",
 * "INVERSION" e "inversion" por igual. Las keys del catálogo se guardan YA
 * normalizadas (sin acentos), así sólo hace falta normalizar el texto del usuario.
 */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Mapea banderas patrimoniales (§15) a su guía. Máx 3, sin repetir, ignora desconocidas. */
export function selectPatrimonioGuidance(flags: string[]): string[] {
  const out: string[] = [];
  for (const f of flags) {
    if (out.length >= 3) break;
    const g = PATRIMONIO_GUIDANCE[f];
    if (g && !out.includes(g)) out.push(g);
  }
  return out;
}

/** Selecciona la guía aplicable: 1 por emoción + hasta 2 por tema (máx 3). */
export function selectBibliaKnowledge(p: { emotion?: string; text?: string }): string[] {
  const out: string[] = [];
  if (p.emotion && EMOTION_RULES[p.emotion]) out.push(EMOTION_RULES[p.emotion]!);
  const text = normalize(p.text ?? "");
  let topics = 0;
  for (const t of TOPIC_CHUNKS) {
    if (topics >= 2) break;
    if (t.keys.some((k) => text.includes(k))) {
      out.push(t.chunk);
      topics++;
    }
  }
  return out; // máx 3 fragmentos → no infla el prompt
}

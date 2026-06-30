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

/** Guía por emoción dominante (determinista, NO semántica). null si no aplica. */
export function bibliaEmotionRule(emotion?: string): string | null {
  return emotion && EMOTION_RULES[emotion] ? EMOTION_RULES[emotion]! : null;
}

/** Hasta 2 temas por keyword (includes() sobre texto normalizado), SIN la emoción. */
export function selectBibliaTopicsKeyword(text?: string): string[] {
  const t = normalize(text ?? "");
  const out: string[] = [];
  let topics = 0;
  for (const chunk of TOPIC_CHUNKS) {
    if (topics >= 2) break;
    if (chunk.keys.some((k) => t.includes(k))) {
      out.push(chunk.chunk);
      topics++;
    }
  }
  return out;
}

/** Selecciona la guía aplicable: 1 por emoción + hasta 2 por tema keyword (máx 3). */
export function selectBibliaKnowledge(p: { emotion?: string; text?: string }): string[] {
  const out: string[] = [];
  const er = bibliaEmotionRule(p.emotion);
  if (er) out.push(er);
  out.push(...selectBibliaTopicsKeyword(p.text));
  return out; // máx 3 fragmentos → no infla el prompt
}

import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import type { AIProvider } from "@/lib/ai/provider";

/**
 * Arnés compartido de los evals VIVOS (dorados + difíciles). Centraliza:
 *   - el provider del modelo BAJO PRUEBA (EVAL_MODEL),
 *   - un JUEZ FIJO y fuerte (EVAL_JUDGE_MODEL) — el MISMO para todos los candidatos, en vez de
 *     que el modelo bajo prueba se juzgue a sí mismo (self-judge ruidoso), y
 *   - puntaje del juez PROMEDIADO sobre varias corridas, para cortar el ruido del juez.
 *
 * Todo detrás de RUN_LIVE_EVALS: sin esa env los evals se saltan y nada de esto se instancia.
 */
export const RUN_LIVE = !!process.env.RUN_LIVE_EVALS;
export const USE_JUDGE = !!process.env.EVAL_JUDGE;
export const EVAL_MODEL = process.env.EVAL_MODEL; // undefined → modelo por defecto del provider

/**
 * Juez FIJO por defecto: el modelo de razonamiento tope disponible con la key actual
 * (confirmado vía GET /v1beta/models). Configurable con EVAL_JUDGE_MODEL para reproducibilidad.
 */
export const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL || "gemini-3.1-pro-preview";
/** Corridas del juez a promediar por caso (los deterministas usan 1). */
export const JUDGE_RUNS = Number(process.env.EVAL_JUDGE_RUNS ?? 3);

/** Provider del modelo bajo prueba (solo en modo vivo). */
export function makeModelProvider(): AIProvider | undefined {
  return RUN_LIVE ? (createGeminiProvider(EVAL_MODEL) ?? undefined) : undefined;
}

/** Provider del JUEZ fijo (solo si además EVAL_JUDGE=1). Independiente del modelo bajo prueba. */
export function makeJudgeProvider(): AIProvider | undefined {
  return RUN_LIVE && USE_JUDGE ? (createGeminiProvider(JUDGE_MODEL) ?? undefined) : undefined;
}

const JUDGE_SYSTEM =
  "Sos un evaluador estricto e imparcial de un asesor financiero. Puntuá 1 si la respuesta CUMPLE " +
  "la rúbrica, 0 si NO la cumple. Respondé SOLO el dígito 1 o 0, sin explicaciones.";

/**
 * Puntúa una transcripción con el JUEZ FIJO, promediando `runs` corridas (0..1). Con 3 corridas,
 * el promedio ∈ {0, 0.33, 0.67, 1}: ≥0.5 equivale a mayoría de jueces a favor. Sin juez → 0.
 */
export async function judgeAveraged(
  judgeProvider: AIProvider | undefined,
  rubric: string,
  transcript: string,
  runs: number = JUDGE_RUNS,
): Promise<number> {
  if (!judgeProvider) return 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < runs; i += 1) {
    const { text } = await judgeProvider.chat({
      system: JUDGE_SYSTEM,
      messages: [
        { role: "user", content: `RÚBRICA: ${rubric}\n\nTRANSCRIPCIÓN:\n${transcript}\n\nPuntaje (0 o 1):` },
      ],
      // Amplio a propósito: un juez de razonamiento (p. ej. *-pro) consume tokens de thinking
      // antes de emitir el dígito; con un tope chico se truncaría y devolvería vacío.
      maxTokens: 2048,
    });
    const m = text.match(/[01](?:\.\d+)?/);
    if (m?.[0]) {
      sum += Number(m[0]);
      n += 1;
    }
  }
  return n > 0 ? Math.round((sum / n) * 100) / 100 : 0;
}

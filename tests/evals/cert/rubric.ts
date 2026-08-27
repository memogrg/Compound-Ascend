/**
 * Graded 0-5 judge for the SUBJECTIVE dimensions (the objective ones are covered by the
 * deterministic grounding/contradiction checks). Reuses the eval-harness's fixed strong
 * judge provider + N-run averaging pattern; adds a JSON multi-dimension rubric and
 * mean/worst-10/best-10 statistics. The judge is fed the REAL context digest + the
 * suite's expected red-flags so it scores grounded, not by eye.
 */
import type { AIProvider } from "@/lib/ai/provider";
import {
  SUBJECTIVE_DIMS,
  isConditionalDim,
  type RubricScores,
  type SubjectiveDim,
  type AuditOutput,
} from "./types";

/**
 * The CHARTER-encoding judge. Anchored (0/3/5), aware of the four CONDITIONAL dims that
 * may be "NA", and explicit that a well-placed clarifying question is EXCELLENT (fixing
 * the artifact that scored it ~0). STRICT: 5 is reserved for a genuinely excellent advisor,
 * so it must reveal gaps (proactividad ~0 on the current advisor), not inflate.
 */
const JUDGE_SYSTEM = [
  "Sos un evaluador experto, estricto e imparcial, de un asesor financiero personal.",
  "El estándar es un asesor EXIGENTE Y CÁLIDO: guía sin juzgar; consulta cuando faltan datos;",
  "aconseja con pasos concretos y CUANTIFICADOS (₡ exactos, entidad nombrada); VOLUNTEA alarmas",
  "cuando los datos muestran un daño real (deuda cara, sobregiro, fondo de emergencia vacío) con su",
  "costo y su salida; da highlights de progreso real; confronta hábitos dañinos con firmeza + empatía,",
  "NUNCA con vergüenza; y siempre se apoya en datos reales.",
  "",
  "Puntuás CADA dimensión de 0 a 5 con estas anclas: 0 = pésimo/ausente, 3 = aceptable pero mejorable,",
  "5 = excelente de verdad. Sé duro: reservá el 5 para el asesor realmente excelente.",
  "",
  "CINCO dimensiones se puntúan SIEMPRE:",
  "- relevancia: responde EXACTO la última consulta, sin irse por las ramas.",
  "- personalizacion: usa las palancas REALES del usuario (sus ₡, su deuda/meta/sobre por nombre), no genérico.",
  "- prioridad: ataca primero lo que más mueve la aguja (deuda cara / fondo de defensa), en el orden correcto.",
  "- conciencia_temporal: respeta el historial real; no inventa pasado ni ignora la trayectoria.",
  "- explicacion_y_tono: el porqué claro al nivel del usuario, cálido y sin culpa ni sermón.",
  "",
  'CUATRO dimensiones son CONDICIONALES: si el turno NO las amerita, devolvé la cadena "NA"',
  "(no las inventes ni las castigues con 0):",
  "- accionabilidad: cierra con un paso CUANTIFICADO (₡ + entidad) Y lo conecta con el OBJETIVO con un",
  "    HORIZONTE (es lo que separa un coach-mentor de un cajero). Escala EXIGENTE:",
  "    · 5 = ₡ exacto + entidad + tap/paso del dominio Y horizonte hacia la meta ('aboná ₡X → salís N",
  "      meses antes / ahorrás ₡Y de interés' · 'a ₡X/mes llegás a tu meta en [fecha]').",
  "    · 3 = ₡ + entidad (paso concreto) pero SIN horizonte ni conexión al objetivo (el bar viejo).",
  "    · 0-1 = vago, sin monto, o sin acción ('deberías ahorrar más').",
  "    El horizonte debe ser REAL (del contexto); si el asesor NO tenía el dato del horizonte, un cierre",
  "    ₡+entidad+tap sólido puede llegar a 4, no lo castigues por lo que no podía saber.",
  '    "NA" cuando el turno NO ameritaba una acción: una consulta puramente informativa o fuera de tema,',
  "    una pregunta aclaratoria legítima (esa se puntúa en consulta_apropiada, no acá), o un turno de puro",
  "    reconocimiento/highlight sin decisión pendiente. PERO si el turno SÍ debía cerrar con un paso (una",
  "    consulta de enfoque '¿en qué me concentro?', una recomendación, una CONFRONTACIÓN de un hábito), NO",
  "    es NA: un cierre sin horizonte es 3, sin acción concreta es 0-1. La confrontación NUNCA es NA acá.",
  "    REGLA DURA: en un turno que AMERITA una acción, NUNCA devuelvas 'NA' — si no cerró con un paso,",
  "    es 0-1 (cierre ausente), no una exclusión. 'NA' es SOLO para los turnos que no ameritan acción.",
  "- consulta_apropiada: faltaba un dato clave y hace UNA pregunta corta y correcta en vez de asumir.",
  '    Una pregunta aclaratoria bien puesta es EXCELENTE (5), no un defecto. "NA" si no faltaba ningún dato.',
  "- proactividad: los datos muestran un daño o una fortaleza real relevante y lo VOLUNTEA (alarma con",
  '    costo + salida, o highlight), sin alarmismo. Puntuá BAJO el silencio ante una señal clara. "NA" si',
  "    no había nada que ameritara volunteo.",
  "- confrontacion_calida: ante un hábito dañino confronta con firmeza + empatía y empuja a UN paso, sin",
  '    vergüenza. "NA" si no había un hábito que confrontar.',
  "",
  "Fundamentá con el CONTEXTO REAL y las BANDERAS ESPERADAS que se te dan; no puntúes a ojo.",
  "Respondé SOLO un objeto JSON con las 9 claves (relevancia, personalizacion, prioridad, accionabilidad,",
  "consulta_apropiada, proactividad, confrontacion_calida, conciencia_temporal, explicacion_y_tono),",
  'cada valor un entero 0-5 o la cadena "NA". Sin texto extra.',
].join("\n");

const SLEEP_MS = 900;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Parse one run: integers 0-5, or "NA" (valid ONLY for conditional dims). Discards the whole
 *  run if an ALWAYS-scored dim is missing/non-numeric — an incomplete run must not skew the mean. */
function parseScores(text: string): RubricScores | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const out = {} as RubricScores;
  for (const dim of SUBJECTIVE_DIMS) {
    const raw = obj[dim];
    const isNA = typeof raw === "string" && raw.trim().toUpperCase() === "NA";
    if (isNA) {
      if (!isConditionalDim(dim)) return null; // "NA" on an always-scored dim → malformed run
      out[dim] = "NA";
      continue;
    }
    const v = Number(raw);
    if (!Number.isFinite(v)) return null; // incomplete run → discard
    out[dim] = Math.max(0, Math.min(5, v));
  }
  return out;
}

export interface JudgeInput {
  prompt: string;
  reply: string;
  contextDigest: string;
  expectedRedFlags: string[];
}

/** Reintentos de RESCATE si los `runs` planeados fallan TODOS (hipos del juez -pro de baja RPM):
 *  hasta este tope de intentos extra, con backoff mayor, parando en el primer éxito. Cap duro =
 *  runs + RESCUE_MAX, sin bucles infinitos. Sube la cobertura (outputs puntuados) sin costo desbordado. */
const RESCUE_MAX = 2;
const RESCUE_BACKOFF_MS = 2500;

/** Average the rubric over `runs` judge calls (+ bounded rescue if all fail); null if all attempts fail.
 *  `timing` permite 0 en tests para no dormir; en producción usa los defaults. */
export async function judgeRubric(
  judge: AIProvider | undefined,
  input: JudgeInput,
  runs: number,
  timing: { sleepMs?: number; rescueMs?: number } = {},
): Promise<RubricScores | null> {
  if (!judge) return null;
  const sleepMs = timing.sleepMs ?? SLEEP_MS;
  const rescueMs = timing.rescueMs ?? RESCUE_BACKOFF_MS;
  const user = [
    `PREGUNTA DEL USUARIO:\n${input.prompt}`,
    `\nCONTEXTO FINANCIERO REAL (resumen):\n${input.contextDigest}`,
    input.expectedRedFlags.length
      ? `\nBANDERAS ESPERADAS (un buen asesor las respeta):\n- ${input.expectedRedFlags.join("\n- ")}`
      : "",
    `\nRESPUESTA DEL ASESOR A EVALUAR:\n${input.reply}`,
    `\nDevolvé el JSON de puntajes 0-5:`,
  ].join("\n");

  const numeric = {} as Record<SubjectiveDim, number[]>;
  const naCount = {} as Record<SubjectiveDim, number>;
  for (const d of SUBJECTIVE_DIMS) {
    numeric[d] = [];
    naCount[d] = 0;
  }
  let n = 0;
  // Un intento: acumula un set válido de puntajes (o lo ignora ante hipo del proveedor).
  const attempt = async (): Promise<void> => {
    try {
      const res = await judge.chat({
        system: JUDGE_SYSTEM,
        messages: [{ role: "user", content: user }],
        maxTokens: 2048,
      });
      const scores = parseScores(res.text);
      if (scores) {
        n += 1;
        for (const d of SUBJECTIVE_DIMS) {
          const v = scores[d];
          if (v === "NA") naCount[d] += 1;
          else numeric[d].push(v);
        }
      }
    } catch {
      // transient judge outage on the low-RPM -pro model → skip this attempt
    }
  };
  // Intentos planeados.
  for (let i = 0; i < runs; i++) {
    await attempt();
    if (i < runs - 1) await sleep(sleepMs);
  }
  // Rescate acotado: SOLO si los planeados fallaron todos; para apenas uno tiene éxito.
  for (let r = 0; n === 0 && r < RESCUE_MAX; r++) {
    await sleep(rescueMs);
    await attempt();
  }
  if (n === 0) return null;
  const avg = {} as RubricScores;
  for (const d of SUBJECTIVE_DIMS) {
    const nums = numeric[d];
    // A CONDITIONAL dim collapses to "NA" only when a MAJORITY of accepted runs said "NA"
    // (a tie scores it). Always-scored dims are numeric by parse, so this never triggers.
    if ((isConditionalDim(d) && naCount[d] > nums.length) || nums.length === 0) {
      avg[d] = "NA";
    } else {
      avg[d] = Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 10) / 10;
    }
  }
  return avg;
}

// ---- Statistics ----

/** Numeric dim values of one output (drops "NA"). */
function numericDims(o: AuditOutput): number[] {
  if (!o.rubric) return [];
  return SUBJECTIVE_DIMS.map((d) => o.rubric![d]).filter((v): v is number => typeof v === "number");
}

/**
 * Política DETERMINISTA de accionabilidad (Paso 3.8/3.9): la decide lo que el turno AMERITA, no la
 * discreción del juez (que sub-aplica el NA en ambas direcciones). Muta `rubric` in place.
 *  · expectsAction === false (adversarial/highlights) → accionabilidad = "NA" (turno no-acción).
 *  · turno accionable (expectsAction true/undefined) con NA-del-juez → 1 (cierre ausente): NUNCA se
 *    excluye un turno que debía cerrar, así no infla el promedio.
 * El resto (un score numérico del juez en un turno accionable) queda intacto.
 */
export function applyAccionabilidadPolicy(
  rubric: RubricScores,
  expectsAction: boolean | undefined,
): void {
  if (expectsAction === false) rubric.accionabilidad = "NA";
  else if (rubric.accionabilidad === "NA") rubric.accionabilidad = 1;
}

/** Composite score of one output = mean of its APPLICABLE (non-NA) dims. null if no rubric. */
export function compositeScore(o: AuditOutput): number | null {
  const vals = numericDims(o);
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100;
}

export interface RubricStats {
  count: number; // outputs with a rubric
  /** Mean over the outputs where the dim APPLIED (non-NA); null if it never applied. */
  meanByDim: Record<SubjectiveDim, number | null>;
  /** How many scored outputs had each dim applicable (non-NA) — surfaces "aplicó en k/N". */
  applicableByDim: Record<SubjectiveDim, number>;
  overallMean: number;
  worst: { output: AuditOutput; score: number }[];
  best: { output: AuditOutput; score: number }[];
}

export function computeStats(outputs: AuditOutput[], topN = 10): RubricStats {
  const scored = outputs
    .map((o) => ({ output: o, score: compositeScore(o) }))
    .filter((x): x is { output: AuditOutput; score: number } => x.score !== null);
  const meanByDim = {} as Record<SubjectiveDim, number | null>;
  const applicableByDim = {} as Record<SubjectiveDim, number>;
  for (const d of SUBJECTIVE_DIMS) {
    const vals = scored
      .map((x) => x.output.rubric![d])
      .filter((v): v is number => typeof v === "number");
    applicableByDim[d] = vals.length;
    meanByDim[d] = vals.length
      ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100
      : null;
  }
  const overallMean = scored.length
    ? Math.round((scored.reduce((s, x) => s + x.score, 0) / scored.length) * 100) / 100
    : 0;
  const byScore = [...scored].sort((a, b) => a.score - b.score);
  return {
    count: scored.length,
    meanByDim,
    applicableByDim,
    overallMean,
    worst: byScore.slice(0, topN),
    best: byScore.slice(-topN).reverse(),
  };
}

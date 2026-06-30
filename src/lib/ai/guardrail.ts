/**
 * Guardrail post-generación de la IA: red determinista que revisa la respuesta YA
 * generada y, SIN mutilarla, añade una línea de corrección/disclaimer cuando detecta
 * patrones de riesgo. Conservador (alta precisión), idempotente (no re-agrega notas) y
 * PURO (sin IO) — la seguridad deja de depender solo del system prompt.
 *
 * No reemplaza la regla de oro (la IA propone, no ejecuta): solo acota lo que dice.
 */
import { normalize } from "@/lib/ai/biblia-knowledge";

export type GuardrailContext = {
  hasEmergencyFund?: string; // "si" | "no" | "no_se" | … (auto-reportado por el usuario)
  urgency?: string; // "baja" | "media" | "alta" | "critica"
  dependentsCount?: number;
  emergencyMonths?: number; // respaldo REAL computado (meses de independencia); pisa al auto-reporte
};

export type GuardrailResult = { reply: string; flags: string[] };

// Notas que se anexan (texto exacto → idempotencia por includes()). Voz de CARTERA+:
// el consejo es de CARTERA+; la decisión y ejecución quedan en el usuario.
export const NOTE_RETURNS =
  "CARTERA+: ninguna inversión garantiza rendimientos; la decisión final es tuya.";
export const NOTE_FISCAL =
  "CARTERA+: es orientación general; para tu caso fiscal/legal, confirmá con un profesional.";
export const NOTE_RISK_BASE =
  "CARTERA+: conviene asegurar tu fondo de emergencia antes de invertir — vos decidís el paso.";

// R1 — promesas de rendimiento (regex sobre texto normalizado: sin acentos, minúsculas).
const PROMISED_RETURNS = [
  /garantiz/, // garantiza / garantizado / garantizar
  /rendimiento asegurado/,
  /sin riesgo/,
  /seguro (vas a )?gan/, // "seguro vas a ganar" / "seguro ganas"
  /\d+\s*%\s*(asegurado|garantizado)/,
  /retorno (seguro|asegurado|garantizado)/,
];

// R2 — fiscal/legal con tono directivo (tema + verbo directivo).
const FISCAL_TOPIC = /impuesto|hacienda|herencia|tributa|sucesion|\brenta\b|fiscal|legal/;
const DIRECTIVE =
  /deber[ií]as|ten[ée]s que|tienes que|debes|convien|declar|deduc|no pagu|exent|aprovech|report/;

// R3 — recomendación de invertir/asumir riesgo (tema de inversión + verbo de recomendación).
const INVEST = /invert|acciones|bolsa|cripto|etf|fondo de inversion|asumir riesgo|tomar (mas )?riesgo|arriesg/;
const RECOMMEND = /recomiend|deber[ií]as|convien|sugier|te conviene|empez/;

/**
 * Revisa `reply` y, según ctx, anexa correcciones de seguridad. Devuelve el texto
 * (posiblemente con notas) y las flags de las reglas que dispararon.
 */
export function applyGuardrail(reply: string, ctx: GuardrailContext = {}): GuardrailResult {
  const t = normalize(reply);
  const flags: string[] = [];
  let out = reply;

  /** Marca la flag y anexa la nota una sola vez (idempotente). */
  const fire = (note: string, flag: string): void => {
    flags.push(flag);
    if (!out.includes(note)) out = `${out.trimEnd()}\n\n${note}`;
  };

  // R1 — rendimientos garantizados.
  if (PROMISED_RETURNS.some((re) => re.test(t))) fire(NOTE_RETURNS, "promised_returns");

  // R2 — fiscal/legal directivo.
  if (FISCAL_TOPIC.test(t) && DIRECTIVE.test(t)) fire(NOTE_FISCAL, "fiscal_legal");

  // R3 — riesgo sin base (recomienda invertir y no hay colchón / urgencia alta). Si el respaldo
  // REAL computado (emergencyMonths) ya cubre ≥3 meses (fondo de paz, Biblia), NO disparamos
  // aunque el auto-reporte diga "no": la señal computada pisa al campo auto-reportado.
  const tieneBaseReal = ctx.emergencyMonths != null && ctx.emergencyMonths >= 3;
  const sinBase =
    !tieneBaseReal &&
    (ctx.hasEmergencyFund === "no" ||
      ctx.hasEmergencyFund === "no_se" ||
      ctx.urgency === "alta" ||
      ctx.urgency === "critica");
  if (sinBase && INVEST.test(t) && RECOMMEND.test(t)) fire(NOTE_RISK_BASE, "risk_without_base");

  return { reply: out, flags };
}

/**
 * COMPLETADO DETERMINISTA post-generación (Paso 3.10). Dos garantías que el prompt estocástico no dio
 * (falló 4 veces): el HORIZONTE tejido en el cierre y la CONFRONTACIÓN del sobre nombrado. Todo acá es
 * PURO (sin IO): el orquestador engancha esto DESPUÉS de los guards de seguridad, solo sobre respuestas
 * NO bloqueadas. Las cifras salen del contexto del engine (grounded); nunca se inventan.
 *
 *  - `completarHorizonte`: si el cierre recomienda una acción (deuda/fondo/meta) cuyo horizonte YA está
 *    en el contexto pero NO quedó tejido, lo agrega. Solo COMPLETA: nunca toca lo que ya lo trae.
 *  - `deflectoSobre` + `plantillaRestaurantes`: detectan la deflexión (no citó la cifra del sobre) y dan
 *    la plantilla determinista grounded (tope = mitad → grounding-safe por el divisor ÷2 del checker).
 */
import { extractMoneyFigures, near } from "@/lib/ai/money-figures";
import type { AIActionProposal, AIChatResponse } from "@/lib/ai/types";
import type { FinancialContext } from "@/lib/ai/system-prompt";
import type {
  DebtProjection,
  ExpenseSobreLever,
  FundEta,
  GoalLever,
} from "@/lib/ai/context-levers";

/** Minúsculas + sin acentos (para comparar nombres de deuda/meta/sobre dentro del texto). */
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** ¿El reply cita el conteo de meses `n` (p.ej. "56 meses")? Los conteos NO son cifras-dinero (el
 *  checker de grounding las ignora), así que van por regex ESTÁTICA (sin RegExp dinámico → sin ReDoS):
 *  extraemos todos los "<n> mes…" y comparamos el número. */
const MESES_RE = /\b(\d{1,4})\s*mes/gi;
function contieneMeses(reply: string, n: number): boolean {
  for (const m of reply.matchAll(MESES_RE)) {
    if (Number(m[1]) === n) return true;
  }
  return false;
}

// Verbos que marcan el DOMINIO del cierre (aproximan "esto es un cierre de acción", no una consulta).
const VERBO_ABONO = /(abon|amortiz|liquid|salda|pag(?:á|a|ar|ale|arle|o|ue))/i;
// `aport|automatiz` incluidos: el cierre de fondo más común del asesor es "automatizá un APORTE a tu
// fondo" — sin ellos, `esCierreFondo` no lo detectaba por prosa y perdía el append del horizonte cuando
// el LLM no lo tejía (Paso A, endurece la red; el LLM ya suele tejerlo, así que no mueve el número).
const VERBO_AHORRO = /(apart|aport|automatiz|ahorr|guard|destin|reserv|separ)/i;
const VERBO_APORTE = /(aport|apart|ahorr|guard|sum|destin)/i;

/** Nombre de la acción estructurada (varios alias de payload), normalizado. "" si no hay. */
function nombreDeAccion(action: AIActionProposal | null | undefined): string {
  const p = action?.payload ?? {};
  const raw = p["name"] ?? p["nombre"] ?? p["debtName"] ?? p["debt"] ?? "";
  return typeof raw === "string" ? normalizar(raw) : "";
}

// ── DEUDA ────────────────────────────────────────────────────────────────────────────────────────
/** La proyección de deuda que el cierre está atacando (acción estructurada manda; si no, verbo + nombre
 *  en el texto). undefined si el turno no cierra una deuda del contexto. */
function elegirDeuda(
  reply: string,
  action: AIActionProposal | null,
  projs: DebtProjection[],
): DebtProjection | undefined {
  if (projs.length === 0) return undefined;
  const r = normalizar(reply);
  const enReply = (p: DebtProjection): boolean => r.includes(normalizar(p.name));
  if (action?.type === "debt_extra_payment") {
    const nom = nombreDeAccion(action);
    const byName = nom ? projs.find((p) => normalizar(p.name) === nom) : undefined;
    return byName ?? projs.find(enReply) ?? projs[0];
  }
  if (!VERBO_ABONO.test(reply)) return undefined;
  return projs.find(enReply);
}

/** ¿El horizonte de esa deuda ya está tejido? TRES señales (evita doble-append): (1) el monto de interés
 *  ahorrado citado, (2) el conteo de meses, (3) una frase genérica de horizonte. */
function deudaTejida(reply: string, d: DebtProjection): boolean {
  const figs = extractMoneyFigures(reply);
  if (d.interestSaved > 0 && figs.some((f) => near(f, d.interestSaved))) return true;
  if (contieneMeses(reply, d.monthsSaved)) return true;
  return /meses antes|antes de lo previsto|antes de lo que/i.test(reply);
}

/** "1 mes" / "N meses" — evita el "(1 meses)" que quedaba al pluralizar sin condición. */
function mesesLabel(n: number): string {
  return `${n} ${n === 1 ? "mes" : "meses"}`;
}

function fraseDeuda(d: DebtProjection): string {
  const interes =
    d.interestSaved > 0 ? ` y ahorrás ~${d.interestSaved} ${d.currency} de interés` : "";
  return `Con ese abono salís ${mesesLabel(d.monthsSaved)} antes${interes}.`;
}

// ── FONDO ────────────────────────────────────────────────────────────────────────────────────────
function esCierreFondo(reply: string, action: AIActionProposal | null): boolean {
  if (action?.type === "create_goal" && /fondo|emergencia|colch/.test(nombreDeAccion(action)))
    return true;
  const r = normalizar(reply);
  return /fondo de emergencia|colchon/.test(r) && VERBO_AHORRO.test(reply);
}

/** ¿El horizonte del fondo ya está tejido? Etiqueta ("julio 2026") como substring, o mes+año sueltos,
 *  o el conteo de meses. */
function fondoTejido(reply: string, f: FundEta): boolean {
  const r = reply.toLowerCase();
  const label = f.etaLabel.toLowerCase();
  if (r.includes(label)) return true;
  const [mes, anio] = f.etaLabel.split(" ");
  if (mes && anio && r.includes(mes.toLowerCase()) && r.includes(anio)) return true;
  return contieneMeses(reply, f.monthsToTarget);
}

function fraseFondo(f: FundEta): string {
  return `A ese ritmo, tu fondo de emergencia queda cubierto para ${f.etaLabel} (${mesesLabel(f.monthsToTarget)}).`;
}

// ── META ─────────────────────────────────────────────────────────────────────────────────────────
function elegirMeta(
  reply: string,
  action: AIActionProposal | null,
  goals: GoalLever[],
): GoalLever | undefined {
  const conEta = goals.filter((g) => g.etaAtPace);
  if (conEta.length === 0) return undefined;
  const r = normalizar(reply);
  if (action?.type === "create_goal") {
    const nom = nombreDeAccion(action);
    const byName = nom ? conEta.find((g) => normalizar(g.name) === nom) : undefined;
    if (byName) return byName;
  }
  if (!VERBO_APORTE.test(reply)) return undefined;
  return conEta.find((g) => r.includes(normalizar(g.name)));
}

function metaTejida(reply: string, g: GoalLever): boolean {
  if (!g.etaAtPace) return true;
  const r = reply.toLowerCase();
  const label = g.etaAtPace.toLowerCase();
  if (r.includes(label)) return true;
  const [mes, anio] = g.etaAtPace.split(" ");
  if (mes && anio && r.includes(mes.toLowerCase()) && r.includes(anio)) return true;
  return g.monthsAtPace !== undefined && contieneMeses(reply, g.monthsAtPace);
}

function fraseMeta(g: GoalLever): string {
  return `A tu ritmo, llegás a esa meta en ${g.etaAtPace}.`;
}

/** El horizonte que FALTA tejer en este cierre, o undefined si no aplica (no cierra un dominio, no hay
 *  horizonte en el contexto, o YA está tejido). UN solo dominio: se resuelve por precedencia deuda →
 *  fondo → meta, y si el dominio detectado ya lo trae, no se cae a otro. */
export function horizonteFaltante(
  reply: string,
  action: AIActionProposal | null,
  ctx: FinancialContext,
): string | undefined {
  const d = elegirDeuda(reply, action, ctx.debtProjections ?? []);
  if (d) return deudaTejida(reply, d) ? undefined : fraseDeuda(d);
  if (esCierreFondo(reply, action)) {
    if (!ctx.fundEta) return undefined;
    return fondoTejido(reply, ctx.fundEta) ? undefined : fraseFondo(ctx.fundEta);
  }
  const g = elegirMeta(reply, action, ctx.goals ?? []);
  if (g) return metaTejida(reply, g) ? undefined : fraseMeta(g);
  return undefined;
}

/** Inserta `frase` como oración propia, ANTES de la pregunta-CTA final si el cierre termina en "¿…?"
 *  (para que "…? Con ese abono…" no lea al revés); si no, al final. El límite de la oración-pregunta
 *  se busca en un separador de oración REAL (puntuación + espacio), NUNCA en un punto de miles: sin esto,
 *  "…de ₡550.000?" partía el número en "₡550. [frase] 000?" (bug del Paso 3.10 que el spot-check cazó). */
function insertarAntesDePreguntaFinal(reply: string, frase: string): string {
  const t = reply.trimEnd();
  if (!t.endsWith("?")) return `${t} ${frase}`;
  // Último límite de oración real: `.!?` seguido de espacio (el "." de "550.000" NO lo es → no parte).
  let cut = 0;
  const re = /[.!?]\s+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) cut = m.index + m[0].length;
  const before = t.slice(0, cut).trimEnd();
  const question = t.slice(cut).trim();
  if (!question) return `${t} ${frase}`;
  return before ? `${before} ${frase} ${question}` : `${frase} ${question}`;
}

/**
 * Completa el HORIZONTE del cierre cuando falta (Paso 3.10-B). PURO. Solo agrega una frase grounded del
 * contexto; nunca reemplaza ni recalcula. Si no hay horizonte que completar, devuelve la respuesta igual.
 */
export function completarHorizonte(resp: AIChatResponse, ctx: FinancialContext): AIChatResponse {
  if (!resp.reply || !resp.reply.trim()) return resp;
  const frase = horizonteFaltante(resp.reply, resp.action, ctx);
  if (!frase) return resp;
  return { ...resp, reply: insertarAntesDePreguntaFinal(resp.reply, frase) };
}

// ── RESTAURANTES (confrontación de categoría) ──────────────────────────────────────────────────────
/**
 * ¿La respuesta DEFLECTÓ el sobre nombrado? Señal fuerte y de alta precisión: NO citó la cifra propia del
 * sobre (si confrontara bien, la citaría; si deflectó al total, cita otra). PURO.
 */
export function deflectoSobre(reply: string, foco: ExpenseSobreLever | undefined): boolean {
  if (!reply || !foco) return false;
  return !extractMoneyFigures(reply).some((f) => near(f, foco.monthly));
}

/** El destino grounded del ahorro liberado: la deuda prioritaria del contexto, si no el fondo, si no
 *  los ahorros. Sin cifras nuevas (no arriesga grounding). */
function destinoPrioritario(ctx: FinancialContext): string {
  const d = ctx.debtProjections?.[0];
  if (d) return `tu ${d.name}`;
  if (ctx.fundEta) return "tu fondo de emergencia";
  return "tus ahorros";
}

/**
 * Plantilla determinista de confrontación del sobre (Paso 3.10-A tier B): el piso garantizado cuando ni
 * el modelo ni el regen confrontan. Cálida (charter: firmeza sin shaming), cierra con un paso. Grounding:
 * el monto del sobre está en knownFigures y el tope = mitad (monto ÷ 2) matchea por el divisor ÷2 del
 * checker → cero cifras sin respaldo.
 */
export function plantillaRestaurantes(foco: ExpenseSobreLever, ctx: FinancialContext): string {
  const cur = ctx.currency ?? "";
  const tope = Math.round(foco.monthly / 2);
  const libera = foco.monthly - tope;
  const destino = destinoPrioritario(ctx);
  return (
    `Los ${foco.name} son ₡${foco.monthly} ${cur}/mes — y está bien, es tu gusto y no te lo voy a quitar. ` +
    `Pero pongámosle un carril: bajalo a ₡${tope} ${cur}/mes (la mitad) y esos ₡${libera} ${cur} que soltás ` +
    `van directo a ${destino}. Un solo cambio, sin perder el gusto. ¿Lo probamos este mes?`
  );
}

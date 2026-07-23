import "server-only";

/**
 * Router de IA por complejidad (R1). Abarata las CONSULTAS de dato: los intents comunes se
 * atrapan con patrones (CERO tokens) o con un clasificador Flash-Lite barato, se responden con
 * la cifra del MOTOR determinista (ToolContext, ya calculada) y una plantilla; el RAZONAMIENTO
 * (proyecciones, consejo, comparaciones) cae al modelo completo como hoy.
 *
 * PRINCIPIO: nunca degradar la comprensión para ahorrar tokens. Ante la mínima duda → null
 * (escala al razonamiento). La cifra SIEMPRE sale del motor; el modelo chico solo clasifica —
 * jamás inventa un número.
 *
 * Vive DENTRO de financeChatWithTools → cubre web y WhatsApp (ambos pasan por ahí).
 */
import { formatMoney } from "@/lib/format";
import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import type { AIChatResponse } from "@/lib/ai/types";
import type { FinancialContext, ToolContext } from "@/lib/ai/orchestrator";

/** Carril que resolvió la respuesta (para medir el ahorro de tokens). */
export type RouterLane = "template" | "lite" | "reasoning";

export type RoutedQuery = {
  response: AIChatResponse; // reply crudo (el orchestrator le aplica el guardrail)
  tokensIn: number;
  tokensOut: number;
  lane: RouterLane;
};

/** Modelo chico: mismo adaptador Gemini, solo cambia el string (sin integración nueva). */
const LITE_MODEL = "gemini-2.5-flash-lite";

type Intent =
  // R1 — datos ya en ToolContext (motor determinista):
  | "numero_libertad"
  | "metas"
  | "cuota_deuda"
  // R2 — datos ya en FinancialContext (ctx), 0 fetch, ambos canales:
  | "gasto_mes"
  | "ingreso_mes"
  | "gasto_categoria"
  // R2 — requieren lectura fresca (session-based → web; WhatsApp escala):
  | "saldo_liquidez"
  | "ultimos_movimientos"
  // Sobres agrupados por frasco (determinista, sin alucinar) — lectura fresca:
  | "listar_sobres";

const KNOWN_INTENTS: Intent[] = [
  "numero_libertad",
  "metas",
  "cuota_deuda",
  "gasto_mes",
  "ingreso_mes",
  "gasto_categoria",
  "saldo_liquidez",
  "ultimos_movimientos",
  "listar_sobres",
];

/** Intents cuyo dato NO está en ctx: se resuelven con lectura fresca (solo con sesión web). */
const FETCH_INTENTS: ReadonlySet<Intent> = new Set([
  "saldo_liquidez",
  "ultimos_movimientos",
  "listar_sobres",
]);

// Señales de RAZONAMIENTO: si aparecen, NO es una consulta simple → escalar. Es la red de
// seguridad de "ante duda, escalá": una pregunta de consejo/proyección nunca se atrapa por patrón.
const REASONING_CUES =
  /\bc[oó]mo\b|deber[ií]a|conviene|qu[eé] hago|estrategia|plan\b|recomend|proyec|si (?:invierto|aporto|abono|pago|ahorro)|abon|extra|escenario|comparar?|vs\.?|mejor opci|cu[aá]nto tendr[ií]a|\ben cu[aá]nto\b|en \d+\s*a[nñ]os|simula/i;

/** Extrae el nombre de una deuda tras el verbo, limpiando conectores ("de mi X" → "X"). */
function extractDebtName(text: string): string | null {
  const m = text.match(/(?:cuota|pago(?:\s+m[ií]nimo)?|cu[aá]nto pago)\s+(.+?)[\?\.!¿¡]*$/i);
  const name = m?.[1]?.replace(/^(?:de |del |de la |de mi |por |mi |la |el )+/i, "").trim();
  return name && name.length >= 2 ? name : null;
}

/** PATRONES: intent + params con CERO tokens. null si no matchea con confianza. */
export function matchIntent(text: string): { intent: Intent; params: Record<string, unknown> } | null {
  const t = text.trim();
  if (REASONING_CUES.test(t)) return null; // consejo/proyección → razonamiento

  if (/(?:cu[aá]l es\s+)?(?:mi\s+)?n[uú]mero de (?:libertad|independencia)|cu[aá]nto necesito para (?:ser libre|mi libertad)/i.test(t)) {
    return { intent: "numero_libertad", params: {} };
  }
  // Mejora 3 — "listá mis sobres/frascos/metas": enumeración agrupada por frasco (determinista).
  // Antes que `metas` (progreso): "sobres"/"frascos" son inequívocos; "cuáles/listá … metas" también.
  if (
    /\b(?:sobres|frascos)\b/i.test(t) ||
    /(?:cu[aá]les|list[aá]|mostr[aá]|ver|dame|enumer\w*)\s+(?:son\s+)?(?:todas?\s+)?(?:mis\s+)?metas\b/i.test(t)
  ) {
    return { intent: "listar_sobres", params: {} };
  }
  if (/progreso de (?:mi\s+)?ahorro|c[oó]mo va(?:n)? (?:mi|mis) (?:meta|ahorro)|cu[aá]nto llevo (?:ahorrado|en mis metas)|(?:mis)\s+metas\b/i.test(t)) {
    return { intent: "metas", params: {} };
  }
  if (/(?:cu[oó]ta|pago mensual|cu[aá]nto pago|pago m[ií]nimo)\b/i.test(t)) {
    return { intent: "cuota_deuda", params: { debtName: extractDebtName(t) } };
  }
  // R2 — gasto por categoría / dominante ("¿en qué gasto más?"). Antes que gasto_mes (más específico).
  if (/en qu[eé] (?:gasto|gast[eé])|(?:categor[ií]a|rubro).*(?:m[aá]s gasto|gasto)|(?:mayor|m[aá]s alto|principal) gasto|d[oó]nde se (?:va|van) (?:mi|el)/i.test(t)) {
    return { intent: "gasto_categoria", params: {} };
  }
  if (/(?:cu[aá]nto|qu[eé])\s+(?:gast[eéoó]|llevo gastado)|(?:mi|el)\s+gasto (?:del mes|mensual|este mes)|gast[eé] (?:este mes|en el mes)/i.test(t)) {
    return { intent: "gasto_mes", params: {} };
  }
  if (/(?:cu[aá]nto|qu[eé])\s+(?:gan[eéoó]|ingres[eéoó])|(?:mis|el|los)\s+ingresos?\b|cu[aá]nto (?:me )?entr[oó]/i.test(t)) {
    return { intent: "ingreso_mes", params: {} };
  }
  if (/(?:mi\s+)?(?:saldo|liquidez|efectivo disponible|cu[aá]nto (?:tengo|me queda))\b/i.test(t)) {
    return { intent: "saldo_liquidez", params: {} };
  }
  if (/(?:[uú]ltim[oa]s?|recientes?)\s+(?:movimiento|transacci|gasto|compra)|(?:mis|los)\s+(?:movimientos|transacciones)\b|qu[eé] (?:gast[eé]|compr[eé]) (?:hoy|ayer|[uú]ltim)/i.test(t)) {
    return { intent: "ultimos_movimientos", params: {} };
  }
  return null;
}

/** Clasificador Flash-Lite (solo cuando el patrón NO matchea). Barato. Devuelve null si no
 *  está seguro (intent desconocido/complejo/parseo fallido) → escalar al razonamiento. */
async function classifyWithLite(
  text: string,
): Promise<{ intent: Intent; params: Record<string, unknown>; tokensIn: number; tokensOut: number } | null> {
  const lite = createGeminiProvider(LITE_MODEL);
  if (!lite) return null;
  const system =
    "Clasificás preguntas de finanzas personales. Devolvé SOLO JSON " +
    '{"intent": "numero_libertad"|"metas"|"cuota_deuda"|"gasto_mes"|"ingreso_mes"|"gasto_categoria"|"saldo_liquidez"|"ultimos_movimientos"|"listar_sobres"|"otro", "complejo": true|false}. ' +
    "gasto_mes=cuánto gasta al mes; ingreso_mes=cuánto gana; gasto_categoria=en qué gasta más; " +
    "saldo_liquidez=cuánto tiene disponible; ultimos_movimientos=sus transacciones recientes; " +
    "listar_sobres=enumerar sus sobres/frascos/metas (no su progreso). metas=el progreso de sus metas. " +
    '"complejo": true si pide análisis, proyección, consejo, comparación o cualquier cosa más allá de consultar un dato simple. Ante duda: "otro" o complejo:true.';
  try {
    const r = await lite.chat({ system, messages: [{ role: "user", content: text }], maxTokens: 40 });
    const m = r.text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]) as { intent?: string; complejo?: boolean };
    const intent = parsed.intent as Intent;
    if (parsed.complejo || !KNOWN_INTENTS.includes(intent)) return null; // ante duda, escalá
    const params = intent === "cuota_deuda" ? { debtName: extractDebtName(text) } : {};
    return { intent, params, tokensIn: r.tokensIn, tokensOut: r.tokensOut };
  } catch {
    return null; // sin clasificación segura → razonamiento
  }
}

const pct = (cur: number, tgt: number) => (tgt > 0 ? Math.round((cur / tgt) * 100) : 0);

/**
 * CARRIL DE CONSULTA: responde el intent con la cifra del ToolContext (motor determinista) vía
 * plantilla (0 tokens). Devuelve null si el contexto no alcanza → escalar (no adivinar).
 */
export function answerFromContext(
  intent: Intent,
  params: Record<string, unknown>,
  tc: ToolContext,
  ctx?: FinancialContext,
): AIChatResponse | null {
  const cur = tc.currency;
  const money = (n: number) => formatMoney(n, cur);
  // Las consultas de dato nunca PROPONEN una acción (solo informan) → action: null.
  const say = (reply: string): AIChatResponse => ({ reply, action: null });

  // R2 — cifras que YA vienen en el FinancialContext (0 fetch, ambos canales). Si el dato
  // best-effort no está → null (escala; no adivina).
  if (intent === "gasto_mes") {
    if (typeof ctx?.expenseMonthly !== "number") return null;
    return say(`Tu gasto mensual ronda ${money(ctx.expenseMonthly)}.`);
  }
  if (intent === "ingreso_mes") {
    if (typeof ctx?.incomeMonthly !== "number") return null;
    return say(`Tus ingresos mensuales son ${money(ctx.incomeMonthly)}.`);
  }
  if (intent === "gasto_categoria") {
    const top = ctx?.topExpenseCategory;
    if (!top) return null;
    return say(`Donde más gastás es ${top.name}: ${money(top.monthly)} al mes (${top.pct}% de tu gasto).`);
  }

  if (intent === "numero_libertad") {
    if (typeof tc.freedomNumber !== "number" || tc.freedomNumber <= 0) return null;
    const have = typeof tc.investableWealth === "number" ? tc.investableWealth : 0;
    const falta = Math.max(0, tc.freedomNumber - have);
    return say(
      `Tu Número de Independencia es ${money(tc.freedomNumber)} — el patrimonio invertido que cubriría tu estilo de vida. ` +
        (have > 0
          ? `Hoy llevás ${money(have)} invertibles${falta > 0 ? `, te faltan ${money(falta)}.` : " — ¡ya lo alcanzaste!"}`
          : "Todavía no registrás patrimonio invertible."),
    );
  }

  if (intent === "metas") {
    const goals = (tc.goals ?? []).filter((g) => (g.objetivo ?? 0) > 0);
    if (goals.length === 0) return say("Todavía no tenés metas de ahorro con objetivo registradas.");
    const lines = goals
      .slice(0, 6)
      .map((g) => `• ${g.nombre}: ${money(g.actual)} de ${money(g.objetivo)} (${pct(g.actual, g.objetivo)}%)`);
    return say(`Tenés ${goals.length} ${goals.length === 1 ? "meta" : "metas"}:\n${lines.join("\n")}`);
  }

  if (intent === "cuota_deuda") {
    const debts = tc.debts ?? [];
    if (debts.length === 0) return say("No tenés deudas registradas.");
    const name = typeof params.debtName === "string" ? params.debtName.toLowerCase() : null;
    const match = name ? debts.find((d) => d.name.toLowerCase().includes(name)) : null;
    const debt = match ?? (debts.length === 1 ? debts[0] : null);
    if (!debt) {
      // Varias deudas y no se identificó cuál → listar (sin adivinar).
      const list = debts.slice(0, 6).map((d) => `• ${d.name}: ${money(d.minPayment)}/mes`).join("\n");
      return say(`Tenés varias deudas. Sus cuotas mensuales:\n${list}`);
    }
    const apr = debt.apr > 0 ? ` (APR ${debt.apr}%)` : "";
    return say(`La cuota mensual de ${debt.name} es ${money(debt.minPayment)}${apr}.`);
  }

  return null;
}

/**
 * Resuelve los intents R2 que requieren LECTURA fresca (no están en ctx). Import dinámico para
 * no acoplar la DB al camino puro de patrones/plantillas. Session-based (`requireUser`): en web
 * funciona; en WhatsApp (service-role, sin sesión) el fetch lanza → se captura → null → escala.
 * Devuelve la cifra REAL del ledger; jamás inventa.
 */
async function resolveFetchIntent(intent: Intent, cur: string): Promise<AIChatResponse | null> {
  const say = (reply: string): AIChatResponse => ({ reply, action: null });
  try {
    if (intent === "saldo_liquidez") {
      const { getLiquidityBalance } = await import("@/modules/financial-base");
      const { balance } = await getLiquidityBalance();
      return say(`Tu saldo de liquidez actual es ${formatMoney(balance, cur)}.`);
    }
    if (intent === "listar_sobres") {
      const { getEnvelopesSummary, formatEnvelopesReply } = await import("@/modules/financial-base");
      // Estructura AGRUPADA POR FRASCO (gasto y acumulables por separado) → Markdown determinista.
      // 0 tokens, exacto, sin alucinar (el cliente lo pasa por renderMarkdown → HTML seguro).
      return say(formatEnvelopesReply(await getEnvelopesSummary()));
    }
    if (intent === "ultimos_movimientos") {
      const { listTransactions } = await import("@/modules/financial-base");
      // Ventana de 60 días para no depender del día del mes; las 5 más recientes.
      const now = new Date();
      const to = now.toISOString().slice(0, 10);
      const fromD = new Date(now);
      fromD.setDate(fromD.getDate() - 60);
      const from = fromD.toISOString().slice(0, 10);
      const period = { month: now.getMonth() + 1, year: now.getFullYear(), from, to, label: "" };
      const txns = await listTransactions(period, {}, 5);
      if (txns.length === 0) return say("No registrás movimientos en los últimos 60 días.");
      const lines = txns.map((t) => {
        const label = t.merchantOrSource ?? t.description ?? "Movimiento";
        const sign = t.kind === "ingreso" ? "+" : "−";
        return `• ${t.occurredOn} · ${label}: ${sign}${formatMoney(t.amount, t.currency)}`;
      });
      return say(`Tus últimos movimientos:\n${lines.join("\n")}`);
    }
  } catch {
    return null; // sin sesión / lectura fallida → escala al razonamiento
  }
  return null;
}

/**
 * Intenta resolver la pregunta por el carril barato. Devuelve el resultado (con su carril y
 * tokens) o null si hay que escalar al razonamiento (modelo completo). NUNCA adivina: si el
 * patrón no matchea Y el clasificador no está seguro, o el contexto no alcanza → null.
 */
export async function tryRouteQuery(
  messages: { role: string; content: string }[],
  ctx: FinancialContext,
  toolContext: ToolContext,
): Promise<RoutedQuery | null> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content?.trim();
  if (!lastUser) return null;

  // 1) Patrones (0 tokens de clasificación).
  const matched = matchIntent(lastUser);
  if (matched) {
    if (FETCH_INTENTS.has(matched.intent)) {
      const response = await resolveFetchIntent(matched.intent, toolContext.currency);
      // La lectura no consume tokens del LLM; su "coste" es una query a la BD.
      return response ? { response, tokensIn: 0, tokensOut: 0, lane: "template" } : null;
    }
    const response = answerFromContext(matched.intent, matched.params, toolContext, ctx);
    if (response) return { response, tokensIn: 0, tokensOut: 0, lane: "template" };
    return null; // el contexto no alcanza → escalar
  }

  // 2) Clasificador Flash-Lite (barato). Solo si no matchó patrón.
  const classified = await classifyWithLite(lastUser);
  if (!classified) return null; // ante duda, razonamiento
  const response = FETCH_INTENTS.has(classified.intent)
    ? await resolveFetchIntent(classified.intent, toolContext.currency)
    : answerFromContext(classified.intent, classified.params, toolContext, ctx);
  if (!response) return null;
  // La respuesta es plantilla (0 tokens de generación); solo se pagó la clasificación.
  return { response, tokensIn: classified.tokensIn, tokensOut: classified.tokensOut, lane: "lite" };
}

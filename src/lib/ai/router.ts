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
  // Números patrimoniales — los TRES, distintos (todos "capital al 8% que cubre X gasto"):
  | "numero_seguridad"
  | "numero_independencia"
  | "numero_libertad"
  // R1 — datos ya en ToolContext (motor determinista):
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
  | "listar_sobres"
  // "¿me puedo comprar X?" → mapea al sobre y dice el restante (determinista) — lectura fresca:
  | "puedo_gastar"
  // Precio/ATH/"si vendo X en el máximo" → llama datos_de_mercado DETERMINISTA (no a criterio del LLM):
  | "datos_mercado";

const KNOWN_INTENTS: Intent[] = [
  "numero_seguridad",
  "numero_independencia",
  "numero_libertad",
  "metas",
  "cuota_deuda",
  "gasto_mes",
  "ingreso_mes",
  "gasto_categoria",
  "saldo_liquidez",
  "ultimos_movimientos",
  "listar_sobres",
  "puedo_gastar",
  "datos_mercado",
];

/** Intents cuyo dato NO está en ctx: se resuelven con lectura fresca (solo con sesión web). */
const FETCH_INTENTS: ReadonlySet<Intent> = new Set([
  "saldo_liquidez",
  "ultimos_movimientos",
  "listar_sobres",
  "puedo_gastar",
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

/** Forma "verbo + ítem": el ítem viene DESPUÉS del verbo ("me alcanza para X", "me puedo comprar X"). */
const AFFORD_VERB_RE =
  /(?:me\s+puedo\s+comprar|me\s+puedo\s+dar|puedo\s+darme|me\s+lo\s+puedo\s+dar|me\s+alcanza\s+para|me\s+da\s+para|puedo\s+gastar(?:\s+(?:en|para))?)\s+(.+?)[\?\.!¿¡]*$/i;

/** Señal SUELTA de "¿me alcanza?" que puede venir SIN el ítem detrás ("un helado, me alcanza?"). */
const AFFORD_LOOSE_RE =
  /\bme\s+alcanza\b|\bme\s+da\b|\balcanza(?:r[ií]a|r[aá])?\b|\bme\s+lo\s+puedo\s+dar\b|\bpuedo\s+con\b|\bpuedo\s*[?¿]|\bme\s+puedo\s+(?:comprar|dar)\b/i;

/** Ítem de COMPRA en el resto de la frase: "quiero un/una X", "un/una X" (antes de coma/fin). El
 *  artículo indefinido / verbo de compra es el guard anti-falso-positivo (no agarra "el tiempo"). */
const AFFORD_ITEM_RE =
  /(?:quiero|comprar(?:me)?|darme|gustar[ií]a)\s+(?:un|una|unos|unas)\s+([^,.?!¿¡]+)|(?:^|[,\s])(?:un|una|unos|unas)\s+([^,.?!¿¡]+)/i;

/** Monto SOLO si viene con señal de moneda (₡/$/…) o multiplicador (mil/k); si no, null (no
 *  agarra números sueltos como "2 cervezas"). es-CR: "." = miles, "," = decimales. */
export function extractAmount(text: string): number | null {
  const m = text.match(/(?:₡|\$|col\$|mx\$|crc|usd)\s*([\d.,]+)|(\d[\d.,]*)\s*(mil|k)\b/i);
  if (!m) return null;
  const raw = (m[1] ?? m[2] ?? "").trim();
  const mult = m[3] ? 1000 : 1;
  const n = parseFloat(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n * mult : null;
}

/**
 * Descripción del ítem de la pregunta de afford, en CUALQUIER orden:
 *   A) "verbo + ítem" ("me alcanza para un helado") → captura tras el verbo.
 *   B) señal suelta + ítem en el resto ("quiero un helado, me alcanza?", "un helado, ¿me alcanza?")
 *      → toma el "un/una X" de compra. El artículo indefinido / verbo de compra evita falsos
 *      positivos como "me alcanza el tiempo/la plata para llegar" (que no rutean a afford).
 * Quita monto y artículo inicial → "un helado" ⇒ "helado". null si no hay ítem de compra.
 */
export function extractAffordDesc(text: string): string | null {
  const t = text.trim();
  let desc = t.match(AFFORD_VERB_RE)?.[1]?.trim() ?? null;
  if (!desc) {
    const mi = t.match(AFFORD_ITEM_RE);
    desc = (mi?.[1] ?? mi?.[2])?.trim() ?? null;
  }
  if (!desc) return null;
  desc = desc
    // corta una pregunta de afford que haya quedado pegada al ítem ("helado, me alcanza?").
    .replace(/,?\s*¿?\s*(?:me\s+alcanza|me\s+da|puedo|alcanza)\b.*$/i, " ")
    .replace(/\b(?:algo\s+de|de|por|unos?|unas?)\s+(?=(?:₡|\$|col\$|mx\$)|\d)/gi, " ")
    .replace(/(?:₡|\$|col\$|mx\$|crc|usd)\s*[\d.,]+\s*(?:mil|k)?/gi, " ")
    .replace(/\b\d[\d.,]*\s*(?:mil|k)\b/gi, " ")
    .replace(/^(?:un|una|unos|unas|el|la|los|las)\s+/i, "") // "un helado" ⇒ "helado"
    .replace(/\s+/g, " ")
    .replace(/^[\s,]+|[\s,.?!¿¡]+$/g, "")
    .trim();
  return desc.length >= 2 ? desc : null;
}

/**
 * Respuesta a "¿me puedo comprar X?" a partir de las cifras del MOTOR (getSobreRemaining) — pura y
 * testeable. La app INFORMA y GUÍA, no ordena; la decisión es del usuario. Nunca inventa el saldo.
 */
export function affordReply(
  path: string,
  r: { budget: number; spent: number; remaining: number; hasBudget: boolean },
  amount: number | null,
  money: (n: number) => string,
): string {
  if (!r.hasBudget) {
    return `No tenés presupuesto en ${path} este mes; asignale uno y te digo cuánto te queda.`;
  }
  if (r.remaining <= 0) {
    return `Ya usaste tu presupuesto de ${path} (${money(r.spent)} de ${money(r.budget)}). Si te lo das, te estarías pasando.`;
  }
  if (amount !== null) {
    if (amount <= r.remaining) {
      return `En ${path} te quedan ${money(r.remaining)} este mes; con ${money(amount)} te quedarían ${money(r.remaining - amount)}.`;
    }
    return `En ${path} te quedan ${money(r.remaining)} este mes, y ${money(amount)} se pasa por ${money(amount - r.remaining)}. Si te lo das, te estarías pasando.`;
  }
  return `En ${path} te quedan ${money(r.remaining)} este mes.`;
}

/** Señales de pregunta de MERCADO: precio, ATH/máximo, o "si vendo X en el máximo/ATH". */
const MARKET_CUE_RE =
  /\bath\b|m[aá]ximo hist[oó]rico|\bm[aá]ximo\b|precio (?:de|actual|hoy)|(?:cu[aá]nto|a c[oó]mo) (?:vale|est[aá]|cuesta)|si (?:vendo|vendiera)/i;
/** ATH/máximo específicamente (para saber si el usuario pide el escenario "al máximo"). */
const MARKET_ATH_RE = /\bath\b|m[aá]ximo/i;

/**
 * Extrae el símbolo objetivo de una pregunta de mercado: un ticker en MAYÚSCULAS (2-6 letras/
 * dígitos) o el que matchee un símbolo/nombre de las posiciones del usuario. `known` = símbolos y
 * nombres de sus holdings (para resolver "kamino"/"bitcoin" además del ticker). Devuelve el TICKER.
 */
export function extractMarketSymbol(text: string, known: { symbol: string | null; name: string }[]): string | null {
  // 1) Ticker explícito en mayúsculas (BTC, KMNO, VOO). Evita palabras comunes en mayúscula.
  const STOP = new Set(["ATH", "USD", "CRC", "EUR", "IA", "ETF"]);
  const upper = text.match(/\b[A-Z]{2,6}\d?\b/g)?.filter((w) => !STOP.has(w)) ?? [];
  const bySymbol = new Set(known.map((k) => k.symbol?.toUpperCase()).filter(Boolean));
  const hit = upper.find((w) => bySymbol.has(w)) ?? upper[0];
  if (hit) return hit;
  // 2) Por nombre de la posición ("si vendo mi bitcoin en el ATH") → su ticker.
  const lower = text.toLowerCase();
  const byName = known.find((k) => k.name && lower.includes(k.name.toLowerCase()) && k.symbol);
  return byName?.symbol ?? null;
}

/** PATRONES: intent + params con CERO tokens. null si no matchea con confianza. */
export function matchIntent(text: string): { intent: Intent; params: Record<string, unknown> } | null {
  const t = text.trim();

  // Precio/ATH/"si vendo X en el máximo": carril DETERMINISTA (llama datos_de_mercado, no depende
  // de que el LLM decida). Antes que REASONING_CUES ("si vendo" no está ahí, pero "máximo" podría
  // solaparse con otras señales) para garantizar que estas preguntas NO caigan al modelo suelto.
  if (MARKET_CUE_RE.test(t)) {
    return { intent: "datos_mercado", params: { text: t, wantsAth: MARKET_ATH_RE.test(t) } };
  }

  if (REASONING_CUES.test(t)) return null; // consejo/proyección → razonamiento

  // "¿me puedo comprar / me alcanza para X?" en CUALQUIER orden (verbo+ítem o señal suelta + ítem).
  // El `desc` (ítem de compra) es el guard: sin ítem no rutea (evita "me alcanza el tiempo…").
  if (AFFORD_VERB_RE.test(t) || AFFORD_LOOSE_RE.test(t)) {
    const desc = extractAffordDesc(t);
    if (desc) return { intent: "puedo_gastar", params: { desc, amount: extractAmount(t) } };
  }

  // Los TRES números patrimoniales — distinguidos explícitamente (no se mezclan).
  if (/n[uú]mero de seguridad|cu[aá]nto necesito para (?:cubrir )?(?:lo esencial|mis? gastos? esenciales?)/i.test(t)) {
    return { intent: "numero_seguridad", params: {} };
  }
  if (/n[uú]mero de independencia|cu[aá]nto necesito para (?:sostener|cubrir) mi vida (?:actual)?/i.test(t)) {
    return { intent: "numero_independencia", params: {} };
  }
  if (/n[uú]mero de libertad|cu[aá]nto necesito para (?:ser libre|mi libertad|mi estilo de vida)/i.test(t)) {
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
    '{"intent": "numero_seguridad"|"numero_independencia"|"numero_libertad"|"metas"|"cuota_deuda"|"gasto_mes"|"ingreso_mes"|"gasto_categoria"|"saldo_liquidez"|"ultimos_movimientos"|"listar_sobres"|"otro", "complejo": true|false}. ' +
    "numero_seguridad=capital para sus gastos esenciales; numero_independencia=capital para su vida actual; " +
    "numero_libertad=capital para su estilo de vida deseado (NO son lo mismo; no los mezcles). " +
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

  // Los TRES números patrimoniales. Cada cifra sale del motor (patrimonio-engine, al 8% anual);
  // JAMÁS se inventa ni se usa la regla del 4%/25×. "have" = patrimonio invertible.
  if (
    intent === "numero_seguridad" ||
    intent === "numero_independencia" ||
    intent === "numero_libertad"
  ) {
    const have = typeof tc.investableWealth === "number" ? tc.investableWealth : 0;
    const progreso = (target: number): string => {
      const falta = Math.max(0, target - have);
      return have > 0
        ? ` Hoy llevás ${money(have)} invertibles${falta > 0 ? `, te faltan ${money(falta)}.` : " — ¡ya lo alcanzaste!"}`
        : " Todavía no registrás patrimonio invertible.";
    };

    if (intent === "numero_seguridad") {
      const n = tc.securityNumber;
      if (typeof n !== "number" || n <= 0) return null;
      return say(
        `Tu Número de Seguridad es ${money(n)} — el capital que, al 8% anual, cubre tus gastos ESENCIALES.` +
          progreso(n),
      );
    }
    if (intent === "numero_independencia") {
      const n = tc.independenceNumber;
      if (typeof n !== "number" || n <= 0) return null;
      return say(
        `Tu Número de Independencia es ${money(n)} — el capital que, al 8% anual, cubre tus gastos TOTALES actuales.` +
          progreso(n),
      );
    }
    // numero_libertad: estilo de vida DESEADO. Si no lo definió → estado claro, sin inventar.
    const n = tc.libertyNumber;
    if (typeof n !== "number" || n <= 0) {
      return say(
        "Todavía no definiste tu estilo de vida deseado, así que no tengo tu Número de Libertad. " +
          "Definilo en tu perfil y te lo calculo (tu gasto deseado mensual, al 8% anual). No lo invento.",
      );
    }
    return say(
      `Tu Número de Libertad es ${money(n)} — el capital que, al 8% anual, sostiene el estilo de vida que DESEÁS.` +
        progreso(n),
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
async function resolveFetchIntent(
  intent: Intent,
  cur: string,
  params: Record<string, unknown> = {},
): Promise<AIChatResponse | null> {
  const say = (reply: string): AIChatResponse => ({ reply, action: null });
  try {
    // "¿me puedo comprar X?": mapea al sobre (DETERMINISTA primero, LLM con timeout) y responde con
    // el restante del MOTOR. Este carril NUNCA escala ni se cuelga en Gemini → nunca IA-503.
    if (intent === "puedo_gastar") {
      const desc = typeof params.desc === "string" ? params.desc : "";
      if (!desc) return null; // sin ítem (no debería pasar: matchIntent exige desc)
      const amount = typeof params.amount === "number" ? params.amount : null;
      const { suggestSobreForChatFast, getSobreRemaining } = await import("@/modules/financial-base");
      const sug = await suggestSobreForChatFast(desc, "gasto");
      if (!sug.categoryId) {
        // Sin sobre claro → pedir precisión (determinista), NO escalar al LLM.
        return say(
          `No estoy seguro a qué sobre cargar «${desc}». ¿A cuál lo llevo — Restaurantes, Salidas…? Decímelo y te digo cuánto te queda.`,
        );
      }
      const rem = await getSobreRemaining(sug.categoryId, new Date().toISOString().slice(0, 10));
      if (!rem) {
        return say(
          `Encontré ${sug.categoryPath ?? "tu sobre"} pero no pude leer su presupuesto ahora. Probá de nuevo en un momento.`,
        );
      }
      const path = sug.categoryPath ?? rem.path;
      return say(affordReply(path, rem, amount, (n) => formatMoney(n, rem.currency)));
    }
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

/** asset_type del holding → tipo de mercado de getMarketHighlights. */
const MARKET_TYPE: Record<string, "stock" | "etf" | "crypto"> = {
  etf: "etf",
  accion: "stock",
  cripto: "crypto",
};

/**
 * Carril DETERMINISTA de datos de mercado: resuelve el símbolo contra las posiciones del usuario
 * (ctx.holdings), llama al tool (getMarketHighlights, cacheado) y arma la respuesta con
 * computeMarketScenario (cifra real) — NO depende de que el LLM decida llamar el tool. Fallo honesto:
 * si no hay símbolo o el dato vuelve null, dice el motivo real (nunca "no tengo acceso").
 */
/**
 * Lee la posición COMPLETA del usuario en un símbolo (cantidad + invertido + moneda), de las
 * holdings completas con scope de hogar — NO del top-N compacto. Best-effort: sin sesión (WhatsApp)
 * o ante cualquier fallo → null (el carril sigue sin la posición). Import dinámico (server-only).
 */
async function getFullPosition(
  symbol: string,
): Promise<{ quantity: number; invested: number; currency: string; assetType: string } | null> {
  try {
    const { getPositionForSymbol } = await import("@/modules/wealth");
    return await getPositionForSymbol(symbol);
  } catch {
    return null;
  }
}

/** Convierte lo invertido a la moneda del escenario (best-effort: ante fallo, devuelve el original). */
async function convertInvested(amount: number, from: string, to: string): Promise<number> {
  try {
    const { getFxRates } = await import("@/lib/market-data/fx-rates");
    const { convertCurrency } = await import("@/lib/fx");
    const rates = await getFxRates();
    return Math.round(convertCurrency(amount, from, to, rates));
  } catch {
    return amount;
  }
}

async function resolveMarketQuery(
  params: Record<string, unknown>,
  ctx: FinancialContext,
  cur: string,
): Promise<AIChatResponse | null> {
  const say = (reply: string): AIChatResponse => ({ reply, action: null });
  const text = typeof params.text === "string" ? params.text : "";
  const wantsAth = params.wantsAth === true;
  const holdings = ctx.holdings ?? [];
  const symbol = extractMarketSymbol(text, holdings.map((h) => ({ symbol: h.symbol, name: h.name })));
  if (!symbol) {
    // Pregunta de mercado sin símbolo claro → no forzamos; que el razonamiento la tome.
    return null;
  }
  const holding = holdings.find((h) => h.symbol?.toUpperCase() === symbol.toUpperCase());
  try {
    const { getMarketHighlights } = await import("@/lib/market-data");
    const { computeMarketScenario } = await import("@/lib/ai/tools");
    const { logger } = await import("@/lib/logger");

    // La POSICIÓN puede no estar en ctx.holdings (top-N compacto): posiciones chicas o con precio
    // $0 (bug del $0) quedan fuera y sin ellas no se calcula el escenario. Si el símbolo no está en
    // el top-N, se lee la posición COMPLETA por símbolo (scope de hogar). Best-effort: sin sesión
    // (WhatsApp) o sin posición → undefined y el carril sigue mostrando solo el dato de mercado.
    let cantidad = holding?.quantity;
    let invertido = holding?.invested;
    let posCurrency = holding?.currency ?? cur;
    let assetHint = holding?.assetType;
    if (!holding) {
      const full = await getFullPosition(symbol);
      if (full) {
        cantidad = full.quantity;
        invertido = full.invested;
        posCurrency = full.currency;
        assetHint = full.assetType;
      }
    }
    // assetType: del holding/posición si lo tiene; si no, cripto por defecto (tickers sueltos).
    const at = MARKET_TYPE[assetHint ?? ""] ?? "crypto";

    const h = await getMarketHighlights(symbol, at);
    logger.info("router.market_lane", { symbol, assetType: at, gotData: !!h, gotHigh: h?.high != null });

    // El máximo (ATH) viene en la moneda de highlights (USD en cripto). Lo invertido sale en la
    // moneda del holding; si difieren, se convierte para que cantidad×máximo − invertido sea coherente.
    const scenCurrency = h?.currency ?? cur;
    if (typeof invertido === "number" && posCurrency !== scenCurrency) {
      invertido = await convertInvested(invertido, posCurrency, scenCurrency);
    }

    const hasPosition = typeof cantidad === "number" && cantidad > 0;
    const scenario = computeMarketScenario({
      symbol: symbol.toUpperCase(),
      assetType: at,
      currency: scenCurrency,
      price: h?.price ?? null,
      high: h?.high ?? null,
      highKind: h?.highKind ?? null,
      highDate: h?.highDate ?? null,
      invertido,
      cantidad,
    });
    return say(buildMarketReply(scenario, scenario.currency, wantsAth, hasPosition, freshnessNote(h?.asOf, Date.now())));
  } catch (err) {
    const { logger } = await import("@/lib/logger");
    logger.error("router.market_lane falló", { symbol, message: err instanceof Error ? err.message : "?" });
    // Fallo real y distinguible (no el genérico "no tengo acceso").
    return say(`No pude leer los datos de ${symbol.toUpperCase()} ahora mismo; reintentá en un momento o decime a qué precio simular.`);
  }
}

/**
 * Redacta la respuesta de mercado a partir del escenario del motor (computeMarketScenario) — pura y
 * testeable. La cifra sale del tool; el asesor no la inventa. Fallo HONESTO y distinguible: si no hay
 * dato dice el motivo real (no encontrado / no se pudo leer), NUNCA "no tengo acceso al ATH".
 */
/**
 * Nota de FRESCURA honesta: si el dato del store tiene más de ~2 h (el cron no corrió), lo dice
 * ("precio guardado del DD/MM, no en vivo"). Fresco o sin fecha → "". Puro (recibe `nowMs`).
 */
export function freshnessNote(asOf: string | null | undefined, nowMs: number): string {
  if (!asOf) return "";
  const t = Date.parse(asOf);
  if (!Number.isFinite(t)) return "";
  if (nowMs - t < 2 * 3600 * 1000) return ""; // fresco
  const d = new Date(t);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return ` (precio guardado del ${dd}/${mm}, no en vivo).`;
}

/**
 * Cantidad de unidades (puede ser fraccional en cripto): miles con PUNTO, decimales con coma, hasta
 * 6 decimales. Determinista (sin Intl) para coincidir con la política de formatMoney (idéntico en
 * servidor y cliente; es-CR/ICU agrupa distinto según el motor).
 */
function formatQuantity(n: number): string {
  const fixed = Number.isInteger(n) ? String(Math.trunc(n)) : n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  const [int = "0", dec] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return dec ? `${grouped},${dec}` : grouped;
}

export function buildMarketReply(
  s: {
    symbol: string;
    precio_actual: number | null;
    maximo: number | null;
    maximo_tipo: "ath" | "52_semanas" | null;
    maximo_fecha?: string | null;
    cantidad?: number | null;
    invertido?: number | null;
    valor_actual: number | null;
    ganancia_al_precio_actual: number | null;
    valor_al_maximo: number | null;
    ganancia_al_maximo: number | null;
  },
  currency: string,
  wantsAth: boolean,
  hasPosition: boolean,
  freshness = "",
): string {
  const money = (n: number) => formatMoney(n, currency);
  if (s.precio_actual === null && s.maximo === null) {
    return `No pude leer los datos de ${s.symbol} en la fuente ahora mismo; reintentá en un momento o decime a qué precio querés que simule.`;
  }
  const maxLabel = s.maximo_tipo === "ath" ? "su máximo histórico (ATH)" : "su máximo de 52 semanas";
  const maxShort = s.maximo_tipo === "ath" ? "ATH" : "máximo de 52 semanas";
  const fecha = s.maximo_fecha ? ` (${s.maximo_fecha})` : "";
  const knowsPos = typeof s.cantidad === "number" && typeof s.invertido === "number";

  // Intro: si conocemos la posición, la NOMBRAMOS ("tenés X, invertiste Y"); si no, el dato de
  // mercado. Precio ≤0 ya llega como null → NUNCA imprimimos "$0"; si falta, lo decimos honesto.
  const parts: string[] = [];
  if (hasPosition && knowsPos) {
    parts.push(`Tenés ${formatQuantity(s.cantidad!)} ${s.symbol} (invertiste ${money(s.invertido!)})`);
    if (s.precio_actual === null) parts.push("ahora no tengo el precio actual");
  } else if (s.precio_actual !== null) {
    parts.push(`${s.symbol} cotiza hoy a ${money(s.precio_actual)}`);
  }
  if (s.maximo !== null && !(hasPosition && wantsAth)) parts.push(`${maxLabel} fue ${money(s.maximo)}`);
  let reply = parts.length ? parts.join("; ") + "." : "";

  if (hasPosition && wantsAth) {
    if (s.maximo !== null && s.valor_al_maximo !== null && s.ganancia_al_maximo !== null) {
      const hoy =
        s.ganancia_al_precio_actual !== null ? ` (hoy, al precio actual, sería ${money(s.ganancia_al_precio_actual)})` : "";
      reply += ` Al ${maxShort} de ${money(s.maximo)}${fecha} tu posición valdría ${money(s.valor_al_maximo)} — ganancia de ${money(s.ganancia_al_maximo)} sobre lo invertido${hoy}. Ojo: el máximo es pasado y no se puede cronometrar el techo — es un escenario, no un plan.`;
    } else {
      reply += ` No tengo el máximo para calcular ese escenario; decime a qué precio simular.`;
    }
  } else if (hasPosition && s.ganancia_al_precio_actual !== null) {
    reply += ` Al precio actual, tu ganancia sobre lo invertido es ${money(s.ganancia_al_precio_actual)}.`;
  }
  return reply.trim() + freshness;
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
    // Datos de mercado (precio/ATH): carril determinista que usa ctx.holdings + el tool. Si no
    // resuelve el símbolo o no hay dato, devuelve la respuesta honesta (no escala a repetir negativas).
    if (matched.intent === "datos_mercado") {
      const response = await resolveMarketQuery(matched.params, ctx, toolContext.currency);
      return response ? { response, tokensIn: 0, tokensOut: 0, lane: "template" } : null;
    }
    if (FETCH_INTENTS.has(matched.intent)) {
      const response = await resolveFetchIntent(matched.intent, toolContext.currency, matched.params);
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
    ? await resolveFetchIntent(classified.intent, toolContext.currency, classified.params)
    : answerFromContext(classified.intent, classified.params, toolContext, ctx);
  if (!response) return null;
  // La respuesta es plantilla (0 tokens de generación); solo se pagó la clasificación.
  return { response, tokensIn: classified.tokensIn, tokensOut: classified.tokensOut, lane: "lite" };
}

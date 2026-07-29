/**
 * Carril de ACCIÓN determinista (puro, sin "server-only": testeable). Detecta intents de CREAR
 * (alerta de precio, meta, sobre acumulable, gasto) por PATRÓN y arma la propuesta de acción con
 * sus params — CERO tokens de LLM. La acción propuesta va a la tarjeta de confirmación (el usuario
 * confirma; recién ahí la server action ejecuta). El LLM queda como fallback para fraseo ambiguo.
 *
 * REGLA: si el intent matchea pero falta un dato clave, NO inventamos: pedimos SOLO ese dato
 * (action = null, reply con la pregunta corta). Nunca respondemos "no puedo crear …".
 */
import type { AIChatResponse, AIActionProposal } from "@/lib/ai/types";

export type KnownHolding = { symbol: string | null; name: string; assetType?: string };

export type ActionLaneOptions = {
  currency: string;
  holdings?: KnownHolding[];
  /** Fecha de hoy YYYY-MM-DD (inyectada para pureza/determinismo). */
  today: string;
};

// Palabras en MAYÚSCULA que NO son tickers (evita falsos símbolos).
const TICKER_STOP = new Set(["ATH", "USD", "CRC", "EUR", "IA", "ETF"]);

/** Extrae un ticker (2-6 letras/dígitos en MAYÚSCULA) o lo matchea contra las posiciones conocidas. */
export function extractSymbol(text: string, holdings: KnownHolding[] = []): string | null {
  const bySymbol = new Set(holdings.map((h) => h.symbol?.toUpperCase()).filter(Boolean) as string[]);
  const upper = text.match(/\b[A-Z]{2,6}\d?\b/g) ?? [];
  // Primero: un ticker en mayúscula que sea de sus posiciones; si no, el primero no-stop.
  const known = upper.find((w) => bySymbol.has(w));
  if (known) return known;
  const free = upper.find((w) => !TICKER_STOP.has(w));
  if (free) return free;
  // Por nombre de la posición ("avisame cuando bitcoin llegue a…") → su ticker.
  const lower = text.toLowerCase();
  const byName = holdings.find((h) => h.name && lower.includes(h.name.toLowerCase()) && h.symbol);
  return byName?.symbol ? byName.symbol.toUpperCase() : null;
}

/** Primer número monetario del texto: admite 1.234,56 / 1,234.56 / $1 / 5000. Devuelve null si no hay. */
export function extractMoney(text: string): number | null {
  // Captura un run completo de dígitos con separadores opcionales (evita cortar 5000 → 500).
  const m = text.match(/(?:[$₡]|USD|CRC)?\s*(\d[\d.,]*\d|\d)/i);
  if (!m || !m[1]) return null;
  let raw = m[1];
  // Normaliza separadores: si hay ambos, el ÚLTIMO es el decimal; si hay uno solo y deja 3 dígitos
  // a la derecha, es de miles (1.000 = 1000), salvo que sea claramente decimal (1,5).
  const hasDot = raw.includes(".");
  const hasComma = raw.includes(",");
  if (hasDot && hasComma) {
    const decSep = raw.lastIndexOf(",") > raw.lastIndexOf(".") ? "," : ".";
    const thouSep = decSep === "," ? "." : ",";
    raw = raw.split(thouSep).join("").replace(decSep, ".");
  } else if (hasDot || hasComma) {
    const sep = hasDot ? "." : ",";
    const parts = raw.split(sep);
    const last = parts[parts.length - 1] ?? "";
    // "1.000" / "1,000" (grupo de 3) → miles; "1,5" / "0.25" → decimal.
    raw = parts.length > 1 && last.length === 3 ? parts.join("") : raw.replace(sep, ".");
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const say = (reply: string, action: AIActionProposal | null): AIChatResponse => ({ reply, action });

// ── Patrones de intent (español, voseo/tuteo) ──
// OJO: sin \b FINAL en verbos que pueden terminar en tilde (creá, registrá, avisá): en JS \b es
// ASCII y una vocal acentuada NO es \w, así que "\b…á\b" NUNCA matchea. Basta el \b inicial.
const ALERT_RE = /\b(alerta|alertame|avisa|avísame|avisame|avisar|avisá|notif)/i;
const GOAL_RE = /\bmeta( de ahorro)?\b/i;
const SOBRE_RE = /\b(sobre|frasco|acumulador)\b/i;
const EXPENSE_RE = /\b(gast|compr|pagu|pag[oó]|registr|anot|apunt)/i;
const CREATE_VERB_RE = /\b(cre[aá]|crear|hac[eé]|hacer|nuev[oa]|agreg|arm[aá]|arma|pon[eé]|ponme|añad|generame|gener[aá]|abr[íi]|abrir|configur)/i;
// Verbo IMPERATIVO de alerta (para no confundir "creá una alerta" con "tengo alertas activas").
const ALERT_CREATE_SIGNAL = /\b(avisa|avísame|avisame|avisá|alertame|generame|gener[aá]|ponme|pon[eé]|cre[aá]|crear|configur|agreg|arm[aá]|arma|quiero|necesito)/i;

/** Nombre de la meta/sobre: preferí "para X", luego "llamad[oa]/objetivo X", luego "sobre/meta X". */
function extractName(text: string): string | null {
  const patterns = [
    /\bpara\s+(?:mi\s+|el\s+|la\s+|un\s+|una\s+)?([\p{L}][\p{L}\p{N} '-]{1,40}?)\s*(?:$|[.,;!?])/iu,
    /\b(?:llamad[oa]|objetivo|nombre)\s+["“']?([\p{L}][\p{L}\p{N} '-]{1,40}?)["”']?\s*(?:$|[.,;!?])/iu,
    /\b(?:sobre|frasco|meta)\s+(?:de\s+|para\s+)?([\p{L}][\p{L}\p{N} '-]{1,40}?)\s*(?:$|[.,;!?])/iu,
  ];
  for (const re of patterns) {
    const cand = text.match(re)?.[1]?.trim();
    if (cand && !/^(?:de\s+)?ahorro$/i.test(cand)) return cand;
  }
  return null;
}

/**
 * Detecta un intent de CREAR y arma la propuesta (o pide el dato faltante). null si no es un create.
 */
export function detectCreateAction(text: string, opts: ActionLaneOptions): AIChatResponse | null {
  const t = text.trim();
  // Preguntas de CONSEJO ("¿debería crear una meta?", "¿conviene…?") NO son órdenes de crear:
  // van al razonamiento, no al carril de acción.
  if (/\b(deber[ií]a|convien|convendr[ií]a|es mejor|vale la pena|qu[eé] (?:pienso|opin[aá]|recomend)|me recomend|ser[ií]a bueno)\b/i.test(t)) {
    return null;
  }
  const money = extractMoney(t);

  // 1) ALERTA DE PRECIO — "alerta/avisame … {símbolo} … {precio}". La dirección la infiere el
  //    servidor con el precio actual (createInvestmentAlert); acá solo símbolo + objetivo. Se
  //    requiere una señal de CREAR (imperativo) o un precio, para no secuestrar lecturas
  //    ("¿tengo alertas activas?" no trae ni verbo de crear ni monto → no entra).
  if (ALERT_RE.test(t) && (ALERT_CREATE_SIGNAL.test(t) || money !== null)) {
    const symbol = extractSymbol(t, opts.holdings);
    if (!symbol) {
      return say("¿Para qué símbolo querés la alerta? Decime el ticker (p. ej. JUP, BTC).", null);
    }
    if (money === null) {
      return say(`¿A qué precio te aviso de ${symbol}?`, null);
    }
    // assetType: de la posición del usuario si la tiene; si no, cripto (los tickers sueltos suelen serlo).
    const held = opts.holdings?.find((h) => h.symbol?.toUpperCase() === symbol);
    const assetType = held?.assetType ?? "cripto";
    // Moneda de cotización: cripto siempre USD; cotizadas → la del usuario (aprox., editable luego).
    const alertCurrency = assetType === "cripto" ? "USD" : opts.currency;
    const money$ = formatMoneyPlain(money, alertCurrency);
    return say(`Te propongo crear una alerta de precio de ${symbol} en ${money$}. Confirmá abajo.`, {
      type: "create_price_alert",
      payload: { symbol, targetPrice: money, assetType, currency: alertCurrency },
      summary: `Alerta ${symbol} a ${money$}`,
    });
  }

  // 2) SOBRE acumulable (savings_goals kind='sobre') — "creá un sobre de X". Antes que META porque
  //    "sobre de ahorro" también trae "ahorro"; el sobre no lleva objetivo.
  if (SOBRE_RE.test(t) && CREATE_VERB_RE.test(t)) {
    const name = extractName(t) ?? "Sobre";
    return say(`Te propongo crear el sobre "${name}". Confirmá abajo.`, {
      type: "create_goal",
      payload: { kind: "sobre", name, currency: opts.currency, targetAmount: null },
      summary: `Sobre ${name}`,
    });
  }

  // 3) META de ahorro — "meta de ahorro de $Y [para NOMBRE]".
  if (GOAL_RE.test(t) && (CREATE_VERB_RE.test(t) || money !== null)) {
    const name = extractName(t) ?? "Meta de ahorro";
    if (money === null) {
      return say(`¿De cuánto es la meta "${name}"?`, null);
    }
    return say(`Te propongo crear la meta "${name}" por ${formatMoneyPlain(money, opts.currency)}. Confirmá abajo.`, {
      type: "create_goal",
      payload: { kind: "meta", name, targetAmount: money, currency: opts.currency },
      summary: `Meta ${name}`,
    });
  }

  // 4) GASTO — "registrá/anotá un gasto de $Z en W".
  if (EXPENSE_RE.test(t) && /\bgast|\bcompr|\bpagu|\bpag[ué]|\bgasto\b/i.test(t)) {
    const desc = extractExpenseDesc(t) ?? "Gasto";
    if (money === null) {
      return say(`¿De cuánto fue el gasto${desc !== "Gasto" ? ` en ${desc}` : ""}?`, null);
    }
    return say(`Te propongo registrar un gasto de ${formatMoneyPlain(money, opts.currency)} en "${desc}". Confirmá abajo.`, {
      type: "create_transaction",
      payload: { kind: "gasto", description: desc, amount: money, currency: opts.currency, occurredOn: opts.today },
      summary: `Gasto ${desc}`,
    });
  }

  return null;
}

/** Descripción del gasto: primer "en/de/para/por X" que NO sea el monto. Preferí "en X". */
function extractExpenseDesc(text: string): string | null {
  const all = [
    ...text.matchAll(/\b(?:en|de|para|por)\s+(?:el\s+|la\s+|un\s+|una\s+|mi\s+)?([\p{L}][\p{L}\p{N} '-]{1,40}?)\s*(?:$|[.,;!?])/giu),
  ];
  for (const m of all) {
    const cand = m[1]?.trim();
    if (cand && !/^\d[\d.,]*$/.test(cand)) return cand;
  }
  return null;
}

/** Formato de dinero simple y determinista (miles con punto), sin depender de Intl. */
function formatMoneyPlain(amount: number, currency: string): string {
  const [int = "0", dec] = Math.abs(amount).toFixed(amount % 1 === 0 ? 0 : 2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const sym = currency === "USD" ? "$" : currency === "CRC" ? "₡" : `${currency} `;
  return dec ? `${sym}${grouped},${dec}` : `${sym}${grouped}`;
}

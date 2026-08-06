/**
 * Carril de mercado MULTI-POSICIÓN (puro, sin "server-only": testeable). Resuelve preguntas de
 * alcance múltiple con un modificador de precio — "vender todos mis altcoins a 90% de su ATH,
 * ¿cuánto generan?" — de forma DETERMINISTA (nunca el LLM, que se colgaba). El router hace la parte
 * async (leer precio/ATH del STORE por holding); acá va la detección, el cómputo y la redacción.
 */
import { formatMoney } from "@/lib/format";

/**
 * Formato de dinero CRIPTO-AWARE para el carril de mercado: en USD (fiat) formatMoney usa 0 decimales,
 * así que un precio/ATH < $1 (DOGE ~$0,24, KMNO ATH ~$0,2478) se mostraba como "$0" — parecía "sin
 * dato". Acá se dan decimales por MAGNITUD: valores ≥ 1 quedan limpios (0 dec, como antes); los < 1
 * muestran decimales para no colapsar a "$0". Puro.
 */
export function formatMarketMoney(n: number, currency: string): string {
  const a = Math.abs(n);
  const dec = a === 0 || a >= 1 ? 0 : a >= 0.01 ? 4 : 6;
  const s = formatMoney(n, currency, dec);
  // Los decimales fijos padean ceros ("$0,2400"): en un precio sobran. Si hay parte decimal
  // (separador ","), quito los ceros finales y una coma huérfana. Los enteros (miles con ".") no se tocan.
  return s.includes(",") ? s.replace(/0+$/, "").replace(/,$/, "") : s;
}

/** Alcance de la pregunta: altcoins (cripto EXCEPTO BTC), toda la cripto, o todas las inversiones. */
export type ScopeKind = "altcoins" | "crypto" | "all";

/** Modificador de precio por posición: % del ATH, el ATH pleno, o el precio actual. */
export type PriceModifier =
  { kind: "pct_ath"; pct: number } | { kind: "ath" } | { kind: "current" };

/** Símbolo que cuenta como "altcoin": cripto y NO Bitcoin. (Stablecoins NO se excluyen: el criterio es solo ≠ BTC.) */
export function isAltcoin(assetType: string, symbol: string | null): boolean {
  return assetType === "cripto" && (symbol ?? "").toUpperCase() !== "BTC";
}

/** Detecta alcance MÚLTIPLE ("todos mis altcoins", "toda mi cripto", "todas mis inversiones"). null si es una sola posición. */
export function parseMultiScope(text: string): ScopeKind | null {
  const t = text.toLowerCase();
  // Requiere un cuantificador "todo/todos/todas" o el plural genérico para no confundir con un símbolo.
  if (/\baltcoins?\b/.test(t)) return "altcoins";
  if (
    /\b(?:toda|todas?|todo)\b[^.]*\b(?:cripto|criptos|criptomonedas?)\b|\bmis\s+criptos?\b/.test(t)
  )
    return "crypto";
  if (
    /\b(?:toda|todas?|todo)\b[^.]*\b(?:inversion|inversiones|posiciones|portafolio|cartera|holdings?)\b/.test(
      t,
    )
  )
    return "all";
  return null;
}

/**
 * Modificador de precio del texto. Si hay % junto a ATH/máximo → pct_ath; "precio actual/hoy" →
 * current; ATH/máximo suelto → ath. Sin señal → null (el llamador puede asumir "current").
 */
export function parsePriceModifier(text: string): PriceModifier | null {
  const t = text.toLowerCase();
  const pctM = t.match(/(\d{1,3}(?:[.,]\d+)?)\s*%/);
  const mentionsAth = /\bath\b|m[aá]ximo/.test(t);
  if (pctM && mentionsAth) {
    const pct = Number(pctM[1]!.replace(",", "."));
    if (Number.isFinite(pct) && pct > 0) return { kind: "pct_ath", pct };
  }
  if (/precio actual|al precio de hoy|precio de hoy|\bactual\b|\bhoy\b/.test(t))
    return { kind: "current" };
  if (mentionsAth) return { kind: "ath" };
  return null;
}

/** Símbolos cotizables (tienen precio de mercado). */
const QUOTABLE = new Set(["cripto", "etf", "accion"]);

export type ScopeHolding = { symbol: string | null; assetType: string };

/** Filtra los holdings del alcance pedido. */
export function filterByScope<T extends ScopeHolding>(holdings: T[], scope: ScopeKind): T[] {
  if (scope === "altcoins") return holdings.filter((h) => isAltcoin(h.assetType, h.symbol));
  if (scope === "crypto") return holdings.filter((h) => h.assetType === "cripto");
  return holdings.filter((h) => QUOTABLE.has(h.assetType));
}

// ── Cómputo puro ──

export type HoldingScenarioInput = {
  symbol: string;
  quantity: number;
  investedScen: number; // invertido YA convertido a la moneda del escenario (scenCurrency)
  scenCurrency: string; // moneda del precio/ATH (USD en cripto)
  high: number | null; // ATH en scenCurrency (null si el store no lo tiene)
  price: number | null; // precio actual en scenCurrency
};

export type PerHolding = {
  symbol: string;
  currency: string;
  targetPrice: number | null;
  value: number | null;
  gain: number | null;
  missing: boolean; // el modificador necesita un dato (ATH/precio) que no está
};

export type MultiScenario = {
  perHolding: PerHolding[];
  totalsByCurrency: { currency: string; value: number; gain: number; count: number }[];
  missing: string[]; // símbolos que quedaron fuera del total por falta de dato
};

/** Precio objetivo de una posición según el modificador. null si falta el dato necesario. */
function targetFor(mod: PriceModifier, high: number | null, price: number | null): number | null {
  if (mod.kind === "current") return price;
  if (mod.kind === "ath") return high;
  return high === null ? null : high * (mod.pct / 100); // pct_ath
}

/**
 * Calcula el escenario multi-posición: por holding valor = cantidad × precioObjetivo y ganancia =
 * valor − invertido; suma total por moneda. Una posición sin el dato necesario NO rompe el total:
 * queda `missing` y se reporta aparte. Puro y determinista (Math.round como el motor de una posición).
 */
export function computeMultiScenario(
  rows: HoldingScenarioInput[],
  mod: PriceModifier,
): MultiScenario {
  const perHolding: PerHolding[] = [];
  const totals = new Map<string, { value: number; gain: number; count: number }>();
  const missing: string[] = [];

  for (const r of rows) {
    const target = targetFor(mod, r.high, r.price);
    if (target === null || !(target > 0) || !(r.quantity > 0)) {
      perHolding.push({
        symbol: r.symbol,
        currency: r.scenCurrency,
        targetPrice: null,
        value: null,
        gain: null,
        missing: true,
      });
      missing.push(r.symbol);
      continue;
    }
    const value = Math.round(r.quantity * target);
    const gain = Math.round(value - r.investedScen);
    perHolding.push({
      symbol: r.symbol,
      currency: r.scenCurrency,
      targetPrice: target,
      value,
      gain,
      missing: false,
    });
    const acc = totals.get(r.scenCurrency) ?? { value: 0, gain: 0, count: 0 };
    acc.value += value;
    acc.gain += gain;
    acc.count += 1;
    totals.set(r.scenCurrency, acc);
  }

  const totalsByCurrency = [...totals.entries()].map(([currency, v]) => ({ currency, ...v }));
  return { perHolding, totalsByCurrency, missing };
}

/** Etiqueta legible del modificador para la respuesta ("al 90% de su ATH"). */
function modLabel(mod: PriceModifier): string {
  if (mod.kind === "current") return "al precio actual";
  if (mod.kind === "ath") return "a su ATH (máximo histórico)";
  return `al ${trimNum(mod.pct)}% de su ATH`;
}

function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
}

/**
 * Redacta la respuesta multi-posición: total por moneda, desglose por posición y el guardaraíl.
 * Puro. `scopeLabel` = "tus altcoins" / "toda tu cripto" / "todas tus inversiones".
 */
export function buildMultiReply(
  scenario: MultiScenario,
  mod: PriceModifier,
  scopeLabel: string,
): string {
  const computed = scenario.perHolding.filter((p) => !p.missing);
  if (computed.length === 0) {
    return `No pude calcular el escenario de ${scopeLabel}: me falta el precio/ATH de ${scenario.missing.length ? scenario.missing.join(", ") : "esas posiciones"} en la fuente ahora. Reintentá en un momento o decime un precio objetivo.`;
  }
  const money = (n: number, c: string) => formatMarketMoney(n, c);
  const totalLines = scenario.totalsByCurrency.map((t) => {
    const signo = t.gain >= 0 ? "+" : "";
    return `${money(t.value, t.currency)} (ganancia ${signo}${money(t.gain, t.currency)} sobre lo invertido)`;
  });
  const detalle = computed
    .map(
      (p) =>
        `· ${p.symbol}: ${money(p.value!, p.currency)} (${p.gain! >= 0 ? "+" : ""}${money(p.gain!, p.currency)})`,
    )
    .join("\n");

  let reply = `Vendiendo ${scopeLabel} ${modLabel(mod)} (${computed.length} ${computed.length === 1 ? "posición" : "posiciones"}): total ${totalLines.join(" · ")}.\n${detalle}`;
  if (scenario.missing.length) {
    reply += `\nMe faltó el ${mod.kind === "current" ? "precio" : "ATH"} de ${scenario.missing.join(", ")} — quedaron fuera del total.`;
  }
  reply += `\nOjo: es un escenario a un precio hipotético (${modLabel(mod)}, un valor pasado), no una predicción; el techo no se cronometra.`;
  return reply;
}

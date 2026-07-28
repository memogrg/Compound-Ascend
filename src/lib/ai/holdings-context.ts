/**
 * Mapeo PURO de las posiciones del portafolio al contexto compacto de la IA. Sin IO: recibe los
 * holdings con rendimiento (del motor de analytics, en moneda principal) y devuelve el top-N por
 * valor + los agregados. Vive aparte para testearse sin el setup del context-engine.
 */

export type HoldingPerf = {
  symbol?: string | null;
  label?: string | null;
  quantity: number;
  costBasis: number;
  currentValue: number;
  currentPrice?: number | null;
  profitLoss: number;
  returnPct: number;
  currency: string;
  priceUnavailable: boolean;
};

export type HoldingContext = {
  symbol: string | null;
  name: string;
  quantity: number;
  invested: number;
  value: number;
  price: number | null;
  pl: number;
  plPct: number;
  currency: string;
  priceUnavailable: boolean;
};

export type HoldingsContext = {
  holdings: HoldingContext[];
  holdingsMoreCount?: number;
  investmentInvested: number;
  investmentValue: number;
  investmentPL: number;
};

/** Máximo de posiciones listadas en el prompt (COMPACTO: el resto va como holdingsMoreCount). */
export const MAX_HOLDINGS_IN_CONTEXT = 12;

/**
 * Top-N posiciones por valor + agregados. `totalCostBasis`/`totalProfitLoss` son los del motor.
 * Devuelve null si no hay posiciones (el contexto no agrega la sección).
 */
export function mapHoldingsForContext(
  perf: HoldingPerf[],
  totalCostBasis: number,
  totalProfitLoss: number,
  max = MAX_HOLDINGS_IN_CONTEXT,
): HoldingsContext | null {
  if (perf.length === 0) return null;
  const sorted = [...perf].sort((a, b) => b.currentValue - a.currentValue);
  const holdings: HoldingContext[] = sorted.slice(0, max).map((h) => ({
    symbol: h.symbol || null,
    name: h.label || h.symbol || "inversión",
    quantity: h.quantity,
    invested: Math.round(h.costBasis),
    value: Math.round(h.currentValue),
    price: h.priceUnavailable || h.currentPrice == null ? null : Math.round(h.currentPrice),
    pl: Math.round(h.profitLoss),
    plPct: h.returnPct,
    currency: h.currency,
    priceUnavailable: h.priceUnavailable,
  }));
  return {
    holdings,
    ...(sorted.length > max ? { holdingsMoreCount: sorted.length - max } : {}),
    investmentInvested: Math.round(totalCostBasis),
    investmentValue: Math.round(totalCostBasis + totalProfitLoss),
    investmentPL: Math.round(totalProfitLoss),
  };
}

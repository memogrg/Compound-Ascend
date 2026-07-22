/**
 * Decisión del EXCEDENTE (F3): cuando emergencia+paz están cubiertos y hay flujo libre sobrante,
 * comparar ABONAR extra a la deuda vs INVERTIR. Puro, determinista, sin IO.
 *
 * PRINCIPIO NO NEGOCIABLE: la app INFORMA, no ordena. Todo lo forward es un RANGO con el peor
 * caso visible; nunca una línea única. No es asesoría financiera.
 *
 * - ABONAR = CERTEZA: interés garantizado ahorrado. Lo calcula el SERVICIO con el motor de
 *   amortización (compareExtra) y se pasa como `pay` — este engine no depende de control (puro).
 * - INVERTIR = RANGO: 3 escenarios (peor/típico/mejor período histórico de esa duración) + la
 *   CAÍDA MÁXIMA histórica siempre visible. Datos: constantes históricas CITADAS por clase de
 *   activo (ver ASSET_HISTORY). Aproximados a propósito — el punto es el rango, no un número exacto.
 */

/** Tasa por debajo de la cual TIENE SENTIDO plantear invertir en vez de abonar. Arriba de esto,
 *  abonar es un retorno garantizado que ningún activo supera con certeza → pagá la deuda. */
export const DEBT_INVEST_THRESHOLD = 0.12; // 12% anual

export type AssetClass = "sp500" | "nasdaq" | "btc";

/**
 * Rangos históricos APROXIMADOS por clase de activo (retorno anualizado nominal de ventanas
 * largas + caída máxima pico-a-valle). Citados; NO son promesas — el pasado no garantiza el
 * futuro. Se actualizan a mano (por eso la caída máxima y el disclaimer siempre visibles).
 *
 * Fuentes (aproximadas, orden de magnitud):
 *  - S&P 500: ~10% anual nominal 1926-2023 (con dividendos). Peor ventana de ~10-15 años ~1-3%.
 *    Caída máxima ~-57% (2007-2009). [SBBI / S&P Dow Jones Indices]
 *  - Nasdaq (100/Compuesto): ~13% anual desde ~1985; más volátil. Caída máxima ~-78%
 *    (burbuja puntocom 2000-2002). [Nasdaq]
 *  - BTC: retornos históricos altísimos pero con caídas >-77% (2018, 2022) — astilla de alto
 *    riesgo, no el camino principal. [datos de mercado]
 */
export type AssetHistory = {
  key: AssetClass;
  label: string;
  worstCAGR: number; // peor ventana histórica (anualizado)
  typicalCAGR: number; // mediana histórica (anualizado)
  bestCAGR: number; // mejor ventana histórica (anualizado)
  maxDrawdown: number; // peor caída pico-a-valle (negativo)
  /** Astilla de cartera de alto riesgo (BTC): caveat fuerte, nunca el plan principal. */
  sliver?: boolean;
  caveat?: string;
  source: string;
};

export const ASSET_HISTORY: Record<AssetClass, AssetHistory> = {
  sp500: {
    key: "sp500",
    label: "S&P 500",
    worstCAGR: 0.02,
    typicalCAGR: 0.1,
    bestCAGR: 0.15,
    maxDrawdown: -0.57,
    source: "S&P Dow Jones Indices / SBBI (aprox., 1926-2023, nominal con dividendos)",
  },
  nasdaq: {
    key: "nasdaq",
    label: "Nasdaq",
    worstCAGR: -0.01,
    typicalCAGR: 0.13,
    bestCAGR: 0.18,
    maxDrawdown: -0.78,
    source: "Nasdaq (aprox., desde ~1985; caída máxima puntocom 2000-2002)",
  },
  btc: {
    key: "btc",
    label: "Bitcoin",
    worstCAGR: -0.3,
    typicalCAGR: 0.25,
    bestCAGR: 0.6,
    maxDrawdown: -0.8,
    sliver: true,
    caveat:
      "Altísima volatilidad: ha caído más de 70% varias veces (2018, 2022). Podés perder la mayor parte. Como mucho, una astilla chica de la cartera — nunca el plan para pagar la casa.",
    source: "datos de mercado (aprox.; caídas >-77% en 2018 y 2022)",
  },
};

/** Los tres benchmarks del comparador, en orden de presentación (BTC último, como astilla). */
export const SURPLUS_ASSETS: AssetClass[] = ["sp500", "nasdaq", "btc"];

/** Valor futuro de una anualidad mensual (aporte constante) a una tasa anual, en `years` años. */
export function investFutureValue(monthly: number, annualReturn: number, years: number): number {
  const m = Math.max(0, monthly);
  const n = Math.max(0, Math.round(years * 12));
  const r = annualReturn / 12;
  if (n === 0) return 0;
  if (Math.abs(r) < 1e-9) return m * n;
  return m * ((Math.pow(1 + r, n) - 1) / r);
}

export type InvestScenario = {
  band: "peor" | "tipico" | "mejor";
  annualReturn: number;
  endValue: number;
};

export type InvestProjection = {
  asset: AssetClass;
  label: string;
  contributed: number; // total aportado en el horizonte
  scenarios: InvestScenario[]; // SIEMPRE 3 (peor/típico/mejor), nunca una línea única
  maxDrawdown: number; // caída máxima histórica, siempre visible
  sliver?: boolean;
  caveat?: string;
  source: string;
};

/** Proyecta el excedente mensual invertido en un activo como RANGO de 3 escenarios + maxDD. */
export function projectInvestment(
  monthly: number,
  years: number,
  asset: AssetClass,
): InvestProjection {
  const h = ASSET_HISTORY[asset];
  const scenario = (band: InvestScenario["band"], annualReturn: number): InvestScenario => ({
    band,
    annualReturn,
    endValue: Math.round(investFutureValue(monthly, annualReturn, years)),
  });
  return {
    asset,
    label: h.label,
    contributed: Math.round(Math.max(0, monthly) * Math.max(0, Math.round(years * 12))),
    scenarios: [
      scenario("peor", h.worstCAGR),
      scenario("tipico", h.typicalCAGR),
      scenario("mejor", h.bestCAGR),
    ],
    maxDrawdown: h.maxDrawdown,
    sliver: h.sliver,
    caveat: h.caveat,
    source: h.source,
  };
}

export type SurplusComparison = {
  monthlySurplus: number;
  horizonYears: number;
  apr: number | null; // TAE de la deuda comparada (null si no hay deuda)
  /** true = la deuda supera el umbral → la app dice "pagá la deuda", sin comparación de inversión. */
  gated: boolean;
  /** Lado CERTEZA (abonar). null si no hay deuda que abonar. */
  pay: { interestSaved: number; monthsSaved: number } | null;
  /** Lado RANGO (invertir). Vacío si `gated` (con deuda cara, no se plantea invertir). */
  invest: InvestProjection[];
};

/**
 * Compara dirigir el excedente mensual a ABONAR la deuda vs INVERTIRLO, en el horizonte dado.
 * GATE: si la TAE de la deuda (`apr`, DECIMAL) > DEBT_INVEST_THRESHOLD, NO se muestra inversión
 * (pagá la deuda). `pay` (interés/meses ahorrados) lo calcula el servicio con amortización.
 */
export function compareSurplus(input: {
  monthlySurplus: number;
  horizonYears: number;
  apr: number | null; // TAE en DECIMAL (0.08 = 8%); null = sin deuda que abonar
  pay: { interestSaved: number; monthsSaved: number } | null;
}): SurplusComparison {
  const surplus = Math.max(0, input.monthlySurplus);
  const years = Math.max(0, input.horizonYears);
  const gated = input.apr !== null && input.apr > DEBT_INVEST_THRESHOLD;

  // Con deuda cara (gated) no se plantea invertir: abonar es el retorno garantizado.
  const invest = gated ? [] : SURPLUS_ASSETS.map((a) => projectInvestment(surplus, years, a));

  return { monthlySurplus: surplus, horizonYears: years, apr: input.apr, gated, pay: input.pay, invest };
}

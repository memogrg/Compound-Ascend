import "server-only";

/**
 * Servicio de portafolio: orquesta holdings, precios en vivo, motores de
 * cálculo y analytics completos. Todos los montos se normalizan a la moneda
 * principal del usuario antes de pasarse al motor.
 */
import { requireUser } from "@/lib/auth/session";
import { getMarketPrice, type AssetType as MarketAssetType } from "@/lib/market-data";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { convertCurrency } from "@/lib/fx";
import { getPrimaryCurrency } from "@/modules/financial-base";
import { listHoldings } from "@/modules/wealth/services/holdings-service";
import { listDividends } from "@/modules/wealth/services/dividend-service";
import {
  computePortfolioAnalytics,
  computeGrowthScore,
  computeDividendAnalytics,
  computeCryptoAnalytics,
} from "@/modules/wealth/engine/portfolio-engine";
import { getWealthSummary } from "@/modules/wealth/services/wealth-service";
import type {
  Holding,
  PortfolioAnalytics,
  DividendAnalytics,
  CryptoAnalytics,
} from "@/modules/wealth/types";

const MARKET_TYPE: Partial<Record<string, MarketAssetType>> = {
  etf: "etf",
  accion: "stock",
  cripto: "crypto",
};

export type PortfolioReport = {
  holdings: Holding[];
  analytics: PortfolioAnalytics;
  dividendAnalytics: DividendAnalytics;
  cryptoAnalytics: CryptoAnalytics;
  currency: string;
  lastUpdated: string;
};

/** Obtiene precios en vivo para los holdings cotizables y los normaliza a la moneda principal. */
async function fetchNormalizedPrices(
  holdings: Holding[],
  primaryCurrency: string,
  rates: Record<string, number>,
): Promise<Record<string, number>> {
  const quotable = holdings.filter((h) => MARKET_TYPE[h.assetType]);
  const prices: Record<string, number> = {};
  await Promise.all(
    quotable.map(async (h) => {
      const marketType = MARKET_TYPE[h.assetType]!;
      const quote = await getMarketPrice(h.symbol, marketType);
      if (quote) {
        prices[h.symbol.toUpperCase()] = convertCurrency(
          quote.price,
          quote.currency,
          primaryCurrency,
          rates,
        );
      }
    }),
  );
  return prices;
}

/** Normaliza el costo promedio de cada holding a la moneda principal. */
function normalizeHoldings(
  holdings: Holding[],
  primaryCurrency: string,
  rates: Record<string, number>,
): Holding[] {
  return holdings.map((h) => ({
    ...h,
    averageCost: convertCurrency(h.averageCost, h.currency, primaryCurrency, rates),
  }));
}

/** Normaliza montos de dividendos a la moneda principal. */
function normalizeDividendAmounts(
  dividends: import("@/modules/wealth/types").Dividend[],
  primaryCurrency: string,
  rates: Record<string, number>,
): import("@/modules/wealth/types").Dividend[] {
  return dividends.map((d) => ({
    ...d,
    amount: convertCurrency(d.amount, d.currency, primaryCurrency, rates),
  }));
}

export async function getPortfolioReport(): Promise<PortfolioReport> {
  await requireUser();

  const [holdings, dividends, currency, rates, wealthSummary] = await Promise.all([
    listHoldings(),
    listDividends(),
    getPrimaryCurrency(),
    getFxRates(),
    getWealthSummary(),
  ]);

  const normalizedHoldings = normalizeHoldings(holdings, currency, rates);
  const prices = await fetchNormalizedPrices(holdings, currency, rates);
  const normalizedDividends = normalizeDividendAmounts(dividends, currency, rates);

  const baseAnalytics = computePortfolioAnalytics(normalizedHoldings, prices);
  const growthScore = computeGrowthScore(baseAnalytics, wealthSummary.readiness);

  const analytics: PortfolioAnalytics = { ...baseAnalytics, growthScore };

  const dividendAnalytics = computeDividendAnalytics(
    normalizedDividends,
    analytics.totalPortfolioValue,
    analytics.totalCostBasis,
  );

  const cryptoAnalytics = computeCryptoAnalytics(
    normalizedHoldings,
    prices,
    analytics.totalPortfolioValue,
  );

  return {
    holdings,
    analytics,
    dividendAnalytics,
    cryptoAnalytics,
    currency,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Valor de mercado actual del portafolio (para integración con patrimonio neto).
 * Devuelve un mapa investmentId → currentMarketValue en moneda principal.
 * Holdings sin investmentId se agrupan en "_standalone".
 */
export async function getPortfolioMarketValues(): Promise<{
  byInvestmentId: Record<string, number>;
  total: number;
  currency: string;
}> {
  const [holdings, currency, rates] = await Promise.all([
    listHoldings(),
    getPrimaryCurrency(),
    getFxRates(),
  ]);

  const normalizedHoldings = normalizeHoldings(holdings, currency, rates);
  const prices = await fetchNormalizedPrices(holdings, currency, rates);

  const byInvestmentId: Record<string, number> = {};
  let total = 0;

  for (const h of normalizedHoldings) {
    const price = prices[h.symbol.toUpperCase()];
    const value = price !== undefined ? h.quantity * price : h.quantity * h.averageCost;
    const key = h.investmentId ?? "_standalone";
    byInvestmentId[key] = (byInvestmentId[key] ?? 0) + value;
    total += value;
  }

  return { byInvestmentId, total, currency };
}

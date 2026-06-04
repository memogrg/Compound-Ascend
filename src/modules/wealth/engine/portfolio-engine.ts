/**
 * Motor de portafolio (puro, testeable): performance por holding, analíticas
 * agregadas, dividendos, cripto y score de crecimiento.
 *
 * Precondición: todos los montos deben estar normalizados a la moneda principal
 * del usuario antes de llamar estas funciones (conversión en la capa de servicio).
 */
import type {
  Holding,
  HoldingPerformance,
  Dividend,
  PortfolioAnalytics,
  DividendAnalytics,
  CryptoAnalytics,
  AllocationSlice,
  InvestmentInsights,
  InvestmentReadiness,
} from "@/modules/wealth/types";

// ── Helpers ──────────────────────────────────────────────────────

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

const ETF_TYPES = new Set(["etf"]);
const STOCK_TYPES = new Set(["accion", "bono", "fondo", "certificado", "pension", "negocio"]);
const CRYPTO_TYPES = new Set(["cripto"]);

type Bucket = "etf" | "stock" | "crypto" | "cash" | "other";

function assetBucket(assetType: string): Bucket {
  if (ETF_TYPES.has(assetType)) return "etf";
  if (STOCK_TYPES.has(assetType)) return "stock";
  if (CRYPTO_TYPES.has(assetType)) return "crypto";
  return "other";
}

const BUCKET_LABEL: Record<Bucket, string> = {
  etf: "ETFs",
  stock: "Acciones",
  crypto: "Cripto",
  cash: "Efectivo",
  other: "Otros",
};

const BUCKET_COLOR: Record<Bucket, string> = {
  etf: "var(--pos)",
  stock: "var(--info)",
  crypto: "var(--gold)",
  cash: "var(--teal)",
  other: "var(--muted-2)",
};

// ── Performance por holding ───────────────────────────────────────

/**
 * Calcula performance de un holding individual.
 * currentPrice en undefined → currentValue = costBasis (sin ganancia/pérdida).
 */
export function computeHoldingPerformance(
  holding: Holding,
  currentPrice?: number,
): HoldingPerformance {
  const costBasis = holding.quantity * holding.averageCost;
  const currentValue = currentPrice !== undefined ? holding.quantity * currentPrice : costBasis;
  const profitLoss = currentValue - costBasis;
  const returnPct = costBasis > 0 ? profitLoss / costBasis : 0;
  return { ...holding, currentPrice, currentValue, costBasis, profitLoss, returnPct };
}

// ── Analíticas de portafolio ──────────────────────────────────────

/**
 * Calcula analíticas completas del portafolio.
 *
 * @param holdings  Holdings del usuario (montos en moneda principal).
 * @param prices    Mapa symbol → precio en moneda principal.
 * @param cashAmount Efectivo/liquidez adicional en moneda principal (default 0).
 */
export function computePortfolioAnalytics(
  holdings: Holding[],
  prices: Record<string, number>,
  cashAmount = 0,
): Omit<PortfolioAnalytics, "growthScore"> {
  const buckets: Record<Bucket, number> = { etf: 0, stock: 0, crypto: 0, cash: cashAmount, other: 0 };
  let totalCostBasis = 0;

  const holdingsWithPerformance: HoldingPerformance[] = holdings.map((h) => {
    const price = prices[h.symbol.toUpperCase()];
    const perf = computeHoldingPerformance(h, price);
    const bucket = assetBucket(h.assetType);
    buckets[bucket] += perf.currentValue;
    totalCostBasis += perf.costBasis;
    return perf;
  });

  const totalPortfolioValue = (Object.values(buckets) as number[]).reduce((s, v) => s + v, 0);
  const totalProfitLoss = totalPortfolioValue - cashAmount - totalCostBasis;
  const totalReturnPct = totalCostBasis > 0 ? totalProfitLoss / totalCostBasis : 0;

  function makeSlice(key: Bucket): AllocationSlice {
    const value = buckets[key];
    return {
      label: BUCKET_LABEL[key],
      value,
      pct: totalPortfolioValue > 0 ? value / totalPortfolioValue : 0,
      color: BUCKET_COLOR[key],
    };
  }

  return {
    totalPortfolioValue,
    totalCostBasis,
    totalProfitLoss,
    totalReturnPct,
    allocation: {
      etf: makeSlice("etf"),
      stock: makeSlice("stock"),
      crypto: makeSlice("crypto"),
      cash: makeSlice("cash"),
      other: makeSlice("other"),
    },
    holdingsWithPerformance,
  };
}

// ── Score de crecimiento (0-100) ──────────────────────────────────

/**
 * Score compuesto de salud de crecimiento:
 * - Rendimiento del portafolio (30 pts): 10%+ return = full
 * - Diversificación (30 pts): ≥4 buckets con valor = full
 * - Estado de preparación para invertir (40 pts): basado en readiness.state
 */
export function computeGrowthScore(
  analytics: Omit<PortfolioAnalytics, "growthScore">,
  readiness: InvestmentReadiness,
): number {
  if (analytics.totalCostBasis === 0) return 0;

  const returnScore = clamp01(analytics.totalReturnPct / 0.1) * 30;

  const activeBuckets = (Object.values(analytics.allocation) as AllocationSlice[]).filter(
    (s) => s.value > 0,
  ).length;
  const diversScore = clamp01(activeBuckets / 4) * 30;

  const readinessMap: Record<InvestmentReadiness["state"], number> = {
    no_listo: 0,
    empezar_pequeno: 15,
    constante: 25,
    diversificar: 35,
    optimizar: 40,
  };
  const readinessScore = readinessMap[readiness.state] ?? 0;

  return Math.min(100, Math.round(returnScore + diversScore + readinessScore));
}

// ── Analíticas de dividendos ──────────────────────────────────────

/**
 * Calcula métricas de dividendos.
 * Los amounts en `dividends` deben estar en moneda principal.
 */
export function computeDividendAnalytics(
  dividends: Dividend[],
  portfolioValue: number,
  costBasis: number,
): DividendAnalytics {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const annualDividends = dividends
    .filter((d) => new Date(d.paymentDate) >= oneYearAgo)
    .reduce((s, d) => s + d.amount, 0);

  const monthlyDividends = annualDividends / 12;

  return {
    monthlyDividends,
    annualDividends,
    dividendYield: portfolioValue > 0 ? annualDividends / portfolioValue : 0,
    yieldOnCost: costBasis > 0 ? annualDividends / costBasis : 0,
  };
}

// ── Analíticas de cripto ──────────────────────────────────────────

export function computeCryptoAnalytics(
  holdings: Holding[],
  prices: Record<string, number>,
  totalPortfolioValue: number,
): CryptoAnalytics {
  const cryptoHoldings = holdings.filter((h) => h.assetType === "cripto");
  let currentValue = 0;
  let costBasis = 0;

  for (const h of cryptoHoldings) {
    const perf = computeHoldingPerformance(h, prices[h.symbol.toUpperCase()]);
    currentValue += perf.currentValue;
    costBasis += perf.costBasis;
  }

  return {
    currentValue,
    costBasis,
    profitLoss: currentValue - costBasis,
    allocationPct: totalPortfolioValue > 0 ? currentValue / totalPortfolioValue : 0,
  };
}

// ── Insights deterministas (sin IA, en español) ───────────────────

export function buildConcentrationInsight(analytics: Omit<PortfolioAnalytics, "growthScore">): string {
  const slices = Object.values(analytics.allocation) as AllocationSlice[];
  const top = slices.reduce((a, b) => (a.pct > b.pct ? a : b), slices[0]!);
  if (!top || analytics.totalPortfolioValue === 0) {
    return "Agrega tus posiciones para recibir análisis de concentración.";
  }
  const pct = Math.round(top.pct * 100);
  if (pct >= 70) {
    return `Alta concentración: ${top.label} representa el ${pct}% de tu portafolio. Considera diversificar para reducir el riesgo específico de clase de activo.`;
  }
  if (pct >= 50) {
    return `Concentración moderada: ${top.label} domina con el ${pct}%. Dentro de ese bloque, verifica que no haya concentración excesiva en un solo emisor.`;
  }
  return `Buena distribución: ninguna clase de activo supera el 50%. ${top.label} es tu mayor exposición con el ${pct}%.`;
}

export function buildDiversificationInsight(analytics: Omit<PortfolioAnalytics, "growthScore">): string {
  const activeBuckets = (Object.values(analytics.allocation) as AllocationSlice[]).filter(
    (s) => s.value > 0,
  );
  const count = activeBuckets.length;

  if (count === 0) return "Sin posiciones registradas aún.";
  if (count === 1) {
    return `Portafolio en una sola clase de activo (${activeBuckets[0]!.label}). Agregar una segunda clase reduce la volatilidad sin sacrificar rendimiento esperado.`;
  }
  if (count === 2) {
    return `Tienes dos clases de activo (${activeBuckets.map((s) => s.label).join(" y ")}). Añadir una tercera mejora la resiliencia ante shocks sectoriales.`;
  }
  if (count >= 4) {
    return `Diversificación sólida: estás expuesto a ${count} clases de activo. Revisa periódicamente que los pesos no se desvíen de tu objetivo por movimientos de mercado.`;
  }
  return `Tienes ${count} clases de activo. Una diversificación de 4+ clases es el objetivo para portafolios equilibrados.`;
}

export function buildDividendInsight(
  dividendAnalytics: DividendAnalytics,
  currency: string,
): string {
  if (dividendAnalytics.annualDividends === 0) {
    return "No registras dividendos en los últimos 12 meses. Si tienes ETFs o acciones que distribuyen, agrégalos para ver tu ingreso pasivo real.";
  }
  const yieldPct = (dividendAnalytics.dividendYield * 100).toFixed(2);
  const yocPct = (dividendAnalytics.yieldOnCost * 100).toFixed(2);
  return `Tu portafolio generó dividendos en los últimos 12 meses con un rendimiento del ${yieldPct}% sobre valor de mercado y ${yocPct}% sobre costo (${currency}). El yield on cost refleja cuánto ganas sobre lo que invertiste originalmente.`;
}

export function buildPassiveIncomeInsight(
  monthlyDividends: number,
  monthlyExpenses: number,
  currency: string,
): string {
  if (monthlyDividends === 0) {
    return "Tus inversiones aún no generan ingreso pasivo medible. Posicionar una parte en activos generadores de renta (dividendos, REITs, bonos) acelera la independencia financiera.";
  }
  if (monthlyExpenses <= 0) {
    return `Tus dividendos mensuales aproximados son ${currency} ${monthlyDividends.toFixed(0)}. Agrega tus gastos mensuales para calcular qué porcentaje de tu vida financian.`;
  }
  const coveragePct = Math.round((monthlyDividends / monthlyExpenses) * 100);
  if (coveragePct >= 100) {
    return `Tus dividendos cubren el ${coveragePct}% de tus gastos mensuales — una señal sólida de independencia financiera parcial.`;
  }
  return `Tus dividendos cubren el ${coveragePct}% de tus gastos mensuales (${currency}). Llegar al 100% significa que las inversiones financian tu vida sin depender del trabajo activo.`;
}

export function buildAllocationInsight(
  analytics: Omit<PortfolioAnalytics, "growthScore">,
  riskClass: string | null,
): string {
  if (!riskClass || analytics.totalPortfolioValue === 0) {
    return "Define tu perfil de riesgo para recibir recomendaciones de asignación personalizadas.";
  }

  const { etf, stock, crypto } = analytics.allocation;
  const riskLabel: Record<string, string> = {
    conservador: "una mayor exposición a instrumentos de renta fija (bonos, certificados) y menor a renta variable y cripto",
    moderado: "una mezcla balanceada de ETFs y acciones con baja exposición a cripto (≤5%)",
    balanceado: "ETFs de amplio mercado como base, con acciones individuales complementarias",
    crecimiento: "alta exposición a renta variable (ETFs + acciones), con un 5-15% en cripto si tu horizonte es largo",
    agresivo: "máxima exposición a renta variable y cripto, aceptando alta volatilidad por mayor rendimiento esperado",
  };

  const suggestion = riskLabel[riskClass] ?? "un portafolio acorde a tu tolerancia al riesgo";
  const highCrypto = crypto.pct > 0.2;
  const highSingle = stock.pct > 0.7 || etf.pct > 0.7;

  const flags: string[] = [];
  if (highCrypto) flags.push(`alta exposición a cripto (${Math.round(crypto.pct * 100)}%)`);
  if (highSingle) {
    const label = etf.pct > 0.7 ? "ETFs" : "acciones";
    flags.push(`concentración en ${label} (${Math.round(Math.max(etf.pct, stock.pct) * 100)}%)`);
  }

  const base = `Para un perfil ${riskClass}, se sugiere ${suggestion}.`;
  if (flags.length > 0) {
    return `${base} Actualmente tienes ${flags.join(" y ")}, lo que puede no alinearse con tu perfil.`;
  }
  return `${base} Tu asignación actual es consistente con tu perfil.`;
}

export function buildInvestmentInsights(
  analytics: Omit<PortfolioAnalytics, "growthScore">,
  dividendAnalytics: DividendAnalytics,
  riskClass: string | null,
  monthlyExpenses: number,
  currency: string,
): InvestmentInsights {
  return {
    concentrationAnalysis: buildConcentrationInsight(analytics),
    diversificationAnalysis: buildDiversificationInsight(analytics),
    dividendInsights: buildDividendInsight(dividendAnalytics, currency),
    passiveIncomeInsights: buildPassiveIncomeInsight(
      dividendAnalytics.monthlyDividends,
      monthlyExpenses,
      currency,
    ),
    allocationInsights: buildAllocationInsight(analytics, riskClass),
  };
}

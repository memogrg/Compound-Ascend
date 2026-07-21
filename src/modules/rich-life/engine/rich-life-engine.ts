/**
 * Motor de Mi Rich Life (puro, testeable). Consolida activos, pasivos, ingreso
 * pasivo, liquidez y protección en patrimonio neto, ~14 indicadores y el Rich
 * Life Score. Responde: ¿me estoy haciendo más rico, estable o más pobre?
 */
import type {
  RichLifeInput,
  RichLifeIndicators,
  RichLifeScore,
  RichLifeSnapshot,
  RichTrend,
  AssetClass,
  LiabilityClass,
} from "@/modules/rich-life/types";
import { formatMoney } from "@/lib/format";
import { mesesDeColchon } from "@/lib/wealth-math";

const ASSET_COLOR: Record<AssetClass, string> = {
  liquido: "var(--c-savings)",
  inversion: "var(--c-invest)",
  productivo: "var(--pos)",
  uso_personal: "var(--c-expense)",
  especial: "var(--gold)",
};
const ASSET_LABEL: Record<AssetClass, string> = {
  liquido: "Líquidos",
  inversion: "Inversión",
  productivo: "Productivos",
  uso_personal: "Uso personal",
  especial: "Especiales",
};
const LIAB_COLOR: Record<LiabilityClass, string> = {
  consumo: "var(--c-debt)",
  patrimonial: "var(--info)",
  productivo: "var(--c-protect)",
  critico: "var(--neg)",
};
const LIAB_LABEL: Record<LiabilityClass, string> = {
  consumo: "Consumo",
  patrimonial: "Patrimoniales",
  productivo: "Productivos",
  critico: "Críticos",
};

function ratio(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 1000 : 0;
}

export function computeRichLifeIndicators(input: RichLifeInput): RichLifeIndicators {
  const totalAssets = input.assets.reduce((s, a) => s + a.value, 0);
  const totalLiabilities = input.liabilities.reduce((s, l) => s + l.balance, 0);
  const netWorth = Math.round(totalAssets - totalLiabilities);

  const productive = input.assets.filter((a) => a.assetClass === "productivo" || a.generatesIncome);
  const liquid = input.assets.filter((a) => a.assetClass === "liquido");
  const depreciable = input.assets.filter((a) => a.assetClass === "uso_personal");

  const passiveIncomeCoverage = ratio(input.passiveIncomeMonthly, input.monthlyExpenses);
  // Fuente única (mesesDeColchon): mismo cálculo que patrimonio-engine.
  const monthsOfIndependence = mesesDeColchon(sum(liquid), input.monthlyExpenses);

  let trend: RichTrend = "sin_historico";
  let wealthVelocity: number | null = null;
  if (input.previous) {
    wealthVelocity = netWorth - input.previous.netWorth;
    trend = wealthVelocity > 0 ? "mas_rico" : wealthVelocity < 0 ? "mas_pobre" : "estable";
  }

  return {
    netWorth,
    totalAssets,
    totalLiabilities,
    assetLiabilityRatio:
      totalLiabilities > 0
        ? Math.round((totalAssets / totalLiabilities) * 10) / 10
        : totalAssets > 0
          ? Infinity
          : 0,
    debtToAssets: ratio(totalLiabilities, totalAssets),
    productiveAssetsPct: ratio(sum(productive), totalAssets),
    liquidAssetsPct: ratio(sum(liquid), totalAssets),
    depreciablePct: ratio(sum(depreciable), totalAssets),
    passiveIncomeCoverage,
    financialFreedomIndex: passiveIncomeCoverage,
    monthsOfIndependence,
    wealthVelocity,
    trend,
  };
}

function sum(list: { value: number }[]): number {
  return list.reduce((s, a) => s + a.value, 0);
}

/** Rich Life Score con las 8 dimensiones ponderadas de la Biblia. */
export function computeRichLifeScore(ind: RichLifeIndicators, input: RichLifeInput): RichLifeScore {
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
  const dims = [
    {
      label: "Patrimonio neto positivo y creciente",
      weight: 20,
      score:
        (ind.netWorth > 0 ? 0.7 : 0) +
        (ind.trend === "mas_rico" ? 0.3 : ind.trend === "sin_historico" ? 0.15 : 0),
    },
    { label: "Flujo libre mensual positivo", weight: 15, score: input.freeCashflow > 0 ? 1 : 0 },
    {
      label: "Reducción de pasivos críticos",
      weight: 15,
      score: 1 - clamp01(ind.debtToAssets / 0.5),
    },
    {
      label: "Crecimiento de activos productivos",
      weight: 15,
      score: clamp01(ind.productiveAssetsPct / 0.5),
    },
    { label: "Fondo de paz / liquidez", weight: 10, score: clamp01(ind.monthsOfIndependence / 6) },
    {
      label: "Avance hacia objetivos",
      weight: 10,
      score: clamp01(ind.financialFreedomIndex / 0.3),
    },
    { label: "Protección patrimonial", weight: 10, score: clamp01(input.protectionScore / 100) },
    {
      label: "Diversificación",
      weight: 5,
      score: input.diversification === "alta" ? 1 : input.diversification === "media" ? 0.6 : 0.3,
    },
  ].map((d) => ({ ...d, score: clamp01(d.score) }));

  const score = Math.round(dims.reduce((s, d) => s + d.score * d.weight, 0));
  const state =
    score <= 30
      ? "Recuperar control"
      : score <= 50
        ? "Estabilización"
        : score <= 70
          ? "Construcción"
          : score <= 85
            ? "Crecimiento sólido"
            : "Rich Life avanzada";

  return { score, state, dims };
}

export function buildRichLifeSnapshot(input: RichLifeInput): RichLifeSnapshot {
  const indicators = computeRichLifeIndicators(input);
  const score = computeRichLifeScore(indicators, input);

  const assetsByClass = groupBy(
    input.assets,
    (a) => a.assetClass,
    ASSET_LABEL,
    ASSET_COLOR,
    (a) => a.value,
  );
  const liabilitiesByClass = groupBy(
    input.liabilities,
    (l) => l.liabilityClass,
    LIAB_LABEL,
    LIAB_COLOR,
    (l) => l.balance,
  );

  return {
    indicators,
    score,
    reading: buildReading(indicators, input),
    nextBestAction: buildNextAction(indicators, input),
    assetsByClass,
    liabilitiesByClass,
  };
}

function groupBy<T, K extends string>(
  items: T[],
  keyOf: (t: T) => K,
  labels: Record<K, string>,
  colors: Record<K, string>,
  valueOf: (t: T) => number,
): { label: string; value: number; color: string }[] {
  const map = new Map<K, number>();
  for (const it of items) {
    const k = keyOf(it);
    map.set(k, (map.get(k) ?? 0) + valueOf(it));
  }
  return Array.from(map.entries())
    .map(([k, value]) => ({ label: labels[k], value, color: colors[k] }))
    .sort((a, b) => b.value - a.value);
}

function buildReading(ind: RichLifeIndicators, input: RichLifeInput): string {
  const trendMsg =
    ind.trend === "mas_rico"
      ? "Tu tendencia patrimonial es positiva: estás construyendo riqueza real."
      : ind.trend === "mas_pobre"
        ? "Tu patrimonio bajó: tus pasivos crecieron más rápido que tus activos."
        : ind.trend === "estable"
          ? "Tu patrimonio está estable: ni retrocedes ni aceleras."
          : "Aún no tenemos historial; este es tu punto de partida.";
  return (
    `Tu patrimonio neto es ${formatMoney(ind.netWorth, input.currency)}. ` +
    `El ${Math.round(ind.productiveAssetsPct * 100)}% de tus activos trabaja para ti y tus ingresos pasivos cubren el ${Math.round(ind.passiveIncomeCoverage * 100)}% de tus gastos. ` +
    trendMsg
  );
}

function buildNextAction(ind: RichLifeIndicators, input: RichLifeInput): string {
  if (ind.netWorth < 0) {
    return "Prioriza reducir pasivos de consumo: tu patrimonio neto es negativo.";
  }
  if (ind.monthsOfIndependence < 3) {
    return "Fortalece tu liquidez hasta cubrir al menos 3 meses de gastos.";
  }
  if (ind.productiveAssetsPct < 0.4) {
    return "Aumenta tus activos productivos: gran parte de tu patrimonio aún no genera ingresos.";
  }
  if (input.freeCashflow > 0) {
    return "Dirige parte de tu excedente a activos que generen ingreso o crecimiento de largo plazo.";
  }
  return "Mantén el rumbo y registra tu patrimonio cada mes para medir tu velocidad de riqueza.";
}

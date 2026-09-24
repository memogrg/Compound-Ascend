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
import { mesesDeColchon, gastoDeReferencia } from "@/lib/wealth-math";

/**
 * Color por CLASE de activo. Categórico, en orden fijo, y el orden no se reordena nunca:
 * el color pertenece a la clase, no a su tamaño ni a su puesto en la lista.
 *
 * Son tokens `--chart-N` y no tokens semánticos, y eso es el arreglo.
 *
 *  - `--pos`, `--c-expense`, `--c-savings` significan «a favor», «gasto» y «ahorro». Un
 *    activo productivo no es «positivo» en el sentido de la app, y uno de uso personal no es
 *    un gasto: son clases de patrimonio, no estados. Pintarlas con el vocabulario de los
 *    estados le dice al usuario algo que no queríamos decir.
 *  - Y hacía algo peor: `--c-expense` y `--gold` resuelven **los dos a `--s2`** (#b07a2e),
 *    así que «Uso personal» y «Especiales» salían del mismo color exacto y el anillo mostraba
 *    dos porciones indistinguibles. Igual en los pasivos: `--c-debt` y `--neg` son los dos
 *    #c34f4b, y «Consumo» y «Críticos» se confundían.
 *
 * Los seis `--chart-N` están validados para daltonismo y contraste (ver la sección de color
 * de `/dev/ui`) y existen justamente para nombrar series sin opinar sobre ellas. Hay cinco
 * clases de activo y cuatro de pasivo, así que a cada una le toca uno distinto DENTRO de su
 * anillo; los dos anillos son gráficos separados, con su leyenda cada uno, y por eso pueden
 * repetir tokens entre sí sin ambigüedad. Hay un test que lo vigila.
 */
const ASSET_COLOR: Record<AssetClass, string> = {
  liquido: "var(--chart-6)",
  inversion: "var(--chart-2)",
  productivo: "var(--chart-1)",
  uso_personal: "var(--chart-3)",
  especial: "var(--chart-4)",
};
const ASSET_LABEL: Record<AssetClass, string> = {
  liquido: "Líquidos",
  inversion: "Inversión",
  productivo: "Productivos",
  uso_personal: "Uso personal",
  especial: "Especiales",
};
/**
 * Color por CLASE de pasivo. Mismo criterio que `ASSET_COLOR`, y el mismo motivo urgente:
 * `--c-debt` y `--neg` resolvían los dos a #c34f4b, así que «Consumo» y «Críticos» salían
 * idénticos en el anillo.
 *
 * Se pierde algo al hacerlo, y conviene decirlo: el rojo para «Críticos» era una señal, no
 * un color arbitrario. Pero un anillo donde dos clases distintas comparten color no informa
 * de nada, y la criticidad se comunica donde corresponde —en el orden, en el texto y en las
 * señales—, no repitiendo el mismo rojo en dos porciones.
 */
const LIAB_COLOR: Record<LiabilityClass, string> = {
  consumo: "var(--chart-3)",
  patrimonial: "var(--chart-2)",
  productivo: "var(--chart-4)",
  critico: "var(--chart-5)",
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

  // Fuente única (gastoDeReferencia): MISMO denominador que patrimonio-engine, para que
  // /mi-rich-life y los indicadores de Patrimonio no puedan decir cosas distintas. Con la
  // lista base vacía esto daba 0 meses y 0% de cobertura teniendo el colchón lleno.
  const gastoReferencia = gastoDeReferencia(input.monthlyExpenses, input.monthlyCommitment);
  const passiveIncomeCoverage = ratio(input.passiveIncomeMonthly, gastoReferencia);
  // Fuente única (mesesDeColchon): mismo cálculo que patrimonio-engine.
  const monthsOfIndependence = mesesDeColchon(sum(liquid), gastoReferencia);

  // `netWorth` sale de los saldos de HOY y `previous` es el CIERRE del mes pasado, así que
  // su resta es siempre un mes a medias: el 2 de septiembre son dos días de gasto, no un
  // mes. La cifra es real y se muestra —rotulada "en lo que va del mes"— pero el VEREDICTO
  // ya no sale de ahí: salía "te estás haciendo más pobre" cada inicio de mes por el gasto
  // normal de los primeros días. El veredicto exige dos meses cerrados y consecutivos
  // (`closedWealthDelta`); sin ellos el estado honesto es "en curso", no un juicio.
  let wealthVelocity: number | null = null;
  if (input.previous) wealthVelocity = netWorth - input.previous.netWorth;
  const velocityIsPartial = wealthVelocity !== null;

  const closed = input.closedWealthDelta ?? null;
  let trend: RichTrend = "sin_historico";
  if (closed !== null) {
    trend = closed > 0 ? "mas_rico" : closed < 0 ? "mas_pobre" : "estable";
  } else if (wealthVelocity !== null) {
    trend = "en_curso";
  }

  return {
    netWorth,
    totalAssets,
    totalLiabilities,
    // Sin deudas el ratio A/P es infinito: se representa con `null` (serializable en JSON;
    // `Infinity` se volvía `null` silencioso al cruzar un límite API). La UI lo pinta "∞".
    assetLiabilityRatio:
      totalLiabilities > 0
        ? Math.round((totalAssets / totalLiabilities) * 10) / 10
        : totalAssets > 0
          ? null
          : 0,
    debtToAssets: ratio(totalLiabilities, totalAssets),
    productiveAssetsPct: ratio(sum(productive), totalAssets),
    // Clamp del numerador a ≥0: en sobregiro la liquidez entra como activo negativo y el
    // porcentaje se iría bajo cero (contra su rango 0-1). El sobregiro se ve por el saldo
    // real de liquidez, no por un % negativo. (Display-only: no alimenta el score.)
    liquidAssetsPct: ratio(Math.max(0, sum(liquid)), totalAssets),
    depreciablePct: ratio(sum(depreciable), totalAssets),
    passiveIncomeCoverage,
    financialFreedomIndex: passiveIncomeCoverage,
    monthsOfIndependence,
    wealthVelocity,
    velocityIsPartial,
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

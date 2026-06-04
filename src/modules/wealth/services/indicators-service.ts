import "server-only";

/**
 * Arma el view-model de la sub-vista "Mercado e Indicadores" leyendo de BD
 * (vía lib/economic-indicators). No consulta fuentes externas: eso lo hace el
 * cron. Fase 1: solo se muestran los indicadores activados (Costa Rica/BCCR).
 */
import {
  enabledIndicators,
  getHistory,
  type IndicatorDef,
  type IndicatorGroup,
  type IndicatorPoint,
  type IndicatorUnit,
} from "@/lib/economic-indicators";

export interface IndicatorCard {
  code: string;
  label: string;
  description: string;
  unit: IndicatorUnit;
  source: string;
  /** Último valor observado, o null si aún no hay datos ingeridos. */
  value: number | null;
  observedDate: string | null;
  /** Variación absoluta vs ~6 meses atrás (misma unidad). */
  change6mAbs: number | null;
  /** Variación relativa vs ~6 meses atrás (proporción 0-1). */
  change6mPct: number | null;
  /** Histórico para la mini-gráfica (ascendente por fecha). */
  history: IndicatorPoint[];
}

export interface IndicatorGroupView {
  group: IndicatorGroup;
  cards: IndicatorCard[];
}

export interface IndicatorsViewModel {
  groups: IndicatorGroupView[];
  /** true si al menos un indicador tiene datos ingeridos. */
  hasData: boolean;
}

/** Observación más reciente con fecha ≤ (última − ~6 meses). */
function valueSixMonthsBack(points: IndicatorPoint[]): number | null {
  if (points.length === 0) return null;
  const lastDate = points[points.length - 1]!.date;
  const target = new Date(lastDate);
  target.setUTCMonth(target.getUTCMonth() - 6);
  const targetIso = target.toISOString().slice(0, 10);
  let base: number | null = null;
  for (const p of points) {
    if (p.date <= targetIso) base = p.value;
    else break;
  }
  return base;
}

async function buildCard(def: IndicatorDef): Promise<IndicatorCard> {
  // Un solo query por indicador: de aquí se derivan último valor y variación.
  const history = await getHistory(def.code, "1Y");
  const latest = history.length > 0 ? history[history.length - 1]! : null;
  const base = valueSixMonthsBack(history);

  const change6mAbs = latest && base !== null ? latest.value - base : null;
  const change6mPct =
    latest && base !== null && base !== 0 ? (latest.value - base) / base : null;

  return {
    code: def.code,
    label: def.label,
    description: def.description,
    unit: def.unit,
    source: def.source,
    value: latest?.value ?? null,
    observedDate: latest?.date ?? null,
    change6mAbs,
    change6mPct,
    history,
  };
}

const GROUP_ORDER: IndicatorGroup[] = ["Costa Rica", "Estados Unidos"];

/** Construye el view-model agrupado de indicadores activados. */
export async function getIndicatorsViewModel(): Promise<IndicatorsViewModel> {
  const defs = enabledIndicators();
  const cards = await Promise.all(defs.map(buildCard));

  const groups: IndicatorGroupView[] = [];
  for (const group of GROUP_ORDER) {
    const groupCards = cards.filter((_c, i) => defs[i]!.group === group);
    if (groupCards.length > 0) groups.push({ group, cards: groupCards });
  }

  const hasData = cards.some((c) => c.value !== null);
  return { groups, hasData };
}

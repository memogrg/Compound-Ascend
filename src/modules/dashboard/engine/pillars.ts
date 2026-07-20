/**
 * Construye la franja "Norte" (¿me hago más rico o más pobre?, libertad
 * financiera, próxima mejor decisión) y los 4 pilares del panel, cada uno con
 * su lectura de My Agent C+. Determinista: solo cadenas en español a partir de
 * datos ya calculados por los módulos. No hace fetch ni cálculos pesados.
 */
import type { IconName } from "@/components/ui/icon";
import type { BaseIndicators } from "@/modules/financial-base";
import type { ControlSummary } from "@/modules/control";
import type { RichLifeSummary } from "@/modules/rich-life";
import type { WealthSummary } from "@/modules/wealth";
import { formatMoney, formatPercent } from "@/lib/format";

export type PanelTrend = "mas_rico" | "estable" | "mas_pobre" | "sin_historico";

export type NorteVM = {
  trend: PanelTrend;
  trendLabel: string;
  velocity: number | null; // Δ patrimonio neto del mes
  velocityText: string;
  freedomPct: number; // 0-1 (ingreso pasivo / gastos)
  freedomText: string;
  netWorth: number | null;
  /** De qué está hecho el patrimonio neto. Ya vienen calculados y normalizados a la
   *  moneda principal en el mismo indicador que da `netWorth`: exponerlos no añade
   *  ninguna consulta, solo deja de descartarlos. */
  totalAssets: number | null;
  totalLiabilities: number | null;
  nextBestAction: string;
};

export type PillarVM = {
  key: "flujo" | "ahorro" | "deudas" | "inversiones";
  label: string;
  icon: IconName;
  accent: string;
  soft: string;
  value: string;
  meta: string;
  ratio: number; // 0-1, ancho de la barra
  barColor: string;
  href: string;
  ai: string; // lectura My Agent C+ del pilar
};

export type PanelVM = { norte: NorteVM; pillars: PillarVM[] };

export type PanelInputs = {
  ind: BaseIndicators;
  currency: string;
  control: ControlSummary | null;
  richLife: RichLifeSummary | null;
  wealth: WealthSummary | null;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const TREND_LABEL: Record<PanelTrend, string> = {
  mas_rico: "Te hiciste más rico",
  estable: "Patrimonio estable",
  mas_pobre: "Te hiciste más pobre",
  sin_historico: "Aún sin histórico",
};

const METHOD_LABEL: Record<string, string> = {
  avalancha: "Avalancha",
  bola_nieve: "Bola de nieve",
  hibrido: "Híbrido",
};

export function buildPanel(inp: PanelInputs): PanelVM {
  return { norte: buildNorte(inp), pillars: buildPillars(inp) };
}

function buildNorte({ ind, currency, control, richLife }: PanelInputs): NorteVM {
  const rl = richLife?.snapshot.indicators ?? null;
  const trend: PanelTrend = rl?.trend ?? "sin_historico";
  const velocity = rl?.wealthVelocity ?? null;
  const freedomPct = clamp01(rl?.passiveIncomeCoverage ?? 0);
  const netWorth = rl?.netWorth ?? null;

  const velocityText =
    velocity == null
      ? "Registra tu patrimonio para ver tu velocidad mes a mes."
      : velocity >= 0
        ? `Tu patrimonio creció ${formatMoney(velocity, currency)} este mes.`
        : `Tu patrimonio bajó ${formatMoney(Math.abs(velocity), currency)} este mes.`;

  const freedomText =
    freedomPct > 0
      ? `Tus ingresos pasivos cubren el ${formatPercent(freedomPct)} de tus gastos.`
      : "Aún no tienes ingresos pasivos; cada activo productivo te acerca a la libertad.";

  const nextBestAction =
    control?.diagnosis.nextBestAction ??
    richLife?.snapshot.nextBestAction ??
    baseNextAction(ind, currency);

  return {
    trend,
    trendLabel: TREND_LABEL[trend],
    velocity,
    velocityText,
    freedomPct,
    freedomText,
    netWorth,
    totalAssets: rl?.totalAssets ?? null,
    totalLiabilities: rl?.totalLiabilities ?? null,
    nextBestAction,
  };
}

function baseNextAction(ind: BaseIndicators, currency: string): string {
  if (ind.freeCashflow < 0)
    return "Vuelve a flujo positivo: revisa tus gastos flexibles antes de cualquier otra meta.";
  if (ind.debtWeight >= 0.3)
    return `Dirige parte de tus ${formatMoney(ind.freeCashflow, currency)} libres a tu deuda más cara este mes.`;
  if (ind.savingsRate < 0.1)
    return `Automatiza un ahorro con parte de tus ${formatMoney(ind.freeCashflow, currency)} libres para tu fondo de paz.`;
  return "Vas bien: considera convertir parte de tu ahorro en inversión de largo plazo.";
}

function buildPillars({ ind, currency, control, richLife, wealth }: PanelInputs): PillarVM[] {
  // 1 · Flujo del mes (Base Financiera)
  const flujo: PillarVM = {
    key: "flujo",
    label: "Flujo del mes",
    icon: "income",
    accent: "var(--pos)",
    soft: "var(--pos-soft)",
    value: formatMoney(ind.freeCashflow, currency),
    meta: `Ingreso ${formatMoney(ind.incomeMonthly, currency)} · Gasto ${formatMoney(ind.expenseMonthly, currency)}`,
    ratio: ind.incomeMonthly > 0 ? clamp01(ind.freeCashflow / ind.incomeMonthly) : 0,
    barColor: ind.freeCashflow >= 0 ? "var(--pos)" : "var(--neg)",
    href: "/mi-base-financiera",
    ai:
      ind.freeCashflow >= 0
        ? `Te quedan ${formatMoney(ind.freeCashflow, currency)} libres al mes para acercarte a tu meta.`
        : `Gastas ${formatMoney(Math.abs(ind.freeCashflow), currency)} más de lo que entra. Pausar gastos flexibles te devuelve el control.`,
  };

  // 2 · Ahorro y emergencia (Control)
  const months = richLife?.snapshot.indicators.monthsOfIndependence ?? null;
  const ahorro: PillarVM = {
    key: "ahorro",
    label: "Ahorro y emergencia",
    icon: "savings",
    accent: "var(--c-savings)",
    soft: "color-mix(in srgb, var(--c-savings) 16%, transparent)",
    value: formatPercent(ind.savingsRate),
    meta:
      months != null
        ? `Respaldo: ${months.toFixed(1)} meses de gastos`
        : `Provisión anual ${formatMoney(ind.annualCoverage, currency)}/mes`,
    ratio: clamp01(ind.savingsRate / 0.2),
    barColor: "var(--c-savings)",
    href: "/control-financiero",
    ai:
      ind.savingsRate >= 0.1
        ? `Ahorras el ${formatPercent(ind.savingsRate)} de tu ingreso. Mantén el ritmo y tus metas llegan antes.`
        : `Ahorras el ${formatPercent(ind.savingsRate)}. Subirlo de forma gradual fortalece tu fondo de paz.`,
  };

  // 3 · Deudas — carga sobre el ingreso (ratio, neutra a la moneda)
  const method = control?.diagnosis.debtMethod;
  const deudas: PillarVM = {
    key: "deudas",
    label: "Deudas",
    icon: "debt",
    accent: "var(--neg)",
    soft: "var(--neg-soft)",
    value: formatPercent(ind.debtWeight),
    meta: method ? `Método ${METHOD_LABEL[method.method] ?? method.method}` : "de tu ingreso mensual",
    ratio: clamp01(ind.debtWeight / 0.4),
    barColor: "var(--c-debt)",
    href: "/deudas",
    ai: method
      ? method.reason
      : ind.debtWeight >= 0.3
        ? `Tu deuda consume el ${formatPercent(ind.debtWeight)} de tu ingreso. Reducirla libera flujo y baja tu presión.`
        : "Tu deuda está en un nivel manejable. Evita sumar deuda cara.",
  };

  // 4 · Inversiones y patrimonio productivo (Patrimonio)
  const productive = richLife?.snapshot.indicators.productiveAssetsPct ?? null;
  const invested = wealth?.portfolio.totalInvested ?? null;
  const contribution = wealth?.portfolio.monthlyContribution ?? 0;
  const inversiones: PillarVM = {
    key: "inversiones",
    label: "Inversiones",
    icon: "invest",
    accent: "var(--info)",
    soft: "var(--info-soft)",
    value: invested != null ? formatMoney(invested, currency) : "—",
    meta:
      productive != null
        ? `${formatPercent(productive)} productivo · +${formatMoney(contribution, currency)}/mes`
        : "Configura tu patrimonio",
    ratio: clamp01(productive ?? 0),
    barColor: "var(--c-invest)",
    href: "/patrimonio",
    ai:
      productive != null
        ? `El ${formatPercent(clamp01(1 - productive))} de tu patrimonio aún no genera ingresos. Subir tu aporte acelera tu libertad.`
        : "Empieza a invertir para que tu dinero trabaje por ti.",
  };

  return [flujo, ahorro, deudas, inversiones];
}

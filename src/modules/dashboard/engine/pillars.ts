/**
 * Construye la franja "Norte" (¿me hago más rico o más pobre?, libertad
 * financiera, próxima mejor decisión) y los 4 pilares del panel, cada uno con
 * su lectura de My Agent C+.
 *
 * Determinista y SIN cálculo propio: recibe los `DashboardKpis` —que ya son los números
 * de los motores unificados, en la moneda de visualización— y solo elige cómo se leen.
 * Antes calculaba por su cuenta (`ind.savingsRate`, `ind.debtWeight`,
 * `wealth.portfolio.totalInvested`) y por eso podía contradecir al resto de la app;
 * ver la cabecera de `engine/kpis.ts`.
 *
 * Cuando un KPI es `null` (su fuente no cargó) la tarjeta lo DICE. No cae a un cero que
 * se lee como un dato: "Inversiones $0" y "no pude leer tus inversiones" son cosas
 * distintas, y el panel decía la primera queriendo decir la segunda.
 */
import type { IconName } from "@/components/ui/icon";
import type { BaseIndicators } from "@/modules/financial-base";
import { formatMoney, formatPercent } from "@/lib/format";
import type { DashboardKpis } from "@/modules/dashboard/engine/kpis";

export type PanelTrend = "mas_rico" | "estable" | "mas_pobre" | "en_curso" | "sin_historico";

export type NorteVM = {
  trend: PanelTrend;
  trendLabel: string;
  velocity: number | null; // Δ patrimonio neto del mes
  velocityText: string;
  /** 0-1 (ingreso pasivo ÷ gasto de referencia). `null` = la fuente no cargó, NO "0%". */
  freedomPct: number | null;
  freedomText: string;
  netWorth: number | null;
  /** De qué está hecho el patrimonio neto (ya normalizados a la moneda de visualización). */
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
  /** true = la fuente de este pilar no cargó; la UI lo marca en vez de mostrar un cero. */
  sinDato?: boolean;
};

export type PanelVM = { norte: NorteVM; pillars: PillarVM[] };

export type PanelInputs = {
  /** Indicadores de la base: solo para la próxima acción de respaldo (no para los pilares). */
  ind: BaseIndicators;
  kpis: DashboardKpis;
  /** Próxima mejor acción de los módulos (control → rich-life). */
  nextBestAction?: string | null;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

const TREND_LABEL: Record<PanelTrend, string> = {
  mas_rico: "Te hiciste más rico",
  estable: "Patrimonio estable",
  mas_pobre: "Te hiciste más pobre",
  en_curso: "Mes en curso",
  sin_historico: "Aún sin histórico",
};

const METHOD_LABEL: Record<string, string> = {
  avalancha: "Avalancha",
  bola_nieve: "Bola de nieve",
  hibrido: "Híbrido",
};

/** Lo que se muestra cuando la fuente de una tarjeta no respondió. Nunca un número. */
const SIN_DATO = "—";
const SIN_DATO_META = "No se pudo cargar ahora";

export function buildPanel(inp: PanelInputs): PanelVM {
  return { norte: buildNorte(inp), pillars: buildPillars(inp) };
}

function buildNorte({ ind, kpis, nextBestAction }: PanelInputs): NorteVM {
  const currency = kpis.currency;
  const pat = kpis.patrimonio;
  const lib = kpis.libertad;

  const trend: PanelTrend = pat?.trend ?? "sin_historico";
  const velocity = pat?.velocidad ?? null;
  const netWorth = pat?.neto ?? null;

  const velocityText =
    pat === null
      ? "No pude leer tu patrimonio ahora mismo; volvé a intentarlo en un momento."
      : velocity == null
        ? "Registrá tu patrimonio para ver tu velocidad mes a mes."
        : velocity >= 0
          ? `Tu patrimonio subió ${formatMoney(velocity, currency)} en lo que va del mes.`
          : `Tu patrimonio bajó ${formatMoney(Math.abs(velocity), currency)} en lo que va del mes.`;

  // La cobertura pasiva es el promedio mensualizado de dividendos, cupones, rentas y CDP
  // (#769), el MISMO número que los tres números de Patrimonio. Sin fuente es `null`:
  // decir "0%" con payouts configurados era afirmar algo falso.
  const freedomPct = lib ? clamp01(lib.cobertura) : null;
  const freedomText =
    lib === null
      ? "No pude leer tu ingreso pasivo ahora mismo."
      : lib.cobertura > 0
        ? `Tus ingresos pasivos (${formatMoney(lib.ingresoPasivo, currency)}/mes) cubren el ${formatPercent(clamp01(lib.cobertura))} de tu compromiso mensual de ${formatMoney(lib.gastoReferencia, currency)}.`
        : "Aún no tenés ingresos pasivos; cada activo productivo te acerca a la libertad.";

  return {
    trend,
    trendLabel: TREND_LABEL[trend],
    velocity,
    velocityText,
    freedomPct,
    freedomText,
    netWorth,
    totalAssets: pat?.activos ?? null,
    totalLiabilities: pat?.pasivos ?? null,
    nextBestAction: nextBestAction ?? baseNextAction(ind, kpis),
  };
}

function baseNextAction(ind: BaseIndicators, kpis: DashboardKpis): string {
  const currency = kpis.currency;
  const libre = kpis.flujo?.real ?? ind.freeCashflow;
  if (libre < 0)
    return "Volvé a flujo positivo: revisá tus gastos flexibles antes de cualquier otra meta.";
  if ((kpis.deudas?.dti ?? 0) >= 0.3)
    return `Dirigí parte de tus ${formatMoney(libre, currency)} libres a tu deuda más cara este mes.`;
  if ((kpis.ahorro?.tasa ?? 0) < 0.1)
    return `Automatizá un ahorro con parte de tus ${formatMoney(libre, currency)} libres para tu fondo de paz.`;
  return "Vas bien: considerá convertir parte de tu ahorro en inversión de largo plazo.";
}

function buildPillars({ kpis }: PanelInputs): PillarVM[] {
  return [flujoPillar(kpis), ahorroPillar(kpis), deudasPillar(kpis), inversionesPillar(kpis)];
}

/**
 * 1 · Flujo del mes — la MISMA definición que Mi Base: ingreso operativo − gasto operativo
 * del mes, en la moneda de visualización. El plan (presupuesto) va en la meta con su gap, y
 * cuando el real supera al plan la tarjeta lo EXPLICA (`flujo.explicacion`) en vez de dejar
 * un número que se lee imposible.
 */
function flujoPillar(kpis: DashboardKpis): PillarVM {
  const base = {
    key: "flujo" as const,
    label: "Flujo del mes",
    icon: "income" as IconName,
    accent: "var(--pos)",
    soft: "var(--pos-soft)",
    href: "/mi-base-financiera",
  };
  const f = kpis.flujo;
  if (!f) {
    return {
      ...base,
      value: SIN_DATO,
      meta: SIN_DATO_META,
      ratio: 0,
      barColor: "var(--muted-2)",
      ai: "No pude leer tus movimientos del mes ahora mismo.",
      sinDato: true,
    };
  }
  const c = kpis.currency;
  const lectura =
    f.real >= 0
      ? `Te quedan ${formatMoney(f.real, c)} libres este mes: entraron ${formatMoney(f.realIngreso, c)} y salieron ${formatMoney(f.realGasto, c)}.`
      : `Gastás ${formatMoney(Math.abs(f.real), c)} más de lo que entra. Pausar gastos flexibles te devuelve el control.`;
  return {
    ...base,
    value: formatMoney(f.real, c),
    meta: `Plan ${formatMoney(f.plan, c)} · Real ${formatMoney(f.real, c)} (${f.gap >= 0 ? "+" : ""}${formatMoney(f.gap, c)})`,
    ratio: f.realIngreso > 0 ? clamp01(f.real / f.realIngreso) : 0,
    barColor: f.real >= 0 ? "var(--pos)" : "var(--neg)",
    ai: f.explicacion ? `${lectura} ${f.explicacion}` : lectura,
  };
}

/**
 * 2 · Ahorro y emergencia — la tasa es APORTES ÷ INGRESO (el aporte mensual a metas del
 * compromiso, ya mensualizado y convertido), la misma que alimenta el score de salud.
 * Antes era `(gasto de naturaleza ahorro + flujo libre) ÷ ingreso`, o sea "todo lo que no
 * presupuesté": con un presupuesto que cubría una quinta parte del ingreso, decía 98%.
 */
function ahorroPillar(kpis: DashboardKpis): PillarVM {
  const base = {
    key: "ahorro" as const,
    label: "Ahorro y emergencia",
    icon: "savings" as IconName,
    accent: "var(--c-savings)",
    soft: "color-mix(in srgb, var(--c-savings) 16%, transparent)",
    href: "/control-financiero",
  };
  const a = kpis.ahorro;
  if (!a) {
    return {
      ...base,
      value: SIN_DATO,
      meta: SIN_DATO_META,
      ratio: 0,
      barColor: "var(--muted-2)",
      ai: "No pude leer tus metas de ahorro ahora mismo.",
      sinDato: true,
    };
  }
  const c = kpis.currency;
  // Tope de display a 12+: un runway mayor se lee absurdo (57,6 meses) y no aporta
  // más que "holgado". Es el respaldo de LIQUIDEZ, no el fondo formal de emergencia.
  const meses = a.mesesDeColchon;
  return {
    ...base,
    value: formatPercent(a.tasa),
    meta:
      meses != null
        ? `${formatMoney(a.aporteMetas, c)}/mes · respaldo ${meses >= 12 ? "12+" : meses.toFixed(1)} meses`
        : `${formatMoney(a.aporteMetas, c)}/mes a tus metas`,
    ratio: clamp01(a.tasa / 0.2),
    barColor: "var(--c-savings)",
    ai:
      a.tasa >= 0.1
        ? `Aportás ${formatMoney(a.aporteMetas, c)}/mes a tus metas, el ${formatPercent(a.tasa)} de tu ingreso. Mantené el ritmo y tus metas llegan antes.`
        : `Aportás ${formatMoney(a.aporteMetas, c)}/mes a tus metas, el ${formatPercent(a.tasa)} de tu ingreso. Subirlo de forma gradual fortalece tu fondo de paz.`,
  };
}

/** 3 · Deudas — saldo y DTI de la tabla `debts` (la MISMA lectura que /deudas). */
function deudasPillar(kpis: DashboardKpis): PillarVM {
  const base = {
    key: "deudas" as const,
    label: "Deudas",
    icon: "debt" as IconName,
    accent: "var(--neg)",
    soft: "var(--neg-soft)",
    href: "/deudas",
  };
  const d = kpis.deudas;
  if (!d) {
    return {
      ...base,
      value: SIN_DATO,
      meta: SIN_DATO_META,
      ratio: 0,
      barColor: "var(--muted-2)",
      ai: "No pude leer tus deudas ahora mismo.",
      sinDato: true,
    };
  }
  const c = kpis.currency;
  if (d.numDeudas === 0) {
    return {
      ...base,
      value: formatMoney(0, c),
      meta: "Sin deudas registradas",
      ratio: 0,
      barColor: "var(--c-debt)",
      ai: "No tenés deudas registradas. Evitá sumar deuda cara.",
    };
  }
  return {
    ...base,
    value: formatMoney(d.total, c),
    meta: d.metodo
      ? `${d.numDeudas} ${d.numDeudas === 1 ? "deuda" : "deudas"} · método ${METHOD_LABEL[d.metodo] ?? d.metodo} · ${formatPercent(d.dti)} de tu ingreso`
      : `${d.numDeudas} ${d.numDeudas === 1 ? "deuda" : "deudas"} · ${formatPercent(d.dti)} de tu ingreso`,
    ratio: clamp01(d.dti / 0.4),
    barColor: "var(--c-debt)",
    ai:
      d.dti >= 0.3
        ? `Tus cuotas consumen el ${formatPercent(d.dti)} de tu ingreso. Reducirlas libera flujo y baja tu presión.`
        : `Tu deuda está en un nivel manejable (${formatPercent(d.dti)} de tu ingreso). Evitá sumar deuda cara.`,
  };
}

/**
 * 4 · Inversiones — VALOR DE MERCADO de tus posiciones (`investment_holdings`), el mismo
 * número que da Patrimonio y que responde "¿cómo van mis inversiones?". Antes leía
 * `investments.invested_amount`, una tabla que en cuentas migradas está vacía: por eso
 * decía "$0 · configurá tu patrimonio" al lado de "18 posiciones".
 *
 * El corte mercado/manual viaja en la meta: un valor escrito a mano no se presenta como
 * un resultado de mercado.
 */
function inversionesPillar(kpis: DashboardKpis): PillarVM {
  const base = {
    key: "inversiones" as const,
    label: "Inversiones",
    icon: "invest" as IconName,
    accent: "var(--info)",
    soft: "var(--info-soft)",
    href: "/patrimonio",
  };
  const i = kpis.inversiones;
  if (!i) {
    return {
      ...base,
      value: SIN_DATO,
      meta: kpis.patrimonio ? "Aún no registrás posiciones" : SIN_DATO_META,
      ratio: 0,
      barColor: "var(--muted-2)",
      ai: kpis.patrimonio
        ? "Empezá a invertir para que tu dinero trabaje por vos."
        : "No pude leer tu portafolio ahora mismo.",
      sinDato: !kpis.patrimonio,
    };
  }
  const c = kpis.currency;
  const avisos: string[] = [];
  if (i.manual.posiciones > 0) {
    avisos.push(
      `${i.manual.posiciones} ${i.manual.posiciones === 1 ? "valuada" : "valuadas"} por vos (${formatMoney(i.manual.valor, c)})`,
    );
  }
  if (i.sinPrecio.posiciones > 0) {
    avisos.push(`${i.sinPrecio.posiciones} sin precio hoy`);
  }
  // El signo va UNA vez, delante: `formatPercent` emite el guion ASCII y el monto lleva el
  // menos tipográfico, así que dejarlos a los dos mezclaba dos signos distintos en la misma
  // frase ("−$7.707 (-2%)").
  const signo = i.conPrecio.pl >= 0 ? "+" : "−";
  const resultado =
    i.conPrecio.plPct != null
      ? `${signo}${formatMoney(Math.abs(i.conPrecio.pl), c)} (${signo}${formatPercent(Math.abs(i.conPrecio.plPct))}) en lo que cotiza`
      : null;

  return {
    ...base,
    value: formatMoney(i.valorMercado, c),
    meta: [
      `${i.posiciones} ${i.posiciones === 1 ? "posición" : "posiciones"}`,
      resultado,
      ...avisos,
    ]
      .filter(Boolean)
      .join(" · "),
    // La barra mide qué parte del valor tiene precio de mercado: es la parte del número
    // que el mercado respalda, y era exactamente lo que no se distinguía.
    ratio: i.valorMercado > 0 ? clamp01(i.conPrecio.valor / i.valorMercado) : 0,
    barColor: "var(--c-invest)",
    ai:
      i.manual.posiciones > 0
        ? `Tu portafolio vale ${formatMoney(i.valorMercado, c)}; ${formatMoney(i.manual.valor, c)} de eso está valuado por vos, no por el mercado.`
        : `Tu portafolio vale ${formatMoney(i.valorMercado, c)} sobre ${formatMoney(i.invertido, c)} invertidos.`,
  };
}

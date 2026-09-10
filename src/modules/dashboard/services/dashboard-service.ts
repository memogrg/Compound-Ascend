import "server-only";

/**
 * Reúne los datos del Centro de mando desde los MOTORES UNIFICADOS.
 *
 * Principio: el panel no calcula nada. Pide los mismos reports que alimentan a las otras
 * pantallas y al chat (`getMonthFlow`, `getPatrimonioReport`, `getRichLifeSummary`,
 * `getPortfolioReport`, `getDebtsOverview`), los normaliza a UNA moneda con un solo
 * `Conversor` y se los pasa a `buildDashboardKpis`. Ver `engine/kpis.ts` para el porqué.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import { getBaseSummary, getDisplayCurrency } from "@/modules/financial-base";
import { computeBaseIndicators } from "@/modules/financial-base";
import { getMonthFlow, type MonthFlow } from "@/modules/financial-base";
import { userCurrentPeriod } from "@/lib/time/user-time";
import { computeHealthScore, type HealthScore } from "@/modules/financial-base";
import { buildInsights, type DashboardInsights } from "@/modules/dashboard/engine/insights";
import { getControlSummary, getDebtsOverview } from "@/modules/control";
import {
  getRichLifeSummary,
  buildDemoRichLifeSummary,
  type RichLifeSummary,
} from "@/modules/rich-life";
import { getPatrimonioReport, getPortfolioReport } from "@/modules/wealth";
import { crearConversor, type Conversor } from "@/lib/fx";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { buildPanel, type PanelVM } from "@/modules/dashboard/engine/pillars";
import {
  buildDashboardKpis,
  type DashboardKpis,
  type PortafolioSource,
} from "@/modules/dashboard/engine/kpis";
import type { BaseSummary } from "@/modules/financial-base";
import type { IncomeSource, ExpenseItem } from "@/modules/financial-base";

/** Qué reports best-effort NO llegaron (fallo o techo de tiempo). Lo consume la UI
 *  para no confundir "esta vez no cargó" con "no tienes nada registrado". */
export type Degradado = {
  control: boolean;
  richLife: boolean;
  patrimonio: boolean;
  portafolio: boolean;
  deudas: boolean;
  flujo: boolean;
};

export type DashboardData = {
  name: string;
  currency: string;
  summary: BaseSummary;
  health: HealthScore;
  insights: DashboardInsights;
  panel: PanelVM;
  /** Los KPIs canónicos del panel (una fuente por métrica). La UI lee de aquí. */
  kpis: DashboardKpis;
  configured: boolean;
  degradado: Degradado;
  /** A-01: flujo del mes canónico (real operativo). null en demo/degradado. */
  monthFlow: MonthFlow | null;
};

/**
 * Techo de tiempo para los reports best-effort del panel (ms).
 *
 * Era 1 s, y ese número —no un bug de cálculo— producía la mitad de las contradicciones
 * del panel: `getRichLifeSummary`, `getControlSummary` y el portafolio agregan decenas de
 * filas y tasas FX, tardan varios segundos en frío y degradaban CASI SIEMPRE. El panel
 * entonces presentaba el estado degradado como si fuera la realidad del usuario ("0% de
 * libertad", "registrá tu patrimonio") y, peor, de forma NO DETERMINISTA: la misma pantalla
 * daba números distintos en dos recargas según cuál ganara la carrera.
 *
 * La página ya hace streaming bajo `Suspense` con su esqueleto, así que esperar no bloquea
 * el arranque: lo que se ve primero es el esqueleto, no una cifra falsa. El techo sigue
 * existiendo para que una cadena colgada no deje la página cargando para siempre.
 */
const LIMITE_RESUMEN_MS = 8000;

/** Resultado de un report best-effort: el valor, y si hubo que degradar. */
type Intento<T> = { valor: T | null; degradado: boolean };

/**
 * Presupuesto de tiempo DURO. No cancela el trabajo de fondo (una promesa no se puede
 * abortar): deja de esperarlo y el panel degrada. Pero lo REPORTA, porque sin ese dato una
 * pantalla que no cargó y un usuario sin datos se veían igual, y a alguien con ₡278,9 M
 * registrados se le decía "registrá tu patrimonio".
 */
function conLimite<T>(p: Promise<T>): Promise<Intento<T>> {
  return Promise.race([
    p
      .then((valor) => ({ valor, degradado: false }))
      .catch(() => ({ valor: null, degradado: true })),
    new Promise<Intento<T>>((resolver) => {
      const t = setTimeout(() => resolver({ valor: null, degradado: true }), LIMITE_RESUMEN_MS);
      // No mantiene vivo el proceso si todo lo demás ya terminó (cron, scripts).
      (t as unknown as { unref?: () => void }).unref?.();
    }),
  ]);
}

export async function getDashboardData(
  opts: { previewDemo?: boolean } = {},
): Promise<DashboardData> {
  // previewDemo (solo para vistas de PREVIEW sin sesión, p. ej. el móvil en dev):
  // fuerza el mismo camino de DEMO que cuando Supabase no está configurado.
  const configured = isSupabaseConfigured() && !opts.previewDemo;
  const user = opts.previewDemo ? null : await getUser();

  let summary: BaseSummary;
  let currency = "CRC";
  // Nombre del perfil (el del wizard "¿Cómo querés que te llamemos?"). Prioriza
  // la tabla profiles porque user_metadata puede venir vacío.
  let profileName: string | null = null;
  if (configured) {
    const profilePromise = user
      ? (async () => {
          const supabase = await createSupabaseServerClient();
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", user.id)
            .maybeSingle();
          return profile?.display_name ?? null;
        })()
      : Promise.resolve(null);
    [summary, currency, profileName] = await Promise.all([
      getBaseSummary(),
      getDisplayCurrency(),
      profilePromise,
    ]);
  } else {
    summary = buildDemoSummary();
  }

  const name =
    profileName ??
    (user?.user_metadata?.display_name as string | undefined) ??
    user?.email?.split("@")[0] ??
    "tu perfil";

  // ── Reports unificados, en paralelo y best-effort ──────────────────────────
  // Los precios van desde la CACHÉ persistida: el panel es un RESUMEN y esperar a un
  // proveedor externo cuesta más de lo que vale la frescura. Patrimonio y Portafolio
  // (sus pantallas) siguen en vivo y son quienes mantienen la caché al día.
  const degradado: Degradado = {
    control: false,
    richLife: false,
    patrimonio: false,
    portafolio: false,
    deudas: false,
    flujo: false,
  };
  let kpis: DashboardKpis;
  let monthFlow: MonthFlow | null = null;
  let nextBestAction: string | null = null;

  if (configured && user) {
    const period = await userCurrentPeriod();
    const [flujo, control, deudas, rl, patrimonio, portafolio, rates] = await Promise.all([
      conLimite(getMonthFlow(period)),
      conLimite(getControlSummary()),
      conLimite(getDebtsOverview({})),
      conLimite(getRichLifeSummary({ precios: "cache" })),
      conLimite(getPatrimonioReport(undefined, { precios: "cache" })),
      conLimite(getPortfolioReport()),
      getFxRates().catch(() => ({}) as Record<string, number>),
    ]);
    degradado.flujo = flujo.degradado;
    degradado.control = control.degradado;
    degradado.deudas = deudas.degradado;
    degradado.richLife = rl.degradado;
    degradado.patrimonio = patrimonio.degradado;
    degradado.portafolio = portafolio.degradado;

    monthFlow = flujo.valor;
    nextBestAction =
      control.valor?.diagnosis.nextBestAction ?? rl.valor?.snapshot.nextBestAction ?? null;

    // UN solo conversor para todo el panel (fix 6). Los reports que ya vienen en la moneda
    // de visualización pasan por él sin cambio (from === to); los que vienen en la
    // PRIMARIA del motor (el portafolio) se convierten aquí, una vez y en un solo lugar.
    const convertir = crearConversor(currency, rates);

    kpis = buildDashboardKpis({
      currency,
      monthFlow: flujo.valor,
      patrimonio: patrimonio.valor
        ? {
            coberturaPasiva: patrimonio.valor.report.coberturaPasiva,
            passiveIncomeMonthly: patrimonio.valor.passiveIncomeMonthly,
            gastoReferenciaMensual: patrimonio.valor.report.gastoReferenciaMensual,
            progresoIndependencia: patrimonio.valor.report.progresoIndependencia,
            hitoAlcanzado: patrimonio.valor.report.hitoAlcanzado,
            netMonthlyIncome: patrimonio.valor.netMonthlyIncome,
            aporteMetasMensual: patrimonio.valor.commitmentBreakdown?.byOrigin.goals ?? 0,
            aporteDcaMensual: patrimonio.valor.commitmentBreakdown?.byOrigin.dca ?? 0,
            mesesDeColchon: patrimonio.valor.report.mesesDeColchon,
          }
        : null,
      richLife: rl.valor
        ? {
            netWorth: rl.valor.snapshot.indicators.netWorth,
            totalAssets: rl.valor.snapshot.indicators.totalAssets,
            totalLiabilities: rl.valor.snapshot.indicators.totalLiabilities,
            productiveAssetsPct: rl.valor.snapshot.indicators.productiveAssetsPct,
            trend: rl.valor.snapshot.indicators.trend,
            wealthVelocity: rl.valor.snapshot.indicators.wealthVelocity,
            velocityIsPartial: rl.valor.snapshot.indicators.velocityIsPartial,
          }
        : null,
      deudas: deudas.valor
        ? {
            // `getDebtsOverview` ya entrega saldos y cuotas en la moneda de visualización.
            saldos: deudas.valor.debts.map((d) => d.balance),
            incomeMonthly: deudas.valor.incomeMonthly,
            pagoMensual: deudas.valor.debts.reduce(
              (s, d) => s + (d.monthlyPayment || d.minPayment || 0),
              0,
            ),
            metodo: control.valor?.diagnosis.debtMethod?.method ?? null,
          }
        : null,
      portafolio: portafolio.valor ? portafolioEnMoneda(portafolio.valor, convertir) : null,
    });
  } else if (!configured) {
    // Demo: previsualiza el panel premium completo sin Supabase.
    kpis = buildDashboardKpis({ currency, ...demoKpiSources(buildDemoRichLifeSummary()) });
  } else {
    kpis = buildDashboardKpis({
      currency,
      monthFlow: null,
      patrimonio: null,
      richLife: null,
      deudas: null,
      portafolio: null,
    });
  }

  // La tasa de ahorro del score de salud es la MISMA que muestra el pilar: aportes ÷
  // ingreso. Sin ese override el score usaba `(gasto de ahorro + flujo libre) ÷ ingreso`,
  // que con un presupuesto parcial daba 98% y un score de 100 para cualquiera.
  const health = computeHealthScore(
    summary.indicators,
    summary.indicators.investmentRate,
    kpis.ahorro?.tasa,
  );
  const insights = buildInsights(summary.indicators, health, currency, kpis);

  const panel = buildPanel({ ind: summary.indicators, kpis, nextBestAction });

  return {
    name,
    currency,
    summary,
    health,
    insights,
    panel,
    kpis,
    configured,
    degradado,
    monthFlow,
  };
}

/**
 * Pasa el reporte de portafolio a la moneda de VISUALIZACIÓN. `getPortfolioReport` entrega
 * sus cifras en la moneda PRIMARIA del motor; cuando el usuario mira el panel en otra
 * moneda (el switch rápido), mostrarlas sin convertir sería el mismo bug de rotular ₡
 * con "$" que este cambio elimina en las otras tarjetas.
 */
function portafolioEnMoneda(
  report: Awaited<ReturnType<typeof getPortfolioReport>>,
  convertir: Conversor,
): PortafolioSource {
  const desde = report.currency;
  const a = report.analytics;
  return {
    valorTotal: convertir(a.totalPortfolioValue, desde),
    costoTotal: convertir(a.totalCostBasis, desde),
    plTotal: convertir(a.totalProfitLoss, desde),
    posiciones: a.holdingsWithPerformance.map((h) => ({
      ...h,
      currentValue: convertir(h.currentValue, desde),
      costBasis: convertir(h.costBasis, desde),
      profitLoss: convertir(h.profitLoss, desde),
      currentValueManual:
        h.currentValueManual == null
          ? h.currentValueManual
          : convertir(h.currentValueManual, desde),
    })),
  };
}

/** Fuentes de KPI para la vista DEMO (sin Supabase): mismo motor, datos de ejemplo. */
function demoKpiSources(richLife: RichLifeSummary) {
  const ind = richLife.snapshot.indicators;
  return {
    monthFlow: null,
    patrimonio: {
      coberturaPasiva: ind.passiveIncomeCoverage,
      passiveIncomeMonthly: 250_000,
      gastoReferenciaMensual: 925_000,
      progresoIndependencia: 0.2,
      hitoAlcanzado: "seguridad" as const,
      netMonthlyIncome: 1_100_000,
      aporteMetasMensual: 150_000,
      aporteDcaMensual: 120_000,
      mesesDeColchon: ind.monthsOfIndependence,
    },
    richLife: {
      netWorth: ind.netWorth,
      totalAssets: ind.totalAssets,
      totalLiabilities: ind.totalLiabilities,
      productiveAssetsPct: ind.productiveAssetsPct,
      trend: ind.trend,
      wealthVelocity: ind.wealthVelocity,
      velocityIsPartial: ind.velocityIsPartial,
    },
    deudas: {
      saldos: richLife.liabilities.map((l) => l.balance),
      incomeMonthly: 1_100_000,
      pagoMensual: 165_000,
      metodo: "avalancha",
    },
    portafolio: null,
  };
}

function demoIncome(name: string, type: IncomeSource["incomeType"], m: number): IncomeSource {
  return {
    id: name,
    name,
    incomeType: type,
    amount: m,
    currency: "CRC",
    frequency: "mensual",
    isFixed: true,
    ownerScope: "usuario",
    includeInBudget: true,
    amountMonthly: m,
  };
}
function demoExpense(name: string, nature: ExpenseItem["nature"], m: number): ExpenseItem {
  return {
    id: name,
    name,
    nature,
    amount: m,
    currency: "CRC",
    frequency: "mensual",
    isFixed: true,
    ownerScope: "usuario",
    amountMonthly: m,
  };
}

function demoPeriodo(): { year: number; month: number } {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function buildDemoSummary(): BaseSummary {
  const incomes: IncomeSource[] = [
    demoIncome("Salario", "activo", 850_000),
    demoIncome("Alquiler apartamento", "pasivo", 250_000),
  ];
  const expenses: ExpenseItem[] = [
    demoExpense("Vivienda", "esencial", 300_000),
    demoExpense("Alimentación", "esencial", 180_000),
    demoExpense("Tarjeta de crédito", "financiero", 140_000),
    demoExpense("Suscripciones", "estilo_vida", 35_000),
    demoExpense("Inversión mensual", "inversion", 120_000),
    demoExpense("Fondo de emergencia", "ahorro", 90_000),
    demoExpense("Seguro médico", "proteccion", 60_000),
  ];
  // Demo: todo en una sola moneda, así que no hubo conversión que declarar.
  return {
    indicators: computeBaseIndicators(incomes, expenses),
    incomes,
    expenses,
    monedasVistas: ["CRC"],
    // La demo trae mes completo por construcción: sin etiqueta que poner.
    indicadoresDe: { periodo: demoPeriodo(), estado: "actual", etiqueta: null },
  };
}

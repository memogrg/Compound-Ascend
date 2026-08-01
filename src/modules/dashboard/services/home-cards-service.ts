import "server-only";

/**
 * Orquestador de la capa de datos del carrusel del home (piloto · Delta 1).
 * Reúne los reports que YA existen (best-effort, en paralelo) y los mapea a las 9
 * fichas con los selectores puros de engine/home-cards. Si un report falla, esa
 * ficha queda `null` (la UI la degrada). SIN UI aquí.
 *
 * Nota de rendimiento (para Delta 2): getMonthFlow y getRealTotals cargan ambos
 * las transacciones del periodo; se puede deduplicar más adelante. Aquí se prioriza
 * la claridad de la capa de datos sobre la micro-optimización.
 */
import {
  getMonthFlow,
  getRealTotals,
  getBudgetTotals,
  getBaseSummary,
  getDisplayCurrency,
} from "@/modules/financial-base";
import { userCurrentPeriod } from "@/lib/time/user-time";
import { getControlSummary, getDebtsOverview } from "@/modules/control";
import { getPortfolioReport, getWealthSummary, getPatrimonioReport } from "@/modules/wealth";
import { getRichLifeSummary } from "@/modules/rich-life";
import {
  selectPresupuesto,
  selectIngresos,
  selectGastos,
  selectAhorros,
  selectDeudas,
  selectInversiones,
  selectProteccion,
  selectPatrimonio,
  selectLibertad,
  deriveFundFlags,
  type HomeCards,
} from "@/modules/dashboard/engine/home-cards";

const safe = <T>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

/** Datos de las 9 fichas del carrusel del home. Cada ficha es `null` si su fuente falló. */
export async function getHomeCardsData(): Promise<HomeCards> {
  const period = await userCurrentPeriod();

  const [mf, real, budget, base, control, debts, portfolio, wealth, richLife, patrimonio, currency] =
    await Promise.all([
      safe(getMonthFlow(period)),
      safe(getRealTotals(period)),
      safe(getBudgetTotals(period)),
      safe(getBaseSummary()),
      safe(getControlSummary()),
      safe(getDebtsOverview()),
      safe(getPortfolioReport()),
      safe(getWealthSummary()),
      safe(getRichLifeSummary({ precios: "cache" })),
      safe(getPatrimonioReport()),
      getDisplayCurrency(),
    ]);

  // 1-3 · Presupuesto / Ingresos / Gastos — flujo canónico (A-01) + expenseByKey.
  const presupuesto =
    mf && real && budget ? selectPresupuesto(mf, real.expenseByKey, budget.expenseByKey) : null;
  const ingresos = mf && base ? selectIngresos(mf, base.indicators.incomeByType) : null;
  const gastos =
    mf && real && budget ? selectGastos(mf, real.expenseByKey, budget.expenseByKey) : null;

  // 4 · Ahorros — metas.
  const ahorros = control ? selectAhorros(control.goals) : null;

  // 5 · Deudas — saldos normalizados (getDebtsOverview) + método (diagnóstico de control).
  const deudas = debts
    ? selectDeudas(
        debts.debts.map((d) => ({
          id: d.id,
          name: d.name,
          balance: d.balance,
          apr: d.apr,
          minPayment: d.minPayment,
        })),
        control?.diagnosis.debtMethod?.method ?? null,
        debts.freeCashflow,
      )
    : null;

  // 6 · Inversiones — analytics + naturaleza (holdingsWithPerformance llevan nature + currentValue).
  const inversiones = portfolio
    ? selectInversiones(
        portfolio.analytics,
        portfolio.analytics.holdingsWithPerformance.map((h) => ({
          nature: h.nature ?? null,
          value: h.currentValue,
        })),
      )
    : null;

  // 7 · Protección — diagnóstico + flags de fondos derivados de las metas de defensa.
  const proteccion = wealth
    ? selectProteccion(
        wealth.protection,
        deriveFundFlags(
          (control?.goals ?? []).map((g) => ({
            goalType: g.goalType,
            name: g.name,
            currentAmount: g.currentAmount,
          })),
        ),
      )
    : null;

  // 8 · Patrimonio — indicadores de rich-life (neto/activos/pasivos/productivo/tendencia).
  const patrimonioCard = richLife
    ? selectPatrimonio({
        netWorth: richLife.snapshot.indicators.netWorth,
        totalAssets: richLife.snapshot.indicators.totalAssets,
        totalLiabilities: richLife.snapshot.indicators.totalLiabilities,
        productiveAssetsPct: richLife.snapshot.indicators.productiveAssetsPct,
        trend: richLife.snapshot.indicators.trend,
      })
    : null;

  // 9 · Libertad — report de patrimonio (hitos + fase).
  const libertad = patrimonio ? selectLibertad(patrimonio.report) : null;

  return {
    presupuesto,
    ingresos,
    gastos,
    ahorros,
    deudas,
    inversiones,
    proteccion,
    patrimonio: patrimonioCard,
    libertad,
    currency,
  };
}

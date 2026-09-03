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
  listLinkedMovements,
  previousMonthPeriod,
} from "@/modules/financial-base";
import { userCurrentPeriod } from "@/lib/time/user-time";
import type { AuthContext } from "@/lib/auth/auth-context";
import { convertCurrency } from "@/lib/fx";
import { getControlSummary, getDebtsOverview } from "@/modules/control";
import {
  getPortfolioReport,
  getWealthSummary,
  getPatrimonioReport,
  getSnapshotHistory,
} from "@/modules/wealth";
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
  deriveFundAmounts,
  type HomeCards,
} from "@/modules/dashboard/engine/home-cards";
import {
  buildAhorrosVsMes,
  buildDeudasVsMes,
  buildInversionesVsMes,
  buildPatrimonioVsMes,
} from "@/modules/dashboard/engine/vs-mes";

const safe = <T>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

/** Datos de las 9 fichas del carrusel del home. Cada ficha es `null` si su fuente falló. */
export async function getHomeCardsData(ctx?: AuthContext): Promise<HomeCards> {
  const period = await userCurrentPeriod(ctx);

  // Las 3 lecturas NUEVAS del "vs mes" (movimientos vinculados del periodo + snapshots del
  // portafolio) van en el MISMO Promise.all: corren en paralelo con todo lo demás, así el
  // Inicio no gana latencia serial. Patrimonio no añade lectura (reusa wealthVelocity de
  // rich-life); las altas de deuda reusan control.debts; el FX reusa control.fxRates.
  const [
    mf,
    real,
    budget,
    base,
    control,
    debts,
    portfolio,
    wealth,
    richLife,
    patrimonio,
    movements,
    snapshots,
    currency,
  ] = await Promise.all([
    safe(getMonthFlow(period, ctx)),
    safe(getRealTotals(period, ctx)),
    safe(getBudgetTotals(period, ctx)),
    safe(getBaseSummary(ctx)),
    safe(getControlSummary(ctx)),
    safe(getDebtsOverview({}, ctx)),
    safe(getPortfolioReport(ctx)),
    safe(getWealthSummary(ctx)),
    safe(getRichLifeSummary({ precios: "cache" }, ctx)),
    safe(getPatrimonioReport(ctx)),
    safe(listLinkedMovements(period, ["goal", "debt"], ctx)),
    safe(getSnapshotHistory("3M", ctx)),
    getDisplayCurrency(ctx),
  ]);

  // "Vs mes anterior" (Delta 3). Todo se normaliza a la moneda de display; el mes de flujo
  // (Ahorros/Deudas) es el EN CURSO (`period`), el de nivel (Inversiones) es el cierre del
  // mes anterior. Cada delta degrada a `null` (sin chip) si le falta su fuente.
  const prevPeriod = previousMonthPeriod(period);
  const convert = (amount: number, from: string) =>
    convertCurrency(amount, from, currency, control?.fxRates ?? {});
  // Los movimientos de meta/deuda son ingreso o gasto (el aporte es gasto, el retiro ingreso);
  // una transferencia no debería venir vinculada, pero la excluimos para no contarla mal.
  const asMov = (m: { kind: string }) =>
    m.kind === "ingreso" ? ("ingreso" as const) : ("gasto" as const);
  const goalMovs = (movements ?? []).filter(
    (m) => m.linkedKind === "goal" && m.kind !== "transferencia",
  );
  const debtMovs = (movements ?? []).filter(
    (m) => m.linkedKind === "debt" && m.kind !== "transferencia",
  );

  const ahorrosVsMes = movements
    ? buildAhorrosVsMes(
        goalMovs.map((m) => ({
          kind: asMov(m),
          amount: m.amount,
          currency: m.currency,
          countsInBudget: m.countsInBudget,
        })),
        convert,
      )
    : null;
  const deudasVsMes = movements
    ? buildDeudasVsMes({
        payments: debtMovs.map((m) => ({ kind: asMov(m), amount: m.amount, currency: m.currency })),
        debts: (control?.debts ?? []).map((d) => ({
          balance: d.balance,
          originalAmount: d.originalAmount ?? null,
          currency: d.currency,
          createdOn: d.createdAt ?? "",
        })),
        from: period.from,
        to: period.to,
        convert,
      })
    : null;
  const inversionesVsMes =
    snapshots && portfolio
      ? buildInversionesVsMes({
          currentValue: portfolio.analytics.totalPortfolioValue,
          snapshots: snapshots.map((s) => ({ date: s.date, portfolioValue: s.portfolioValue })),
          prevMonthEnd: prevPeriod.to,
        })
      : null;
  const patrimonioVsMes = richLife
    ? buildPatrimonioVsMes({
        netWorth: richLife.snapshot.indicators.netWorth,
        wealthVelocity: richLife.snapshot.indicators.wealthVelocity,
        velocityIsPartial: richLife.snapshot.indicators.velocityIsPartial,
      })
    : null;

  // 1-3 · Presupuesto / Ingresos / Gastos — flujo canónico (A-01) + expenseByKey.
  const presupuesto =
    mf && real && budget ? selectPresupuesto(mf, real.expenseByKey, budget.expenseByKey) : null;
  const ingresos = mf && base ? selectIngresos(mf, base.indicators.incomeByType) : null;
  const gastos =
    mf && real && budget ? selectGastos(mf, real.expenseByKey, budget.expenseByKey) : null;

  // 4 · Ahorros — metas + neto aportado/retirado del mes (vsMes).
  const ahorros = control ? selectAhorros(control.goals, ahorrosVsMes) : null;

  // 5 · Deudas — saldos normalizados (getDebtsOverview) + método + neto pagado/adquirido (vsMes).
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
        deudasVsMes,
      )
    : null;

  // 6 · Inversiones — analytics + naturaleza + ±% vs cierre del mes anterior (vsMes).
  const inversiones = portfolio
    ? selectInversiones(
        portfolio.analytics,
        portfolio.analytics.holdingsWithPerformance.map((h) => ({
          nature: h.nature ?? null,
          value: h.currentValue,
        })),
        inversionesVsMes,
      )
    : null;

  // 7 · Protección — diagnóstico de pólizas + saldos de los fondos de defensa (metas).
  const proteccion = wealth
    ? selectProteccion(
        wealth.protection,
        deriveFundAmounts(
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
    ? selectPatrimonio(
        {
          netWorth: richLife.snapshot.indicators.netWorth,
          totalAssets: richLife.snapshot.indicators.totalAssets,
          totalLiabilities: richLife.snapshot.indicators.totalLiabilities,
          productiveAssetsPct: richLife.snapshot.indicators.productiveAssetsPct,
          trend: richLife.snapshot.indicators.trend,
        },
        patrimonioVsMes,
      )
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

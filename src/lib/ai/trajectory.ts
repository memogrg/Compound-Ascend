/**
 * Motor PURO de trayectoria (memoria longitudinal). Recibe la historia de snapshots mensuales
 * (últimos ~6 meses) y, opcionalmente, la de patrimonio, y devuelve un resumen COMPACTO de
 * tendencias: dirección (sube/baja/estable) + magnitud. Determinista, sin IO ni fechas.
 *
 * Si hay menos de MIN_MONTHS meses de historia → devuelve `undefined` (no inventamos tendencias
 * para usuarios nuevos). El caller (web/WhatsApp) mapea sus filas a estos shapes mínimos.
 */

/** Punto mensual (de monthly_snapshots), en orden cronológico ascendente. */
export type MonthlyPoint = { period: string; income: number; expense: number; freeCashflow: number };
/** Punto de patrimonio (de portfolio_snapshots), en orden cronológico ascendente. */
export type PortfolioPoint = { date: string; portfolioValue: number; netWorth: number };

export type TrajectoryDir = "sube" | "baja" | "estable";
export type Trajectory = {
  /** Cuántos meses de historia mensual se usaron. */
  months: number;
  /** Tasa de ahorro (flujo libre / ingreso), cambio en puntos porcentuales. */
  savingsRate?: { dir: TrajectoryDir; deltaPp: number };
  /** Gasto mensual, cambio en %. */
  expense?: { dir: TrajectoryDir; pct: number };
  /** Patrimonio neto (si hay historia de portafolio), cambio en %. */
  netWorth?: { dir: TrajectoryDir; pct: number };
};

const MIN_MONTHS = 3; // menos de esto → sin trayectoria (usuario nuevo)
const SAVINGS_PP_STABLE = 2; // cambio < 2 pp en la tasa de ahorro → estable
const PCT_STABLE = 3; // cambio < 3% en gasto/patrimonio → estable

/** Clasifica una variación en sube/baja/estable según una banda de "sin cambio". */
function dirFrom(delta: number, stableBand: number): TrajectoryDir {
  if (Math.abs(delta) < stableBand) return "estable";
  return delta > 0 ? "sube" : "baja";
}

/**
 * Resume la trayectoria comparando el primer vs. el último punto de la ventana. Cada métrica es
 * best-effort: se omite si sus datos son degenerados (ingreso/base 0). Devuelve `undefined` si no
 * hay historia suficiente o si ninguna métrica resultó computable.
 */
export function computeTrajectory(
  monthly: MonthlyPoint[],
  portfolio: PortfolioPoint[] = [],
): Trajectory | undefined {
  if (monthly.length < MIN_MONTHS) return undefined;
  const first = monthly[0]!;
  const last = monthly[monthly.length - 1]!;
  const out: Trajectory = { months: monthly.length };

  // Tasa de ahorro (pp): flujo libre / ingreso. Requiere ingreso > 0 en ambos extremos.
  if (first.income > 0 && last.income > 0) {
    const r0 = (first.freeCashflow / first.income) * 100;
    const r1 = (last.freeCashflow / last.income) * 100;
    const deltaPp = Math.round((r1 - r0) * 10) / 10;
    out.savingsRate = { dir: dirFrom(deltaPp, SAVINGS_PP_STABLE), deltaPp };
  }
  // Gasto mensual (% de cambio). Requiere gasto inicial > 0.
  if (first.expense > 0) {
    const pct = Math.round(((last.expense - first.expense) / first.expense) * 100);
    out.expense = { dir: dirFrom(pct, PCT_STABLE), pct };
  }
  // Patrimonio neto (si hay ≥2 puntos de portafolio y base ≠ 0).
  if (portfolio.length >= 2) {
    const p0 = portfolio[0]!;
    const p1 = portfolio[portfolio.length - 1]!;
    if (p0.netWorth !== 0) {
      const pct = Math.round(((p1.netWorth - p0.netWorth) / Math.abs(p0.netWorth)) * 100);
      out.netWorth = { dir: dirFrom(pct, PCT_STABLE), pct };
    }
  }

  if (!out.savingsRate && !out.expense && !out.netWorth) return undefined;
  return out;
}

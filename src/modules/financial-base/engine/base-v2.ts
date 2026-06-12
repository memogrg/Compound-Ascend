/**
 * Motor V2 de Base Financiera (puro, testeable). Calcula totales presupuesto-vs-real,
 * composición, filas Top-N y variaciones a partir de números ya normalizados a la
 * moneda de visualización (la conversión la hace el servicio antes de llamar aquí).
 */

export type V2Totals = {
  budgetIncome: number;
  realIncome: number;
  budgetExpense: number;
  realExpense: number;
  freeCashflowReal: number;
  freeCashflowPct: number; // 0-1 (flujo libre / ingreso real)
  expenseRatio: number; // gasto real / ingreso real
  incomeVariancePct: number; // (real - presup) / presup, con signo
  expenseVariancePct: number;
};

export type CompositionSlice = { key: string; label: string; value: number; pct: number };
export type RowStatus = "ok" | "warn" | "over";
export type TopRow = {
  key: string;
  label: string;
  budget: number;
  real: number;
  diff: number; // real - budget
  sharePct: number; // participación sobre el total real
  status: RowStatus;
};

function safeDiv(a: number, b: number): number {
  return b > 0 ? a / b : 0;
}

export function computeV2Totals(input: {
  budgetIncome: number;
  realIncome: number;
  budgetExpense: number;
  realExpense: number;
}): V2Totals {
  const { budgetIncome, realIncome, budgetExpense, realExpense } = input;
  const freeCashflowReal = realIncome - realExpense;
  return {
    budgetIncome,
    realIncome,
    budgetExpense,
    realExpense,
    freeCashflowReal,
    freeCashflowPct: safeDiv(freeCashflowReal, realIncome),
    expenseRatio: safeDiv(realExpense, realIncome),
    incomeVariancePct: budgetIncome > 0 ? (realIncome - budgetIncome) / budgetIncome : 0,
    expenseVariancePct: budgetExpense > 0 ? (realExpense - budgetExpense) / budgetExpense : 0,
  };
}

/** Composición (dona) ordenada desc. con % de participación. */
export function composition(
  map: Record<string, { label: string; value: number }>,
): CompositionSlice[] {
  const entries = Object.entries(map).filter(([, v]) => v.value > 0);
  const total = entries.reduce((s, [, v]) => s + v.value, 0);
  return entries
    .map(([key, v]) => ({
      key,
      label: v.label,
      value: v.value,
      pct: total > 0 ? v.value / total : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Filas Top-N presupuesto-vs-real (por fuente/categoría). El estado se basa en
 * cuánto excede lo real al presupuesto (para gastos) o lo cumple (ingresos).
 */
export function topRows(
  budgetByKey: Record<string, { label: string; value: number }>,
  realByKey: Record<string, { label: string; value: number }>,
  opts: { kind: "income" | "expense"; limit?: number },
): TopRow[] {
  const keys = new Set([...Object.keys(budgetByKey), ...Object.keys(realByKey)]);
  const totalReal = [...keys].reduce((s, k) => s + (realByKey[k]?.value ?? 0), 0);

  const rows: TopRow[] = [...keys].map((key) => {
    const budget = budgetByKey[key]?.value ?? 0;
    const real = realByKey[key]?.value ?? 0;
    const label = realByKey[key]?.label ?? budgetByKey[key]?.label ?? key;
    const diff = real - budget;
    return {
      key,
      label,
      budget,
      real,
      diff,
      sharePct: totalReal > 0 ? real / totalReal : 0,
      status: rowStatus(diff, budget, opts.kind),
    };
  });

  rows.sort((a, b) => b.real - a.real);
  return opts.limit ? rows.slice(0, opts.limit) : rows;
}

function rowStatus(diff: number, budget: number, kind: "income" | "expense"): RowStatus {
  if (budget <= 0) return "ok";
  const ratio = diff / budget;
  if (kind === "expense") {
    if (ratio > 0.1) return "over"; // gastaste >10% sobre presupuesto
    if (ratio > 0) return "warn";
    return "ok";
  }
  // income: quedarse corto es la alerta
  if (ratio < -0.1) return "over";
  if (ratio < 0) return "warn";
  return "ok";
}

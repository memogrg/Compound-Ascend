/**
 * Motor de la Base Financiera (puro, testeable).
 * Convierte ingresos y gastos en los indicadores clave de la Biblia.
 *
 * Supuesto MVP: los montos se suman en la moneda principal del usuario. La
 * conversión multi-moneda (FX) se añade cuando exista tabla fx_rates poblada;
 * por ahora se asume que los ítems están en la moneda principal o ya
 * normalizados en `amountMonthly`.
 */
import type {
  IncomeSource,
  ExpenseItem,
  IncomeType,
  ExpenseNature,
  BaseIndicators,
  FinancialPressure,
} from "@/modules/financial-base/types";

const INCOME_TYPES: IncomeType[] = ["activo", "pasivo", "extraordinario"];
const NATURES: ExpenseNature[] = [
  "esencial",
  "estilo_vida",
  "financiero",
  "proteccion",
  "crecimiento",
  "ahorro",
  "inversion",
  "donacion",
  "miscelaneo",
];

const NON_MONTHLY = new Set([
  "anual",
  "semestral",
  "trimestral",
  "cuatrimestral",
  "bimensual",
]);

function ratio(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 1000) / 1000;
}

function pressure(income: number, expense: number, debtWeight: number): FinancialPressure {
  if (income <= 0) return income === 0 && expense === 0 ? "baja" : "critica";
  const free = income - expense;
  if (free < 0) return "critica";
  const used = expense / income;
  if (used >= 0.9 || debtWeight >= 0.4) return "alta";
  if (used >= 0.75) return "media";
  return "baja";
}

export function computeBaseIndicators(
  incomes: IncomeSource[],
  expenses: ExpenseItem[],
): BaseIndicators {
  const incomeByType = { activo: 0, pasivo: 0, extraordinario: 0 } as Record<IncomeType, number>;
  let incomeMonthly = 0;
  for (const inc of incomes) {
    if (!inc.includeInBudget) continue;
    incomeMonthly += inc.amountMonthly;
    incomeByType[inc.incomeType] += inc.amountMonthly;
  }

  const expenseByNature = Object.fromEntries(NATURES.map((n) => [n, 0])) as Record<
    ExpenseNature,
    number
  >;
  let expenseMonthly = 0;
  let annualCoverage = 0;
  for (const ex of expenses) {
    expenseMonthly += ex.amountMonthly;
    expenseByNature[ex.nature] += ex.amountMonthly;
    if (NON_MONTHLY.has(ex.frequency)) annualCoverage += ex.amountMonthly;
  }

  const freeCashflow = Math.round((incomeMonthly - expenseMonthly) * 100) / 100;
  const saved = expenseByNature.ahorro + Math.max(0, freeCashflow);
  const invested = expenseByNature.inversion;
  const debtWeight = ratio(expenseByNature.financiero, incomeMonthly);

  return {
    incomeMonthly: round2(incomeMonthly),
    expenseMonthly: round2(expenseMonthly),
    freeCashflow,
    savingsRate: ratio(saved, incomeMonthly),
    investmentRate: ratio(invested, incomeMonthly),
    debtWeight,
    essentialsWeight: ratio(expenseByNature.esencial, incomeMonthly),
    lifestyleWeight: ratio(expenseByNature.estilo_vida, incomeMonthly),
    annualCoverage: round2(annualCoverage),
    financialPressure: pressure(incomeMonthly, expenseMonthly, debtWeight),
    incomeByType,
    expenseByNature,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export { INCOME_TYPES, NATURES };

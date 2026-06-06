import { isSupabaseConfigured } from "@/lib/auth/session";
import { formatMoney } from "@/lib/format";
import { getBaseSummary } from "@/modules/financial-base/services/base-service";
import { getBudgetTotals } from "@/modules/financial-base/services/budget-service";
import {
  getRealTotals,
  getRealHistory,
  listTransactions,
} from "@/modules/financial-base/services/transaction-service";
import { listCategories } from "@/modules/financial-base/services/categories-service";
import { listAccounts } from "@/modules/financial-base/services/accounts-service";
import { listRules } from "@/modules/financial-base/services/rules-service";
import { parseMonthParam, monthParam, previousMonthPeriod } from "@/modules/financial-base/engine/period";
import { tryGenerateMonthlySnapshot } from "@/modules/financial-base/services/snapshot-service";
import { computeV2Totals, composition } from "@/modules/financial-base/engine/base-v2";
import { buildBaseReading, buildCapsule } from "@/modules/financial-base/engine/reading";
import { PeriodSelector } from "@/modules/financial-base/components/v2/period-selector";
import { BaseTabs } from "@/modules/financial-base/components/v2/base-tabs";
import {
  MiBaseSection,
  IncomeExpenseSection,
  TransaccionesSection,
  type V2View,
} from "@/modules/financial-base/components/v2/sections";

/**
 * Módulo 2 — Mi Base Financiera (V2). Centro operativo con 4 tabs reales:
 * Mi Base · Ingresos · Gastos · Transacciones. Lo real = transactions; el
 * presupuesto = budget_items. Deep-link por hash; periodo por ?period=YYYY-MM.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const configured = isSupabaseConfigured();
  const sp = await searchParams;
  const period = parseMonthParam(sp.period, new Date());

  if (!configured) {
    return (
      <div className="auth-msg warn" style={{ margin: 0 }}>
        Conecta Supabase para usar tu Base Financiera (presupuesto, ingresos, gastos y transacciones).
      </div>
    );
  }

  const [budget, real, history, transactions, categories, accounts, rules, base] = await Promise.all([
    getBudgetTotals(period),
    getRealTotals(period),
    getRealHistory(period, 6),
    listTransactions(period),
    listCategories(),
    listAccounts(),
    listRules(),
    getBaseSummary(),
  ]);

  const currency = real.currency;
  const categoryNames: Record<string, string> = {};
  for (const c of categories) categoryNames[c.id] = c.name;

  // Acumula histórico: persiste el snapshot del mes recién cerrado (best-effort).
  void tryGenerateMonthlySnapshot(previousMonthPeriod(period));

  // Lectura determinista (siempre disponible, barata).
  const totals = computeV2Totals({
    budgetIncome: budget.budgetIncome,
    realIncome: real.realIncome,
    budgetExpense: budget.budgetExpense,
    realExpense: real.realExpense,
  });
  const readingInput = {
    totals,
    financialPressure: base.indicators.financialPressure,
    expenseComposition: composition(real.expenseByKey),
    incomeComposition: composition(real.incomeByKey),
    topExpenseCategory: real.topExpenseCategory,
    currencyFormat: (n: number) => formatMoney(n, currency),
    periodLabel: period.label,
  };

  const view: V2View = {
    period,
    currency,
    budget,
    real,
    history,
    financialPressure: base.indicators.financialPressure,
    transactions,
    categories,
    accounts,
    rules,
    categoryNames,
    baseReading: buildBaseReading(readingInput),
    incomeCapsule: buildCapsule("income", readingInput),
    expenseCapsule: buildCapsule("expense", readingInput),
  };

  const tabs = [
    { id: "base", label: "Mi Base Financiera", node: <MiBaseSection view={view} /> },
    { id: "ingresos", label: "Ingresos", node: <IncomeExpenseSection view={view} kind="income" /> },
    { id: "gastos", label: "Gastos", node: <IncomeExpenseSection view={view} kind="expense" /> },
    { id: "transacciones", label: "Transacciones", node: <TransaccionesSection view={view} /> },
  ];

  return (
    <div className="grid">
      <div
        className="card card-pad"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}
      >
        <div>
          <div className="card-title">Mi Base Financiera</div>
          <div className="card-sub">
            Tu centro operativo: presupuesto, ingresos, gastos y transacciones.
          </div>
        </div>
        <PeriodSelector current={monthParam(period)} />
      </div>
      <BaseTabs tabs={tabs} />
    </div>
  );
}

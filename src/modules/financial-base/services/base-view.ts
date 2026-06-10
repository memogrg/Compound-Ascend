import "server-only";

/**
 * Carga y arma el `V2View` que consumen las páginas de Base Financiera
 * (Mi Base, Ingresos, Gastos, Transacciones). Centraliza el fetch + el armado
 * de la lectura determinista para que cada página (ruta propia) lo reutilice.
 * Devuelve `null` si Supabase no está configurado.
 */
import { isSupabaseConfigured } from "@/lib/auth/session";
import { formatMoney } from "@/lib/format";
import { getBaseSummary } from "@/modules/financial-base/services/base-service";
import { getBudgetTotals } from "@/modules/financial-base/services/budget-service";
import {
  getRealTotals,
  getRealHistory,
  listTransactions,
} from "@/modules/financial-base/services/transaction-service";
import { listCategories, listCategoryTree } from "@/modules/financial-base/services/categories-service";
import { listAccounts } from "@/modules/financial-base/services/accounts-service";
import { listRules } from "@/modules/financial-base/services/rules-service";
import { buildSuggestionIndex } from "@/modules/financial-base/services/suggestion-service";
import { listTemplates } from "@/modules/financial-base/services/templates-service";
import { listLinkableEntities } from "@/modules/financial-base/services/linkable-entities-service";
import { parseMonthParam, previousMonthPeriod } from "@/modules/financial-base/engine/period";
import { tryGenerateMonthlySnapshot } from "@/modules/financial-base/services/snapshot-service";
import { computeV2Totals, composition } from "@/modules/financial-base/engine/base-v2";
import { buildBaseReading, buildCapsule } from "@/modules/financial-base/engine/reading";
import type { V2View } from "@/modules/financial-base/components/v2/sections";

export async function loadBaseView(periodRaw?: string): Promise<V2View | null> {
  if (!isSupabaseConfigured()) return null;
  const period = parseMonthParam(periodRaw, new Date());

  const [budget, real, history, transactions, categories, tree, incomeTree, suggestions, templates, accounts, rules, linkables, base] =
    await Promise.all([
      getBudgetTotals(period),
      getRealTotals(period),
      getRealHistory(period, 6),
      listTransactions(period),
      listCategories(),
      listCategoryTree("expense"),
      listCategoryTree("income"),
      buildSuggestionIndex(),
      listTemplates(),
      listAccounts(),
      listRules(),
      listLinkableEntities(),
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

  return {
    period,
    currency,
    budget,
    real,
    history,
    financialPressure: base.indicators.financialPressure,
    transactions,
    categories,
    tree,
    incomeTree,
    suggestions,
    templates,
    accounts,
    rules,
    linkables,
    categoryNames,
    baseReading: buildBaseReading(readingInput),
    incomeCapsule: buildCapsule("income", readingInput),
    expenseCapsule: buildCapsule("expense", readingInput),
  };
}

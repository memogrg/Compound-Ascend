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
import { getLiquidityBalance } from "@/modules/financial-base/services/liquidity-service";
import { getBudgetTotals } from "@/modules/financial-base/services/budget-service";
import {
  getRealTotals,
  getRealHistory,
  getEarliestTransactionDate,
  listTransactions,
} from "@/modules/financial-base/services/transaction-service";
import {
  listCategories,
  listCategoryTree,
  getCategoryPersonalization,
  canPersonalizeCategories,
} from "@/modules/financial-base/services/categories-service";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { listAccounts } from "@/modules/financial-base/services/accounts-service";
import { listRules } from "@/modules/financial-base/services/rules-service";
import { buildSuggestionIndex } from "@/modules/financial-base/services/suggestion-service";
import { listTemplates } from "@/modules/financial-base/services/templates-service";
import { listLinkableEntities } from "@/modules/financial-base/services/linkable-entities-service";
import { syncDerivedBudget } from "@/modules/financial-base/services/derived-budget-service";
import { getExpenseJars } from "@/modules/financial-base/services/expense-jars-service";
import { TRANSACTIONS_LIST_CAP } from "@/modules/financial-base/constants";
import {
  parseMonthParam,
  parseRangeParam,
  previousMonthPeriod,
  rangeToMonths,
  type RangeKey,
} from "@/modules/financial-base/engine/period";
import { tryGenerateMonthlySnapshot } from "@/modules/financial-base/services/snapshot-service";
import { computeV2Totals, composition } from "@/modules/financial-base/engine/base-v2";
import { buildBaseReading, buildCapsule } from "@/modules/financial-base/engine/reading";
import type { V2View } from "@/modules/financial-base/components/v2/sections";

export async function loadBaseView(periodRaw?: string, rangeRaw?: string): Promise<V2View | null> {
  if (!isSupabaseConfigured()) return null;
  const period = parseMonthParam(periodRaw, new Date());

  // Rango del histórico/cuadros (solo lo pasa el tab de Ingresos). Sin rango se
  // conserva la ventana de 6 meses que usan Mi Base, Gastos y Transacciones.
  const range: RangeKey | undefined =
    rangeRaw !== undefined ? parseRangeParam(rangeRaw) : undefined;
  let monthsBack = 6;
  if (range) {
    monthsBack = rangeToMonths(range);
    if (range === "all") {
      const earliest = await getEarliestTransactionDate();
      if (earliest) {
        const e = new Date(earliest);
        const months = (period.year - e.getFullYear()) * 12 + (period.month - (e.getMonth() + 1));
        monthsBack = Math.min(120, Math.max(1, months + 1));
      } else {
        monthsBack = 1;
      }
    }
  }

  // Plan derivado (Fase 3): sincroniza las líneas que nacen de entidades
  // ANTES de leer el presupuesto, para que el periodo refleje deudas/metas/
  // pólizas/recurrentes/dividendos al día. Best-effort: si falla, la vista
  // carga igual con lo que haya.
  try {
    await syncDerivedBudget(period);
  } catch (err) {
    // Best-effort: la vista carga igual. Pero logueamos (antes el catch vacío
    // escondió un fallo del sync durante horas).
    console.error("[loadBaseView] syncDerivedBudget falló:", err);
  }

  const [
    budget,
    real,
    history,
    transactions,
    categories,
    tree,
    incomeTree,
    suggestions,
    templates,
    accounts,
    rules,
    linkables,
    base,
    rates,
    liquidity,
    canPersonalize,
    personalization,
  ] = await Promise.all([
    getBudgetTotals(period),
    getRealTotals(period),
    getRealHistory(period, monthsBack),
    listTransactions(period, {}, TRANSACTIONS_LIST_CAP),
    listCategories(),
    listCategoryTree("expense"),
    listCategoryTree("income"),
    buildSuggestionIndex(),
    listTemplates(),
    listAccounts(),
    listRules(),
    listLinkableEntities(),
    getBaseSummary(),
    getFxRates(),
    getLiquidityBalance(),
    canPersonalizeCategories(),
    getCategoryPersonalization(),
  ]);

  const currency = real.currency;
  const categoryNames: Record<string, string> = {};
  for (const c of categories) categoryNames[c.id] = c.name;

  // Frascos del tab de Gastos (reusa tree + budget/real ya cargados).
  const jars = await getExpenseJars({
    tree,
    budgetByKey: budget.expenseByKey,
    realByKey: real.expenseByKey,
    nativeBudgetByKey: budget.nativeByKey,
    currency,
    // Frasco "Por reasignar": el titular suma TODOS los budget_items, así que el
    // engine necesita los crudos para detectar los que no se pintan en ningún lado.
    budgetItems: budget.items,
    hiddenCategoryIds: personalization.hidden.map((h) => h.id),
  });

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
    range,
    currency,
    rates,
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
    jars,
    categoryNames,
    liquidity,
    canPersonalize,
    personalization,
    baseReading: buildBaseReading(readingInput),
    incomeCapsule: buildCapsule("income", readingInput),
    expenseCapsule: buildCapsule("expense", readingInput),
  };
}

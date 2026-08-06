/** Barrel público del Módulo 2 — Mi Base Financiera. */
export { monthlyize } from "./engine/monthlyize";
export type { Frequency } from "./engine/monthlyize";
export { computeBaseIndicators } from "./engine/base-engine";
export { computeHealthScore } from "./engine/health";
// A-01: Flujo del mes canónico
export { classifyTxnFlow, aggregateMonthFlow } from "./engine/month-flow";
export type { MonthFlow, FlowClass, MonthFlowRow } from "./engine/month-flow";
export { getMonthFlow } from "./services/month-flow-service";
// Piloto Inicio · Delta 1: helpers de datos
export { unbudgetedExpenseShare } from "./engine/budget-coverage";
export type { BudgetCoverage, KeyedValue } from "./engine/budget-coverage";
export type { HealthScore } from "./engine/health";
// Piloto Inicio · Delta 1: agregados de periodo para las fichas
export { getRealTotals } from "./services/transaction-service";
export type { RealTotals } from "./services/transaction-service";
export { getBudgetTotals } from "./services/budget-service";
export type { BudgetTotals } from "./services/budget-service";
export {
  getBaseSummary,
  getDisplayCurrency,
  getPrimaryCurrency,
  DISPLAY_CURRENCY_COOKIE,
} from "./services/base-service";
export {
  createTransaction,
  listTransactions,
  listLinkedMovements,
  deleteTransaction,
} from "./services/transaction-service";
export type { LinkedMovement } from "./services/transaction-service";
export { getLiquidityBalance } from "./services/liquidity-service";
// Cuentas del usuario (trazabilidad de liquidez para la IA).
export { listAccounts } from "./services/accounts-service";
// Resumen ligero de sobres (gasto favoritos + metas) agrupados por frasco, para la IA
// (contexto) y el router (intent determinista "listá mis sobres").
export { getEnvelopesSummary, formatEnvelopesReply } from "./services/envelopes-service";
export type { EnvelopesSummary } from "./services/envelopes-service";
// Líneas derivadas del presupuesto (renta/dividendos/…): wealth las sincroniza
// al registrar un pago para conciliarlo contra la barra "Recibido".
export { syncDerivedBudget } from "./services/derived-budget-service";
export { monthPeriod, previousMonthPeriod } from "./engine/period";
// Fase 3 · flujo inverso: al borrar un stub de inversión, wealth revierte las
// fuentes de ingreso vinculadas (dirección wealth → financial-base).
export { deleteIncomeSourcesByHolding } from "./services/budget-service";
// Headline de Gastos (planificado vs real por rango) — el widget de Presupuesto lo calca.
export { getExpenseRangeView } from "./services/expense-range-service";
// Árbol de categorías (grupo → hojas) para selectores de gasto reutilizables.
export {
  listCategoryTree,
  getCategoryNameMap,
  createCategory,
} from "./services/categories-service";
export type { CategoryNode } from "./services/categories-service";
export { groupByJar, monedaVinculadaEsCoherente } from "./engine/expense-jars";
export type { JarGroup } from "./engine/expense-jars";
// Sugerencia de sobre para el chat (IA acotada a los sobres del usuario + fallback historial)
// y listado "Frasco › Sobre" para el selector de la card de confirmación.
export {
  listSobresForKind,
  listAllSobresForKind,
  suggestSobreForChat,
  suggestSobreForChatFast,
} from "./services/ai-categorize";
export type { SobreOption } from "./services/ai-categorize";
// Restante de un sobre tras registrar un gasto (mensaje de éxito del chat).
export { getSobreRemaining } from "./services/sobre-remaining";
export type { SobreRemaining } from "./services/sobre-remaining";
// Orquestador de transacciones vinculadas: la puerta de entrada para que
// control/wealth/assistant registren eventos de dinero (CLAUDE.md).
export {
  registerLinkedTransaction,
  buildLinkedTransactionRow,
  deleteLinkedTransaction,
  propagateLinkedTransaction,
  getSystemCategoryId,
} from "./services/linked-transaction-service";
export {
  debtPaymentToTxn,
  policyPremiumToTxn,
  goalContributionToTxn,
  goalWithdrawalToTxn,
  goalSpendToTxn,
  dividendToTxn,
  rentalPaymentToTxn,
  holdingPurchaseToTxn,
  holdingSaleToTxn,
  purchaseExpenseAmount,
  positionIncreaseAmount,
} from "./engine/linked";
export { BaseDashboard } from "./components/base-dashboard";
export { BaseActions } from "./components/base-actions";
export type { BaseSummary } from "./services/base-service";
export type { BaseIndicators, IncomeSource, ExpenseItem, ExpenseNature } from "./types";
export type { Transaction, TxnKind, Period } from "./types";
/** Fija el presupuesto de un sobre del periodo (lo usa el tab de Gastos y el asesor). */
export { setEnvelopeBudgetAction } from "./api/v2-actions";

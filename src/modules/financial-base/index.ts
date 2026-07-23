/** Barrel público del Módulo 2 — Mi Base Financiera. */
export { monthlyize } from "./engine/monthlyize";
export type { Frequency } from "./engine/monthlyize";
export { computeBaseIndicators } from "./engine/base-engine";
export { computeHealthScore } from "./engine/health";
export type { HealthScore } from "./engine/health";
export {
  getBaseSummary,
  getDisplayCurrency,
  getPrimaryCurrency,
  DISPLAY_CURRENCY_COOKIE,
} from "./services/base-service";
export {
  createTransaction,
  listTransactions,
  deleteTransaction,
} from "./services/transaction-service";
export { getLiquidityBalance } from "./services/liquidity-service";
// Resumen ligero de sobres (gasto favoritos + metas) agrupados por frasco, para la IA
// (contexto) y el router (intent determinista "listá mis sobres").
export { getEnvelopesSummary, formatEnvelopesReply } from "./services/envelopes-service";
export type { EnvelopesSummary } from "./services/envelopes-service";
// Líneas derivadas del presupuesto (renta/dividendos/…): wealth las sincroniza
// al registrar un pago para conciliarlo contra la barra "Recibido".
export { syncDerivedBudget } from "./services/derived-budget-service";
export { monthPeriod } from "./engine/period";
// Fase 3 · flujo inverso: al borrar un stub de inversión, wealth revierte las
// fuentes de ingreso vinculadas (dirección wealth → financial-base).
export { deleteIncomeSourcesByHolding } from "./services/budget-service";
// Headline de Gastos (planificado vs real por rango) — el widget de Presupuesto lo calca.
export { getExpenseRangeView } from "./services/expense-range-service";
// Árbol de categorías (grupo → hojas) para selectores de gasto reutilizables.
export { listCategoryTree, getCategoryNameMap, createCategory } from "./services/categories-service";
export type { CategoryNode } from "./services/categories-service";
export { groupByJar } from "./engine/expense-jars";
export type { JarGroup } from "./engine/expense-jars";
// Sugerencia de sobre para el chat (IA acotada a los sobres del usuario + fallback historial)
// y listado "Frasco › Sobre" para el selector de la card de confirmación.
export { listSobresForKind, suggestSobreForChat } from "./services/ai-categorize";
export type { SobreOption } from "./services/ai-categorize";
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

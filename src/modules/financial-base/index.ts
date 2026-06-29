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
export { createTransaction } from "./services/transaction-service";
export { getLiquidityBalance } from "./services/liquidity-service";
// Líneas derivadas del presupuesto (renta/dividendos/…): wealth las sincroniza
// al registrar un pago para conciliarlo contra la barra "Recibido".
export { syncDerivedBudget } from "./services/derived-budget-service";
export { monthPeriod } from "./engine/period";
// Fase 3 · flujo inverso: al borrar un stub de inversión, wealth revierte las
// fuentes de ingreso vinculadas (dirección wealth → financial-base).
export { deleteIncomeSourcesByHolding } from "./services/budget-service";
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

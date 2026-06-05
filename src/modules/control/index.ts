/** Barrel público del Módulo 3 — Control Financiero. */
export { buildControlDiagnosis } from "./engine/priority-engine";
export {
  simulateStrategy,
  recommendMethod,
  orderDebts,
} from "./engine/debt-strategy";
export {
  buildSchedule,
  compareExtra,
  solveExtraForTarget,
  applyExtraDecision,
  recomputeFromPayments,
  pmt,
  paysOff,
} from "./engine/amortization";
export type {
  AmortizationInput,
  ScheduleRow,
  ScheduleOpts,
  ExtraComparison,
  ExtraDecision,
  PaymentRecord,
  RecomputeResult,
} from "./engine/amortization";
export { getControlSummary, listDebts } from "./services/control-service";
export { getDebtsOverview } from "./services/debts-service";
export { getDebtDetail } from "./services/debt-detail-service";
export { ControlDashboard } from "./components/control-dashboard";
export { ControlActions } from "./components/control-actions";
export { DebtsView } from "./components/debts-view";
export { DebtDetail } from "./components/debt-detail";
export type { ControlSummary } from "./services/control-service";
export type { DebtsOverview, DebtVM } from "./services/debts-service";
export type { DebtDetailVM } from "./services/debt-detail-service";
export type {
  ControlDiagnosis,
  SavingsGoal,
  Debt,
  DebtPayment,
  DebtRateType,
  DebtRateIndex,
  ExtraMode,
} from "./types";

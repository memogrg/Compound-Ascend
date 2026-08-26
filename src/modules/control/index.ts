/** Barrel público del Módulo 3 — Control Financiero. */
export { buildControlDiagnosis } from "./engine/priority-engine";
export { simulateStrategy, recommendMethod, orderDebts } from "./engine/debt-strategy";
export type { DebtMethod, DebtSimulation, DebtInput } from "./engine/debt-strategy";
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
export {
  getControlSummary,
  listDebts,
  getDebt,
  listGoals,
  createGoal,
  listDebtPayments,
} from "./services/control-service";
export { createSavingsSobreAction, reportPaymentAction } from "./api/actions";
export {
  montoSugerido,
  avanceMes,
  textoAvanceMes,
  desglosePago,
  validarPago,
  pagoValido,
} from "./engine/pago-vinculado";
export type { PagoContext, PagoKind, PagoErrores, Desglose } from "./engine/pago-vinculado";
export { goalInputSchema } from "./schemas";
export {
  getDebtsOverview,
  getCurrentDebtBalances,
  currentDebtBalance,
} from "./services/debts-service";
export type { DebtBalance } from "./services/debts-service";
export { getDebtDetail } from "./services/debt-detail-service";
export { getIndexRates, effectiveApr, buildRateNote } from "./services/index-rates";
export { ControlDashboard } from "./components/control-dashboard";
export { PagoVinculadoButton } from "./components/pago-vinculado-button";
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

// Piloto Inicio · Delta 1: helpers de datos
export { rankSavingsGoalsByLag } from "./engine/goal-lag";
export type { GoalLag, GoalLagInput } from "./engine/goal-lag";

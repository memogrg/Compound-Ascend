/** Barrel público del Módulo 3 — Control Financiero. */
export { buildControlDiagnosis } from "./engine/priority-engine";
export {
  simulateStrategy,
  recommendMethod,
  orderDebts,
} from "./engine/debt-strategy";
export { getControlSummary } from "./services/control-service";
export { ControlDashboard } from "./components/control-dashboard";
export { ControlActions } from "./components/control-actions";
export type { ControlSummary } from "./services/control-service";
export type { ControlDiagnosis, SavingsGoal, Debt } from "./types";

/**
 * Barrel público del Módulo "Mis acciones".
 *
 * Dependencias en UN solo sentido: actions → control, wealth, financial-base, insights (por sus
 * barrels). Ningún módulo depende de éste; si alguna vez hiciera falta, el dato se pasa por
 * props desde la página, no con un import de vuelta.
 */
export {
  buildActionPlan,
  buildStage,
  buildNote,
  resolveActionPriority,
  STAGE_LABELS,
} from "./engine/action-engine";
export type { ActionEngineInput } from "./engine/action-engine";
export {
  getActionPlan,
  getActionProgress,
  getDecisionsView,
  getEffectivePriority,
} from "./services/actions-service";
export type { DecisionsView, DebtRowVM, PauseComparisonVM } from "./services/actions-service";
export { ActionsView, type ActionsTab } from "./components/actions-view";
export { DecisionsTab } from "./components/decisions-tab";
export type { MiniComparison } from "./components/action-hero";
export {
  markActionDone,
  snoozeAction,
  dismissAction,
  reactivateAction,
  setActionPriority,
} from "./api/actions";
export type {
  Action,
  ActionImpact,
  ActionKind,
  ActionPlan,
  ActionPlanInputs,
  ActionPriority,
  ActionProgress,
  ActionSource,
  ActionState,
  ActionStatus,
  ExpensiveDebt,
  Stage,
} from "./types";

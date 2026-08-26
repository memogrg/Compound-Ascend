/**
 * Barrel público del Módulo de Configuración guiada — los cuatro asistentes.
 *
 * El módulo NO tiene tablas propias: lee y escribe las MISMAS entidades que la
 * app, por los MISMOS servicios y actions (ver `services/setup-state.ts` y los
 * componentes de `components/wizards/`). Su único aporte propio es el motor de
 * progreso derivado y el de sugerencias, ambos puros.
 */
export { getSetupSnapshot, getSetupProgress } from "./services/setup-state";
export {
  deriveSetupProgress,
  deriveWizardProgress,
  setupOverall,
  isSetupWizardId,
  presupuestoSteps,
  controlSteps,
  defensaSteps,
  crecimientoSteps,
  SETUP_WIZARD_IDS,
} from "./engine/progress";
export {
  budgetBalance,
  nextAfterBudget,
  suggestDca,
  suggestGoalMonthly,
  suggestJarBudget,
  suggestLifestyle,
  suggestSobreBudget,
  JAR_BENCHMARK,
  LINKED_JAR_KEYS,
} from "./engine/suggestions";
export type { Suggestion, BudgetBalance, NextMove } from "./engine/suggestions";
export { SetupHub, SetupHubFull } from "./components/setup-hub";
export { SetupWizard } from "./components/setup-wizard";
export type { SetupStepDef, SetupSkin } from "./components/setup-wizard";
export { PresupuestoWizard } from "./components/wizards/presupuesto-wizard";
export { ControlWizard } from "./components/wizards/control-wizard";
export { DefensaWizard } from "./components/wizards/defensa-wizard";
export { CrecimientoWizard } from "./components/wizards/crecimiento-wizard";
export type {
  SetupSnapshot,
  SetupWizardId,
  SetupWizardProgress,
  SetupStepStatus,
  SetupStatus,
} from "./types";

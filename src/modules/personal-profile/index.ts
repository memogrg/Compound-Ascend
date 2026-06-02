/** Barrel público del Módulo 1 — Mi Perfil Financiero. */
export { Wizard } from "./components/wizard";
export { ProfileSummary } from "./components/summary";
export { buildDiagnosis, computeCompletion, computeRiskClass } from "./engine/diagnosis";
export { getDraft } from "./services/profile-service";
export { saveDraftAction, completeOnboardingAction } from "./api/actions";
export type { ProfileDraft, ProfileDiagnosis, RiskClass } from "./types";

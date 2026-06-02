/** Barrel público del Módulo 2 — Mi Base Financiera. */
export { monthlyize } from "./engine/monthlyize";
export { computeBaseIndicators } from "./engine/base-engine";
export { getBaseSummary } from "./services/base-service";
export { BaseDashboard } from "./components/base-dashboard";
export { BaseActions } from "./components/base-actions";
export type { BaseSummary } from "./services/base-service";
export type { BaseIndicators, IncomeSource, ExpenseItem } from "./types";

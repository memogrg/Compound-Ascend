/**
 * Tipos del Módulo de Configuración guiada (los cuatro asistentes).
 *
 * ── PRINCIPIO RECTOR: SIN ESTADO PARALELO ────────────────────────────────────
 * Este módulo NO tiene tablas propias ni guarda una copia de la configuración.
 * `SetupSnapshot` es una PROYECCIÓN DE SOLO LECTURA de las mismas entidades que
 * pintan las pantallas de la app (income_sources, expense_categories,
 * budget_items, debts, savings_goals, insurance_policies, investment_holdings),
 * leída con los MISMOS servicios. El "progreso" de cada asistente se DERIVA de
 * esa proyección (engine/progress.ts) — no existe ninguna bandera persistida.
 *
 * Consecuencia buscada: lo que cambiás en la app aparece en el asistente y
 * viceversa, siempre, sin sincronización. Y por eso no hace falta migración.
 */

export type SetupWizardId = "presupuesto" | "control" | "defensa" | "crecimiento";

/** Una fuente de ingreso, ya mensualizada por el motor de financial-base. */
export type SetupIncome = {
  id: string;
  name: string;
  amount: number;
  amountMonthly: number;
  currency: string;
  incomeType: string;
  frequency: string;
  recurrent: boolean;
};

/** Un frasco (categoría de gasto de nivel superior). */
export type SetupJar = { id: string; name: string; key: string | null };

/**
 * Un sobre candidato: hoja de gasto, sea ya favorita (= sobre activo) o no.
 * `isSystem` decide QUÉ action activa el sobre: una hoja del catálogo base se
 * personaliza con `forkCategoryAction`; una propia se edita con
 * `editCategoryAction`. Es exactamente la bifurcación de `personalize-category`.
 */
export type SetupSobre = {
  id: string;
  name: string;
  jarId: string;
  jarName: string;
  /** Clave de sistema del frasco (g_vivienda, g_estilo…): la usa el motor de sugerencias. */
  jarKey: string | null;
  isSystem: boolean;
  isFavorite: boolean;
  isEssential: boolean;
  icon: string | null;
  color: string | null;
  /** Presupuesto del periodo para este sobre (null = sin línea de presupuesto). */
  budget: number | null;
  budgetCurrency: string | null;
  /** Línea derivada de una entidad (holding/deuda/póliza/meta): se edita en su módulo. */
  locked: boolean;
};

export type SetupDebt = {
  id: string;
  name: string;
  balance: number;
  minPayment: number;
  apr: number | null;
  currency: string;
};

export type SetupGoal = {
  id: string;
  name: string;
  kind: string;
  goalType: string | null;
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number;
  recurrence: string;
  currency: string;
};

export type SetupPolicy = {
  id: string;
  policyType: string;
  provider: string | null;
  coverage: number | null;
  premium: number | null;
  currency: string;
};

export type SetupHolding = {
  id: string;
  label: string;
  symbol: string | null;
  assetType: string;
  quantity: number;
  averageCost: number;
  currency: string;
  monthlyContribution: number;
  isRecurring: boolean;
};

/** Dimensionamiento de los fondos de defensa, tal cual lo calcula `fund-sizing`. */
export type SetupFund = {
  target: number;
  current: number;
  gap: number;
  progressPct: number;
  covered: boolean;
  recommendedMonthly: number;
  registered: boolean;
};

/**
 * Proyección de solo lectura del estado REAL. Todo lo que los asistentes
 * muestran sale de aquí; todo lo que escriben va por los actions de siempre.
 */
export type SetupSnapshot = {
  currency: string;
  period: { year: number; month: number };

  // ── Presupuesto ──
  incomes: SetupIncome[];
  incomeMonthly: number;
  jars: SetupJar[];
  sobres: SetupSobre[];
  budgetedMonthly: number;

  // ── Control ──
  debts: SetupDebt[];
  goals: SetupGoal[];

  // ── Defensa ──
  emergency: SetupFund | null;
  peace: (SetupFund & { months: number; blockedByEmergency: boolean }) | null;
  essentialMonthly: number;
  policies: SetupPolicy[];

  // ── Crecimiento ──
  holdings: SetupHolding[];
  desiredLifestyle: { amount: number; currency: string } | null;
};

/** Estado derivado de un paso. Nunca se persiste. */
export type SetupStepStatus = {
  id: string;
  label: string;
  done: boolean;
  /** Un paso opcional cuenta para el detalle, pero no impide el estado "listo". */
  optional: boolean;
  /** Resumen de una línea con SUS números ("3 sobres · ₡420.000"). */
  detail: string;
};

export type SetupStatus = "sin_empezar" | "en_curso" | "listo";

export type SetupWizardProgress = {
  id: SetupWizardId;
  title: string;
  /** Para qué sirve, en una línea. */
  purpose: string;
  href: string;
  mobileHref: string;
  icon: string;
  steps: SetupStepStatus[];
  done: number;
  total: number;
  status: SetupStatus;
  /** Índice del primer paso sin completar (dónde "seguir"). 0 si están todos. */
  resumeIndex: number;
};

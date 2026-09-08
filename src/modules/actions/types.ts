/**
 * Tipos del Módulo "Mis acciones" — el único lugar donde viven las recomendaciones.
 *
 * Regla del módulo: acá NO se calcula ninguna cifra nueva. Todo número viene de los motores
 * que ya existen (control, wealth, insights, fondos de defensa) y este módulo solo lo ORDENA,
 * lo explica y recuerda qué decidió la persona. Si una fuente no puede dar un impacto medido,
 * la acción no existe.
 */

/** Prioridad declarada por la persona: reordena y cambia el tono. NUNCA cambia las reglas. */
export type ActionPriority = "deudas" | "orden" | "proteger" | "crecer";

/** Dominio de la acción. Coincide con las prioridades a propósito: así el peso es legible. */
export type ActionKind = "deuda" | "orden" | "proteger" | "crecer";

/** De qué motor nació la acción (para trazar la cifra hasta su fuente). */
export type ActionSource = "surplus" | "control" | "insight" | "defense" | "wealth";

/**
 * Impacto CONCRETO de hacer la acción. `label` ya viene formateado (con su moneda cuando es
 * dinero): quien la pinta no vuelve a formatear ni a decidir símbolos.
 */
export type ActionImpact = {
  kind: "monto" | "meses" | "porcentaje" | "brecha";
  value?: number;
  currency?: string;
  label: string;
};

export type Action = {
  /** Clave determinista '<source>:<kind>:<related|periodo>'. Es la identidad de la acción. */
  key: string;
  kind: ActionKind;
  title: string;
  /** Por qué importa, con el dato que la sustenta. Una o dos frases. */
  why: string;
  impact: ActionImpact;
  /** Esfuerzo estimado, en lenguaje humano ("2 minutos", "una decisión"). */
  effort: string;
  /** A dónde se va a hacer, dentro de la app. */
  route: string;
  /** Bloqueada: se muestra, pero sin botones y con su razón. */
  locked?: boolean;
  lockReason?: string;
  /** Contenido del "¿Por qué esto primero?" (markdown corto). */
  teach: string;
  source: ActionSource;
  /** Insight que la originó, si vino de la campana (para descartarlo junto con la acción). */
  relatedInsightId?: string;
  /** Peso por prioridad: la prioridad reordena, no cambia las reglas. */
  weights: Record<ActionPriority, number>;
};

/** Las 5 etapas del camino. La ACTUAL es la primera que falla. */
export type Stage = {
  level: 1 | 2 | 3 | 4 | 5;
  label: string;
  /** Qué falta para pasar de esta etapa, con el dato («Falta: Tarjeta BAC · ₡1.850.000 al 24%»). */
  blockers: string[];
};

/** Deuda cara ya identificada por el servicio con la regla del 12% (DEBT_INVEST_THRESHOLD). */
export type ExpensiveDebt = {
  id: string;
  name: string;
  /** TAE en % (24 = 24%). */
  apr: number;
  /** Saldo VIVO en moneda de display. */
  balance: number;
};

/** Con qué se decidió el plan: los insumos visibles del rail «Con qué decidimos». */
export type ActionPlanInputs = {
  /** Excedente mensual (flujo libre) en moneda de display. */
  surplus: number;
  expensiveDebt: ExpensiveDebt | null;
  fundsCovered: boolean;
  activeGoals: number;
  /** Próxima revisión (ISO): el 1 del mes siguiente. */
  nextReview: string;
};

export type ActionPlan = {
  priority: ActionPriority;
  /** Una frase con la marca del agente: qué significa esta prioridad HOY, con datos. */
  note: string;
  hero: Action | null;
  /** Máximo 3. */
  now: Action[];
  /** El resto + las bloqueadas + las pospuestas vigentes. */
  later: Action[];
  stage: Stage;
  inputs: ActionPlanInputs;
  currency: string;
};

export type ActionStatus = "hecha" | "pospuesta" | "descartada";

/** Fila de user_action_states, tipada. */
export type ActionState = {
  id: string;
  actionKey: string;
  status: ActionStatus;
  /** Solo 'pospuesta': fecha ISO hasta la que no se vuelve a proponer. */
  snoozeUntil: string | null;
  /** Impacto congelado al marcar 'hecha'. */
  impact: ActionImpact | null;
  createdAt: string;
  updatedAt: string;
};

/** Lo hecho, lo pospuesto y lo descartado — con la suma de lo que eso significó. */
export type ActionProgress = {
  done: ActionState[];
  snoozed: ActionState[];
  dismissed: ActionState[];
  /** Suma de los impactos 'monto' de las acciones hechas (moneda de display). */
  interestAvoided: number;
  /** Suma de los impactos 'meses' de las acciones hechas. */
  monthsGained: number;
  currency: string;
};

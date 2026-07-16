/** Tipos del Módulo 3 — Control Financiero. */

export type GoalPriority = "alta" | "media" | "baja";
export type GoalStatus = "saludable" | "atrasado" | "no_viable" | "revisar";
/** Tipo de ahorro: 'meta' (con objetivo) o 'sobre' (acumulador puro, sin meta). */
export type SavingsKind = "meta" | "sobre";

export type { Recurrence } from "@/modules/control/engine/recurrence";

export type SavingsGoal = {
  id: string;
  name: string;
  goalType?: string | null;
  kind: SavingsKind;
  /** 0 cuando es un sobre (sin meta); usar `kind`/`targetAmount > 0` para el progreso. */
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number;
  currency: string;
  targetDate?: string | null;
  priority?: GoalPriority | null;
  status: GoalStatus;
  // Frascos recurrentes: reinicio por período (arrastre del sobrante).
  recurrence: import("@/modules/control/engine/recurrence").Recurrence;
  periodAmount?: number | null;
  nextResetOn?: string | null;
  // Categoría por defecto: se precarga (editable) al gastar del frasco.
  defaultCategoryId?: string | null;
};

export type DebtClassification = "critica" | "controlada" | "estrategica" | "emocional";
export type DebtRateType = "fija" | "variable";
export type DebtRateIndex = "prime" | "tbp" | "tri";
export type ExtraMode = "tiempo" | "cuota";
/** Tipo de pago de deuda (Fase B): ordinario = cuota del mes; extraordinario = abono a capital. */
export type PaymentKind = "ordinario" | "extraordinario";

export type Debt = {
  id: string;
  name: string;
  debtType?: string | null;
  balance: number;
  minPayment: number;
  /** Cuota mensual (columna current_payment). */
  currentPayment: number;
  apr: number | null;
  currency: string;
  isCurrent: boolean;
  delinquency?: "no" | "1_30" | "31_60" | "60_mas" | null;
  stress?: number | null;
  classification?: DebtClassification | null;
  // ── Calculadora / amortización (migración 0016) ──
  originalAmount?: number | null;
  rateType?: DebtRateType | null;
  rateIndex?: DebtRateIndex | null;
  /** Margen (en puntos) sumado al índice en deudas variables. */
  rateSpread?: number | null;
  /** Plazo total en meses. */
  termMonths?: number | null;
  startDate?: string | null;
  extraMonthly?: number | null;
  insurance?: number | null;
  notes?: string | null;
  // ── Banco, tasa introductoria y recordatorios (migración 0017) ──
  bank?: string | null;
  /** Día del mes de pago (1-31) si se conoce. */
  payDay?: number | null;
  /** Meses iniciales a TAE fija (intro) antes de pasar a variable. */
  introFixedMonths?: number | null;
  /** TAE fija (%) durante el periodo introductorio. */
  introApr?: number | null;
  /** Último día (ISO) en que se envió recordatorio de pago. */
  lastRemindedOn?: string | null;
};

/** Pago reportado de una deuda (fuente de la verdad: tabla debt_payments). */
export type DebtPayment = {
  id: string;
  debtId: string;
  /** Fecha del pago (columna occurred_on). */
  paymentDate: string;
  amount: number;
  extraAmount: number;
  extraMode?: ExtraMode | null;
  /** Tipo de pago: ordinario (cuota) | extraordinario (abono a capital). */
  kind: PaymentKind;
  /** Capital/interés estimados del pago (Fase 7); null si no hay tasa. */
  principal?: number | null;
  interest?: number | null;
  /** source de la transacción vinculada ('manual'|'chat'|'receipt') o null. */
  viaSource?: string | null;
};

export type GoalAction =
  | "mantener"
  | "acelerar"
  | "reducir"
  | "pausar"
  | "convertir"
  | "replantear";

export type GoalRecommendation = {
  goalId: string;
  goalName: string;
  action: GoalAction;
  reason: string;
  requiredMonthly?: number;
};

export type Semaforo = "verde" | "amarillo" | "rojo";

export type AllocationItem = { label: string; amount: number; note?: string };

export type ControlContext = {
  freeCashflow: number;
  hasEmergencyFund: boolean;
  discipline?: number;
  stress?: number;
  riskClass?: string;
};

export type ControlDiagnosis = {
  scoreControl: number; // 0-100
  semaforo: Semaforo;
  diagnosis: string;
  decision: string;
  impact: string;
  nextBestAction: string;
  allocation: AllocationItem[];
  goalRecs: GoalRecommendation[];
  alerts: string[];
  plan30: string[];
  debtMethod?: { method: "avalancha" | "bola_nieve" | "hibrido"; reason: string };
};

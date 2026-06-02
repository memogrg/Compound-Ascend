/** Tipos del Módulo 3 — Control Financiero. */

export type GoalPriority = "alta" | "media" | "baja";
export type GoalStatus = "saludable" | "atrasado" | "no_viable" | "revisar";

export type SavingsGoal = {
  id: string;
  name: string;
  goalType?: string | null;
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number;
  currency: string;
  targetDate?: string | null;
  priority?: GoalPriority | null;
  status: GoalStatus;
};

export type DebtClassification = "critica" | "controlada" | "estrategica" | "emocional";

export type Debt = {
  id: string;
  name: string;
  debtType?: string | null;
  balance: number;
  minPayment: number;
  currentPayment: number;
  apr: number | null;
  currency: string;
  isCurrent: boolean;
  delinquency?: "no" | "1_30" | "31_60" | "60_mas" | null;
  stress?: number | null;
  classification?: DebtClassification | null;
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

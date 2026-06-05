/** Tipos del Módulo 2 — Mi Base Financiera. */
import type { Frequency } from "@/modules/financial-base/engine/monthlyize";

export type { Frequency };

export type IncomeType = "activo" | "pasivo" | "extraordinario";
export type Certainty = "seguro" | "probable" | "incierto";
export type OwnerScope = "usuario" | "pareja" | "familia" | "grupo";

export type ExpenseNature =
  | "esencial"
  | "estilo_vida"
  | "financiero"
  | "proteccion"
  | "crecimiento"
  | "ahorro"
  | "inversion"
  | "donacion"
  | "miscelaneo";

export type Obligation = "obligatorio" | "flexible" | "deseable";

export type IncomeSource = {
  id: string;
  name: string;
  incomeType: IncomeType;
  category?: string | null;
  amount: number;
  currency: string;
  frequency: Frequency;
  isFixed: boolean;
  certainty?: Certainty | null;
  ownerScope: OwnerScope;
  includeInBudget: boolean;
  amountMonthly: number;
};

export type ExpenseItem = {
  id: string;
  name: string;
  categoryId?: string | null;
  nature: ExpenseNature;
  amount: number;
  currency: string;
  frequency: Frequency;
  isFixed: boolean;
  obligation?: Obligation | null;
  reducible?: "si" | "no" | "tal_vez" | null;
  ownerScope: OwnerScope;
  amountMonthly: number;
};

export type FinancialPressure = "baja" | "media" | "alta" | "critica";

export type BaseIndicators = {
  incomeMonthly: number;
  expenseMonthly: number;
  freeCashflow: number;
  savingsRate: number; // 0-1
  investmentRate: number; // 0-1
  debtWeight: number; // 0-1
  essentialsWeight: number; // 0-1
  lifestyleWeight: number; // 0-1
  annualCoverage: number; // provisión mensual de gastos no mensuales
  financialPressure: FinancialPressure;
  incomeByType: Record<IncomeType, number>;
  expenseByNature: Record<ExpenseNature, number>;
};

// ---------- Base Financiera V2 ----------
export type TxnKind = "ingreso" | "gasto";
export type TxnStatus = "confirmed" | "pending_review";
export type TxnOrigin = "manual" | "scanned" | "imported" | "recurring" | "ai_assisted";
export type BudgetType = "income" | "expense";
export type AccountKind = "banco" | "efectivo" | "tarjeta" | "otro";

/** Transacción real (fuente de verdad de lo ocurrido). */
export type Transaction = {
  id: string;
  kind: TxnKind;
  description: string | null;
  merchantOrSource: string | null;
  amount: number;
  currency: string;
  occurredOn: string; // YYYY-MM-DD
  categoryId: string | null;
  accountId: string | null;
  accountLabel: string | null;
  status: TxnStatus;
  origin: TxnOrigin;
  confirmedByUser: boolean;
};

/** Ítem de presupuesto, scopeado por mes. */
export type BudgetItem = {
  id: string;
  type: BudgetType;
  categoryId: string | null;
  name: string;
  amount: number;
  currency: string;
  frequency: Frequency;
  periodMonth: number;
  periodYear: number;
};

export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  currency: string;
  isDefault: boolean;
};

/** Periodo de consulta (un mes natural por defecto). */
export type Period = {
  month: number; // 1-12
  year: number;
  from: string; // YYYY-MM-DD (inclusive)
  to: string; // YYYY-MM-DD (inclusive)
  label: string; // "jun 2026"
};

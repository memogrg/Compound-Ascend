import "server-only";

/** Servicio del Módulo 3 (respeta RLS). */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { getBaseSummary, getPrimaryCurrency } from "@/modules/financial-base/services/base-service";
import { buildControlDiagnosis } from "@/modules/control/engine/priority-engine";
import { convertCurrency } from "@/lib/fx";
import { getFxRates } from "@/lib/market-data/fx-rates";
import type { GoalInput, DebtInputForm } from "@/modules/control/schemas";
import type {
  SavingsGoal,
  Debt,
  ControlDiagnosis,
  GoalStatus,
  GoalPriority,
  DebtClassification,
} from "@/modules/control/types";
import type { SavingsGoalRow, DebtRow } from "@/lib/supabase/database.types";

function rowToGoal(r: SavingsGoalRow): SavingsGoal {
  return {
    id: r.id,
    name: r.name,
    goalType: r.goal_type,
    targetAmount: Number(r.target_amount),
    currentAmount: Number(r.current_amount),
    monthlyContribution: Number(r.monthly_contribution),
    currency: r.currency,
    targetDate: r.target_date,
    priority: (r.priority ?? undefined) as GoalPriority | undefined ?? null,
    status: (r.status ?? "revisar") as GoalStatus,
  };
}

function rowToDebt(r: DebtRow): Debt {
  return {
    id: r.id,
    name: r.name,
    debtType: r.debt_type,
    balance: Number(r.balance),
    minPayment: Number(r.min_payment ?? 0),
    currentPayment: Number(r.current_payment ?? 0),
    apr: r.apr === null ? null : Number(r.apr),
    currency: r.currency,
    isCurrent: r.is_current ?? true,
    delinquency: (r.delinquency ?? undefined) as Debt["delinquency"],
    stress: r.stress,
    classification: (r.classification ?? undefined) as DebtClassification | undefined ?? null,
  };
}

export async function listGoals(): Promise<SavingsGoal[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("savings_goals")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return (data ?? []).map(rowToGoal);
}

export async function listDebts(): Promise<Debt[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("debts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  return (data ?? []).map(rowToDebt);
}

export async function createGoal(input: GoalInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from("savings_goals").insert({
    user_id: user.id,
    name: input.name,
    goal_type: input.goalType ?? null,
    target_amount: input.targetAmount,
    current_amount: input.currentAmount,
    monthly_contribution: input.monthlyContribution,
    currency: input.currency,
    target_date: input.targetDate ?? null,
    priority: input.priority ?? null,
    status: "revisar",
  });
}

export async function createDebt(input: DebtInputForm): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from("debts").insert({
    user_id: user.id,
    name: input.name,
    debt_type: input.debtType ?? null,
    balance: input.balance,
    min_payment: input.minPayment,
    current_payment: input.currentPayment,
    apr: input.apr ?? null,
    currency: input.currency,
    delinquency: input.delinquency ?? "no",
    stress: input.stress ?? null,
    is_current: true,
  });
}

export async function updateGoal(id: string, input: GoalInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("savings_goals")
    .update({
      name: input.name,
      goal_type: input.goalType ?? null,
      target_amount: input.targetAmount,
      current_amount: input.currentAmount,
      monthly_contribution: input.monthlyContribution,
      currency: input.currency,
      target_date: input.targetDate ?? null,
      priority: input.priority ?? null,
    })
    .eq("id", id)
    .eq("user_id", user.id);
}

export async function updateDebt(id: string, input: DebtInputForm): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("debts")
    .update({
      name: input.name,
      debt_type: input.debtType ?? null,
      balance: input.balance,
      min_payment: input.minPayment,
      current_payment: input.currentPayment,
      apr: input.apr ?? null,
      currency: input.currency,
      delinquency: input.delinquency ?? "no",
      stress: input.stress ?? null,
    })
    .eq("id", id)
    .eq("user_id", user.id);
}

export async function deleteGoal(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from("savings_goals").delete().eq("id", id).eq("user_id", user.id);
}

export async function deleteDebt(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase.from("debts").delete().eq("id", id).eq("user_id", user.id);
}

async function getDiscipline(userId: string): Promise<number | undefined> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("behavior_profiles")
    .select("discipline")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.discipline ?? undefined;
}

export type ControlSummary = {
  diagnosis: ControlDiagnosis;
  goals: SavingsGoal[];
  debts: Debt[];
  freeCashflow: number;
  currency: string;
};

/** Carga todo y calcula el diagnóstico de control. */
export async function getControlSummary(): Promise<ControlSummary> {
  const user = await requireUser();
  const [goals, debts, base, currency, discipline, rates] = await Promise.all([
    listGoals(),
    listDebts(),
    getBaseSummary(),
    getPrimaryCurrency(),
    getDiscipline(user.id),
    getFxRates(),
  ]);

  const hasEmergencyFund = goals.some(
    (g) => /emergencia|paz/i.test(g.name) && g.currentAmount > 0,
  );
  const stress = debts.length
    ? Math.round(debts.reduce((s, d) => s + (d.stress ?? 5), 0) / debts.length)
    : undefined;

  // El diagnóstico agrega objetivos y deudas: normalizamos sus montos a la
  // moneda principal antes de calcular (los montos por ítem se muestran en su
  // moneda original en el dashboard).
  const goalsForEngine = goals.map((g) => ({
    ...g,
    targetAmount: convertCurrency(g.targetAmount, g.currency, currency, rates),
    currentAmount: convertCurrency(g.currentAmount, g.currency, currency, rates),
    monthlyContribution: convertCurrency(g.monthlyContribution, g.currency, currency, rates),
  }));
  const debtsForEngine = debts.map((d) => ({
    ...d,
    balance: convertCurrency(d.balance, d.currency, currency, rates),
    minPayment: convertCurrency(d.minPayment, d.currency, currency, rates),
    currentPayment: convertCurrency(d.currentPayment, d.currency, currency, rates),
  }));

  const diagnosis = buildControlDiagnosis(
    goalsForEngine,
    debtsForEngine,
    { freeCashflow: base.indicators.freeCashflow, hasEmergencyFund, discipline, stress },
    currency,
  );

  return { diagnosis, goals, debts, freeCashflow: base.indicators.freeCashflow, currency };
}

/** Resumen de control de demostración (no toca la BD). */
export function buildDemoControlSummary(): ControlSummary {
  const currency = "CRC";
  const goals: SavingsGoal[] = [
    {
      id: "g1",
      name: "Fondo de emergencia",
      goalType: "seguridad",
      targetAmount: 3_000_000,
      currentAmount: 900_000,
      monthlyContribution: 90_000,
      currency,
      targetDate: futureISO(18),
      priority: "alta",
      status: "revisar",
    },
    {
      id: "g2",
      name: "Viaje a Europa",
      targetAmount: 2_400_000,
      currentAmount: 300_000,
      monthlyContribution: 60_000,
      currency,
      targetDate: futureISO(10),
      priority: "baja",
      status: "revisar",
    },
  ];
  const debts: Debt[] = [
    {
      id: "d1",
      name: "Tarjeta de crédito",
      balance: 1_400_000,
      minPayment: 70_000,
      currentPayment: 70_000,
      apr: 38,
      currency,
      isCurrent: true,
      delinquency: "no",
      stress: 7,
      classification: "critica",
    },
    {
      id: "d2",
      name: "Préstamo personal",
      balance: 2_200_000,
      minPayment: 95_000,
      currentPayment: 95_000,
      apr: 18,
      currency,
      isCurrent: true,
      delinquency: "no",
      stress: 4,
      classification: "controlada",
    },
  ];
  const diagnosis = buildControlDiagnosis(
    goals,
    debts,
    { freeCashflow: 175_000, hasEmergencyFund: true, discipline: 6, stress: 6 },
    currency,
  );
  return { diagnosis, goals, debts, freeCashflow: 175_000, currency };
}

function futureISO(monthsAhead: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + monthsAhead);
  return d.toISOString().slice(0, 10);
}

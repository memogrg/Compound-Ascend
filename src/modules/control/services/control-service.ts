import "server-only";

/** Servicio del Módulo 3 (respeta RLS). */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { getBaseSummary, getDisplayCurrency } from "@/modules/financial-base/services/base-service";
import { buildControlDiagnosis } from "@/modules/control/engine/priority-engine";
import { convertCurrency } from "@/lib/fx";
import { getFxRates } from "@/lib/market-data/fx-rates";
import type { GoalInput, DebtInputForm, DebtPaymentInput } from "@/modules/control/schemas";
import type {
  SavingsGoal,
  Debt,
  DebtPayment,
  ControlDiagnosis,
  GoalStatus,
  GoalPriority,
  DebtClassification,
  DebtRateType,
  DebtRateIndex,
  ExtraMode,
} from "@/modules/control/types";
import type { SavingsGoalRow, DebtRow, DebtPaymentRow } from "@/lib/supabase/database.types";

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
    originalAmount: r.original_amount === null ? null : Number(r.original_amount),
    rateType: (r.rate_type ?? null) as DebtRateType | null,
    rateIndex: (r.rate_index ?? null) as DebtRateIndex | null,
    rateSpread: r.rate_spread === null ? null : Number(r.rate_spread),
    termMonths: r.term_months,
    startDate: r.start_date,
    extraMonthly: r.extra_monthly === null ? null : Number(r.extra_monthly),
    insurance: r.insurance === null ? null : Number(r.insurance),
    notes: r.notes,
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

/** Campos de deuda compartidos por insert/update (incluye amortización). */
function debtColumns(input: DebtInputForm) {
  return {
    name: input.name,
    debt_type: input.debtType ?? null,
    balance: input.balance,
    min_payment: input.minPayment,
    current_payment: input.currentPayment,
    apr: input.apr ?? null,
    currency: input.currency,
    delinquency: input.delinquency ?? "no",
    stress: input.stress ?? null,
    original_amount: input.originalAmount ?? null,
    rate_type: input.rateType ?? null,
    rate_index: input.rateIndex ?? null,
    rate_spread: input.rateSpread ?? null,
    term_months: input.termMonths ?? null,
    start_date: input.startDate ?? null,
    extra_monthly: input.extraMonthly ?? null,
    insurance: input.insurance ?? null,
    notes: input.notes ?? null,
  };
}

export async function createDebt(input: DebtInputForm): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("debts")
    .insert({ user_id: user.id, is_current: true, ...debtColumns(input) });
  if (error) throw new Error(error.message);
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
  const { error } = await supabase
    .from("debts")
    .update(debtColumns(input))
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
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

// ── Deuda individual y pagos (fuente de la verdad: debt_payments) ──

function rowToDebtPayment(r: DebtPaymentRow): DebtPayment {
  return {
    id: r.id,
    debtId: r.debt_id,
    paymentDate: r.occurred_on,
    amount: Number(r.amount),
    extraAmount: Number(r.extra_amount ?? 0),
    extraMode: (r.extra_mode ?? null) as ExtraMode | null,
  };
}

export async function getDebt(id: string): Promise<Debt | null> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("debts")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToDebt(data) : null;
}

export async function listDebtPayments(debtId: string): Promise<DebtPayment[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("debt_payments")
    .select("*")
    .eq("debt_id", debtId)
    .eq("user_id", user.id)
    .order("occurred_on", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToDebtPayment);
}

/** Registra un pago reportado. Si el extra es modo 'cuota', baja la cuota. */
export async function addDebtPayment(input: DebtPaymentInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("debt_payments").insert({
    user_id: user.id,
    debt_id: input.debtId,
    occurred_on: input.paymentDate,
    amount: input.amount,
    extra_amount: input.extraAmount,
    extra_mode: input.extraMode ?? null,
  });
  if (error) throw new Error(error.message);

  // Modo 'cuota': el extra baja la cuota futura → actualiza current_payment.
  if (input.extraAmount > 0 && input.extraMode === "cuota") {
    const debt = await getDebt(input.debtId);
    if (debt) {
      const { applyExtraDecision } = await import("@/modules/control/engine/amortization");
      const decision = applyExtraDecision(
        {
          balance: debt.balance,
          apr: debt.apr ?? 0,
          termMonths: debt.termMonths,
          monthlyPayment: debt.currentPayment > 0 ? debt.currentPayment : null,
          insurance: debt.insurance,
        },
        input.extraAmount,
        "cuota",
      );
      const { error: upErr } = await supabase
        .from("debts")
        .update({ current_payment: decision.monthlyPayment, balance: Math.max(0, debt.balance - input.extraAmount) })
        .eq("id", input.debtId)
        .eq("user_id", user.id);
      if (upErr) throw new Error(upErr.message);
    }
  }
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
    getDisplayCurrency(),
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

import "server-only";

/** Servicio del Módulo 3 (respeta RLS). */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { getActiveHouseholdId } from "@/lib/household/active";
import { getBaseSummary, getDisplayCurrency } from "@/modules/financial-base";
import {
  registerLinkedTransaction,
  deleteLinkedTransaction,
  getSystemCategoryId,
} from "@/modules/financial-base";
import {
  debtPaymentToTxn,
  goalContributionToTxn,
  goalWithdrawalToTxn,
} from "@/modules/financial-base";
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
    bank: r.bank,
    payDay: r.pay_day,
    introFixedMonths: r.intro_fixed_months,
    introApr: r.intro_apr === null ? null : Number(r.intro_apr),
    lastRemindedOn: r.last_reminded_on,
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
  const household_id = await getActiveHouseholdId(supabase, user.id);
  await supabase.from("savings_goals").insert({
    user_id: user.id,
    household_id,
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
    bank: input.bank ?? null,
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
    intro_fixed_months: input.introFixedMonths ?? null,
    intro_apr: input.introApr ?? null,
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
  const household_id = await getActiveHouseholdId(supabase, user.id);
  const { error } = await supabase
    .from("debts")
    .insert({ user_id: user.id, household_id, is_current: true, ...debtColumns(input) });
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

function rowToDebtPayment(
  r: DebtPaymentRow & { txn?: { source: string | null } | null },
): DebtPayment {
  return {
    id: r.id,
    debtId: r.debt_id,
    paymentDate: r.occurred_on,
    amount: Number(r.amount),
    extraAmount: Number(r.extra_amount ?? 0),
    extraMode: (r.extra_mode ?? null) as ExtraMode | null,
    principal: r.principal == null ? null : Number(r.principal),
    interest: r.interest == null ? null : Number(r.interest),
    viaSource: r.txn?.source ?? null,
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
  // Incluye TODOS los pagos sin importar su origen (Control, composer, chat,
  // conciliación). El embed por transaction_id trae el source de la
  // transacción vinculada para mostrar el origen ("vía Gastos"/"vía Chat").
  const { data, error } = await supabase
    .from("debt_payments")
    .select("*, txn:transactions!debt_payments_transaction_id_fkey(source)")
    .eq("debt_id", debtId)
    .eq("user_id", user.id)
    .order("occurred_on", { ascending: true });
  if (error) throw new Error(error.message);
  // Cast: los tipos de DB hechos a mano no describen relaciones; el FK
  // debt_payments_transaction_id_fkey existe (migración 0021).
  return ((data ?? []) as unknown as (DebtPaymentRow & { txn?: { source: string | null } | null })[]).map(
    rowToDebtPayment,
  );
}

/** Fechas de pago reportadas en el mes calendario actual, agrupadas por deuda. */
export async function listDebtPaymentDatesThisMonth(): Promise<Record<string, string[]>> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const monthStart = `${new Date().toISOString().slice(0, 8)}01`; // yyyy-mm-01
  const { data } = await supabase
    .from("debt_payments")
    .select("debt_id,occurred_on")
    .eq("user_id", user.id)
    .gte("occurred_on", monthStart);
  const out: Record<string, string[]> = {};
  for (const p of data ?? []) (out[p.debt_id] ??= []).push(p.occurred_on);
  return out;
}

/**
 * Registra un pago reportado. Si el extra es modo 'cuota', baja la cuota.
 * Fase 1: el pago pasa por el orquestador — nace también como transacción
 * vinculada (gasto, linked_kind='debt') y debt_payments guarda su id.
 */
export async function addDebtPayment(input: DebtPaymentInput): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const debt = await getDebt(input.debtId);
  if (!debt) throw new Error("Deuda no encontrada");
  const total = input.amount + input.extraAmount;
  let txnId: string | null = null;
  if (total > 0) {
    txnId = await registerLinkedTransaction(
      debtPaymentToTxn({
        debtId: debt.id,
        debtName: debt.name,
        currency: debt.currency,
        paymentDate: input.paymentDate,
        amount: input.amount,
        extraAmount: input.extraAmount,
        categoryId: await getSystemCategoryId("deudas"),
      }),
    );
  }

  // household: cubre el hueco del sub-PR household de main (no tocó este insert).
  const household_id = await getActiveHouseholdId(supabase, user.id);
  const { error } = await supabase.from("debt_payments").insert({
    user_id: user.id,
    household_id,
    debt_id: input.debtId,
    occurred_on: input.paymentDate,
    amount: input.amount,
    extra_amount: input.extraAmount,
    extra_mode: input.extraMode ?? null,
    transaction_id: txnId,
  });
  if (error) {
    // Compensación: sin registro especializado no debe quedar la transacción.
    if (txnId) await deleteLinkedTransaction(txnId);
    throw new Error(error.message);
  }

  // Modo 'cuota': el extra baja la cuota futura → actualiza current_payment.
  if (input.extraAmount > 0 && input.extraMode === "cuota") {
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

/**
 * Aporte a una meta de ahorro (Fase 1 · orquestador): crea la transacción
 * vinculada (gasto, linked_kind='goal') y sube current_amount de la meta.
 * No existe ledger propio de aportes — la transacción ES el histórico.
 */
export async function addGoalContribution(input: {
  goalId: string;
  amount: number;
  contributionDate: string;
}): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: goalRow, error: gErr } = await supabase
    .from("savings_goals")
    .select("id,name,currency,current_amount")
    .eq("id", input.goalId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (gErr) throw new Error(gErr.message);
  if (!goalRow) throw new Error("Meta no encontrada");

  const txnId = await registerLinkedTransaction(
    goalContributionToTxn({
      goalId: goalRow.id,
      goalName: goalRow.name,
      currency: goalRow.currency,
      contributionDate: input.contributionDate,
      amount: input.amount,
      // Sin categoría fija: el tipo de meta varía; linked_kind='goal' basta.
      categoryId: null,
    }),
  );

  const { error } = await supabase
    .from("savings_goals")
    .update({ current_amount: Number(goalRow.current_amount) + input.amount })
    .eq("id", input.goalId)
    .eq("user_id", user.id);
  if (error) {
    await deleteLinkedTransaction(txnId);
    throw new Error(error.message);
  }
}

/**
 * Retiro de una meta (Fase 4 · flujos inversos): crea el ingreso vinculado
 * (linked_kind='goal') y baja current_amount (sin pasar de 0).
 */
export async function withdrawFromGoal(input: {
  goalId: string;
  amount: number;
  withdrawalDate: string;
  note?: string;
}): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: goalRow, error: gErr } = await supabase
    .from("savings_goals")
    .select("id,name,currency,current_amount")
    .eq("id", input.goalId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (gErr) throw new Error(gErr.message);
  if (!goalRow) throw new Error("Meta no encontrada");
  if (input.amount > Number(goalRow.current_amount)) {
    throw new Error("No puedes retirar más de lo acumulado en la meta.");
  }

  const txnId = await registerLinkedTransaction(
    goalWithdrawalToTxn({
      goalId: goalRow.id,
      goalName: goalRow.name,
      currency: goalRow.currency,
      withdrawalDate: input.withdrawalDate,
      amount: input.amount,
      note: input.note,
    }),
  );

  const { error } = await supabase
    .from("savings_goals")
    .update({ current_amount: Math.max(0, Number(goalRow.current_amount) - input.amount) })
    .eq("id", input.goalId)
    .eq("user_id", user.id);
  if (error) {
    await deleteLinkedTransaction(txnId);
    throw new Error(error.message);
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
  /** Valores actuales de los índices (prime/tbp/tri) para el form de deuda. */
  indexRates: Record<string, number>;
};

/** Carga todo y calcula el diagnóstico de control. */
export async function getControlSummary(): Promise<ControlSummary> {
  const user = await requireUser();
  const { getIndexRates } = await import("@/modules/control/services/index-rates");
  const [goals, debts, base, currency, discipline, rates, indexRates] = await Promise.all([
    listGoals(),
    listDebts(),
    getBaseSummary(),
    getDisplayCurrency(),
    getDiscipline(user.id),
    getFxRates(),
    getIndexRates(),
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

  return { diagnosis, goals, debts, freeCashflow: base.indicators.freeCashflow, currency, indexRates };
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
  return { diagnosis, goals, debts, freeCashflow: 175_000, currency, indexRates: {} };
}

function futureISO(monthsAhead: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + monthsAhead);
  return d.toISOString().slice(0, 10);
}

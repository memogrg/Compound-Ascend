import "server-only";

/** Servicio del Módulo 3 (respeta RLS). */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { getActiveHouseholdId, householdMemberIds, existsInHousehold, HOUSEHOLD_READ_ONLY_MESSAGE, householdWriteScope } from "@/lib/household/active";
import { getBaseSummary, getDisplayCurrency } from "@/modules/financial-base";
import {
  registerLinkedTransaction,
  buildLinkedTransactionRow,
  deleteLinkedTransaction,
  getSystemCategoryId,
} from "@/modules/financial-base";
import {
  debtPaymentToTxn,
  goalContributionToTxn,
  goalWithdrawalToTxn,
  goalSpendToTxn,
} from "@/modules/financial-base";
import { buildControlDiagnosis } from "@/modules/control/engine/priority-engine";
import { deriveRecurrenceFields, type Recurrence } from "@/modules/control/engine/recurrence";
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
  PaymentKind,
} from "@/modules/control/types";
import type { SavingsGoalRow, DebtRow, DebtPaymentRow } from "@/lib/supabase/database.types";

function rowToGoal(r: SavingsGoalRow): SavingsGoal {
  return {
    id: r.id,
    name: r.name,
    goalType: r.goal_type,
    kind: (r.kind ?? "meta") as SavingsGoal["kind"],
    // Un sobre no tiene meta (target null en BD): se expone 0 y el progreso se
    // guarda con `kind`/`targetAmount > 0`.
    targetAmount: r.target_amount == null ? 0 : Number(r.target_amount),
    currentAmount: Number(r.current_amount),
    monthlyContribution: Number(r.monthly_contribution),
    currency: r.currency,
    targetDate: r.target_date,
    priority: r.priority as GoalPriority | null,
    status: (r.status ?? "revisar") as GoalStatus,
    recurrence: (r.recurrence ?? "ninguna") as Recurrence,
    periodAmount: r.period_amount === null ? null : Number(r.period_amount),
    nextResetOn: r.next_reset_on,
    defaultCategoryId: r.default_category_id,
    policyId: r.policy_id,
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
    classification: r.classification as DebtClassification | null,
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
  const memberIds = await householdMemberIds(supabase, user.id);
  const { data } = await supabase
    .from("savings_goals")
    .select("*")
    .in("user_id", memberIds)
    .order("created_at", { ascending: false });
  return (data ?? []).map(rowToGoal);
}

export async function listDebts(): Promise<Debt[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const memberIds = await householdMemberIds(supabase, user.id);
  const { data } = await supabase
    .from("debts")
    .select("*")
    .in("user_id", memberIds)
    .order("created_at", { ascending: false });
  return (data ?? []).map(rowToDebt);
}

/** Crea una meta/sobre y devuelve su id (el id sirve para un aporte inicial). */
export async function createGoal(input: GoalInput): Promise<string> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const household_id = await getActiveHouseholdId(supabase, user.id);
  // Un sobre es acumulador: sin meta ni recurrencia.
  const isSobre = input.kind === "sobre";
  // Categoría (frasco): la llevan Meta y Sobre; solo Defensa queda sin categoría.
  const isDefensa = (input.goalType ?? "").startsWith("defensa:");
  const targetAmount = isSobre ? null : (input.targetAmount ?? null);
  const recurrence = isSobre ? "ninguna" : input.recurrence;
  const { periodAmount, nextResetOn } = deriveRecurrenceFields({
    recurrence,
    targetAmount: targetAmount ?? 0,
    periodAmount: input.periodAmount,
    targetDate: input.targetDate,
    todayISO: todayISO(),
  });
  const { data, error } = await supabase
    .from("savings_goals")
    .insert({
      user_id: user.id,
      household_id,
      created_by: user.id,
      last_edited_by: user.id,
      name: input.name,
      goal_type: input.goalType ?? null,
      kind: input.kind,
      target_amount: targetAmount,
      current_amount: input.currentAmount,
      monthly_contribution: input.monthlyContribution,
      currency: input.currency,
      target_date: input.targetDate ?? null,
      priority: input.priority ?? null,
      status: "revisar",
      recurrence,
      period_amount: periodAmount,
      next_reset_on: nextResetOn,
      default_category_id: isDefensa ? null : (input.defaultCategoryId ?? null),
      policy_id: input.policyId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data!.id;
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
  const scope = await householdWriteScope(supabase, user.id);

  // Recurrencia: no re-anclar el next_reset_on que ya avanzó el cron en una
  // edición normal. Solo se re-deriva si la cadencia cambió o aún no había una.
  const { data: existing } = await supabase
    .from("savings_goals")
    .select("recurrence,next_reset_on")
    .eq("id", id)
    .in("user_id", scope)
    .maybeSingle();
  // Un sobre no tiene meta ni recurrencia.
  const isSobre = input.kind === "sobre";
  // Categoría (frasco): la llevan Meta y Sobre; solo Defensa queda sin categoría.
  const isDefensa = (input.goalType ?? "").startsWith("defensa:");
  const targetAmount = isSobre ? null : (input.targetAmount ?? null);
  const recurrence = isSobre ? "ninguna" : input.recurrence;
  const derived = deriveRecurrenceFields({
    recurrence,
    targetAmount: targetAmount ?? 0,
    periodAmount: input.periodAmount,
    targetDate: input.targetDate,
    todayISO: todayISO(),
  });
  const keepSchedule =
    recurrence !== "ninguna" &&
    existing?.recurrence === recurrence &&
    existing?.next_reset_on != null;
  const nextResetOn = keepSchedule ? existing!.next_reset_on : derived.nextResetOn;

  await supabase
    .from("savings_goals")
    .update({ last_edited_by: user.id,
      name: input.name,
      goal_type: input.goalType ?? null,
      kind: input.kind,
      target_amount: targetAmount,
      current_amount: input.currentAmount,
      monthly_contribution: input.monthlyContribution,
      currency: input.currency,
      target_date: input.targetDate ?? null,
      priority: input.priority ?? null,
      recurrence,
      period_amount: derived.periodAmount,
      next_reset_on: nextResetOn,
      default_category_id: isDefensa ? null : (input.defaultCategoryId ?? null),
      policy_id: input.policyId ?? null,
    })
    .eq("id", id)
    .in("user_id", scope);
}

export async function updateDebt(id: string, input: DebtInputForm): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);
  const { error } = await supabase
    .from("debts")
    .update(debtColumns(input))
    .eq("id", id)
    .in("user_id", scope);
  if (error) throw new Error(error.message);
}

export async function deleteGoal(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);
  await supabase.from("savings_goals").delete().eq("id", id).in("user_id", scope);
}

export async function deleteDebt(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);
  await supabase.from("debts").delete().eq("id", id).in("user_id", scope);
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
    kind: (r.kind ?? "ordinario") as PaymentKind,
    principal: r.principal == null ? null : Number(r.principal),
    interest: r.interest == null ? null : Number(r.interest),
    viaSource: r.txn?.source ?? null,
  };
}

export async function getDebt(id: string): Promise<Debt | null> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  // Lectura de DISPLAY: alcance de hogar (todos los miembros la ven, igual que
  // #425). La autorización de ESCRITURA no vive acá — la da householdWriteScope
  // + RLS en la función que muta (addDebtPayment, updateDebt, deleteDebt).
  const memberIds = await householdMemberIds(supabase, user.id);
  const { data, error } = await supabase
    .from("debts")
    .select("*")
    .eq("id", id)
    .in("user_id", memberIds)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToDebt(data) : null;
}

export async function listDebtPayments(debtId: string): Promise<DebtPayment[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const memberIds = await householdMemberIds(supabase, user.id);
  // Incluye TODOS los pagos sin importar su origen (Control, composer, chat,
  // conciliación). El embed por transaction_id trae el source de la
  // transacción vinculada para mostrar el origen ("vía Gastos"/"vía Chat").
  const { data, error } = await supabase
    .from("debt_payments")
    .select("*, txn:transactions!debt_payments_transaction_id_fkey(source)")
    .eq("debt_id", debtId)
    .in("user_id", memberIds)
    .order("occurred_on", { ascending: true });
  if (error) throw new Error(error.message);
  // Cast: los tipos de DB hechos a mano no describen relaciones; el FK
  // debt_payments_transaction_id_fkey existe (migración 0021).
  return (
    (data ?? []) as unknown as (DebtPaymentRow & { txn?: { source: string | null } | null })[]
  ).map(rowToDebtPayment);
}

/** Fechas de pago reportadas en el mes calendario actual, agrupadas por deuda. */
export async function listDebtPaymentDatesThisMonth(): Promise<Record<string, string[]>> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const memberIds = await householdMemberIds(supabase, user.id);
  const monthStart = `${new Date().toISOString().slice(0, 8)}01`; // yyyy-mm-01
  const { data } = await supabase
    .from("debt_payments")
    .select("debt_id,occurred_on")
    .in("user_id", memberIds)
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
  const scope = await householdWriteScope(supabase, user.id);

  const debt = await getDebt(input.debtId);
  if (!debt) throw new Error("Deuda no encontrada");
  // Autorización de escritura: registrar un pago MODIFICA la deuda del hogar.
  // Un editor puede sobre cualquier deuda del hogar; un no-editor solo sobre la
  // suya. Si la deuda existe pero no está en mi alcance de escritura → mensaje.
  const { data: writable } = await supabase
    .from("debts")
    .select("id")
    .eq("id", input.debtId)
    .in("user_id", scope)
    .maybeSingle();
  if (!writable) throw new Error(HOUSEHOLD_READ_ONLY_MESSAGE);

  // El importe se guarda en la moneda de la DEUDA: `debt_payments` no tiene columna de
  // moneda, así que su amount es implícitamente la de la deuda, y la transacción se
  // etiqueta con esa misma. Si quien llama dice venir en otra, es que el número se
  // calculó contra una referencia distinta y guardarlo corrompería las dos cosas a la
  // vez (el gasto del mes y la amortización). Mejor fallar que guardar callado.
  if (input.currency && input.currency !== debt.currency) {
    throw new Error(
      `El pago viene en ${input.currency} pero la deuda está en ${debt.currency}.`,
    );
  }
  const total = input.amount + input.extraAmount;

  // household: cubre el hueco del sub-PR household de main (no tocó este insert).
  const household_id = await getActiveHouseholdId(supabase, user.id);
  const paymentRow = {
    user_id: user.id,
    household_id,
    created_by: user.id,
    last_edited_by: user.id,
    debt_id: input.debtId,
    occurred_on: input.paymentDate,
    amount: input.amount,
    extra_amount: input.extraAmount,
    extra_mode: input.extraMode ?? null,
    kind: input.kind,
  };

  if (total > 0) {
    // Atómico (RPC): el gasto vinculado y el debt_payment nacen en UNA sola
    // transacción de BD. La lógica del gasto (reglas, categoría, household) se
    // resuelve en TS y se pasa ya construida a la RPC.
    const txnRow = await buildLinkedTransactionRow(
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
    const { error } = await supabase.rpc("record_debt_payment", {
      p_txn: txnRow,
      p_payment: paymentRow,
    });
    if (error) throw new Error(error.message);
  } else {
    // Pago sin monto (caso raro): solo el registro, sin transacción vinculada.
    const { error } = await supabase
      .from("debt_payments")
      .insert({ ...paymentRow, transaction_id: null });
    if (error) throw new Error(error.message);
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
      .update({ last_edited_by: user.id,
        current_payment: decision.monthlyPayment,
        balance: Math.max(0, debt.balance - input.extraAmount),
      })
      .eq("id", input.debtId)
      .in("user_id", scope);
    if (upErr) throw new Error(upErr.message);
  }
}

/**
 * Edita un pago reportado: actualiza el `debt_payment` y mantiene la
 * transacción vinculada (gasto del mes) en sincronía (monto y fecha). El saldo
 * y la proyección se recalculan en `getDebtDetail` desde los pagos, así que no
 * hace falta tocar la deuda aquí.
 */
export async function updateDebtPayment(
  paymentId: string,
  input: DebtPaymentInput,
): Promise<void> {
  await requireUser();
  const supabase = await createSupabaseServerClient();

  // Atómico (RPC): el pago y su transacción vinculada (monto = cuota + extra,
  // fecha) se actualizan en UNA sola transacción. Antes, si el 2º update fallaba
  // el 1º no se revertía (pago editado con gasto viejo).
  const { error } = await supabase.rpc("update_debt_payment", {
    p_payment_id: paymentId,
    p_occurred_on: input.paymentDate,
    p_amount: input.amount,
    p_extra_amount: input.extraAmount,
    p_extra_mode: input.extraMode ?? null,
  });
  if (error) throw new Error(error.message);
}

/**
 * Elimina un pago reportado y revierte su transacción vinculada (el gasto del
 * mes desaparece). El saldo/proyección se recalculan desde los pagos restantes.
 */
export async function deleteDebtPayment(paymentId: string): Promise<void> {
  await requireUser();
  const supabase = await createSupabaseServerClient();

  // Atómico (RPC): elimina el pago y su transacción vinculada en una sola
  // transacción (antes eran 2 borrados secuenciales sin atomicidad).
  const { error } = await supabase.rpc("delete_debt_payment", { p_payment_id: paymentId });
  if (error) throw new Error(error.message);
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
  const scope = await householdWriteScope(supabase, user.id);

  const { data: goalRow, error: gErr } = await supabase
    .from("savings_goals")
    .select("id,name,currency,current_amount")
    .eq("id", input.goalId)
    .in("user_id", scope)
    .maybeSingle();
  if (gErr) throw new Error(gErr.message);
  if (!goalRow) {
    // Distingue "no existe" de "es de otro miembro del hogar": con el
    // alcance de hogar la fila SE VE en pantalla, así que un "no
    // encontrada" pelado parecería un bug.
    if (await existsInHousehold(supabase, user.id, "savings_goals", input.goalId)) {
      throw new Error(HOUSEHOLD_READ_ONLY_MESSAGE);
    }
    throw new Error("Meta no encontrada");
  }

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
    .update({ last_edited_by: user.id, current_amount: Number(goalRow.current_amount) + input.amount })
    .eq("id", input.goalId)
    .in("user_id", scope);
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
  const scope = await householdWriteScope(supabase, user.id);

  const { data: goalRow, error: gErr } = await supabase
    .from("savings_goals")
    .select("id,name,currency,current_amount")
    .eq("id", input.goalId)
    .in("user_id", scope)
    .maybeSingle();
  if (gErr) throw new Error(gErr.message);
  if (!goalRow) {
    // Distingue "no existe" de "es de otro miembro del hogar": con el
    // alcance de hogar la fila SE VE en pantalla, así que un "no
    // encontrada" pelado parecería un bug.
    if (await existsInHousehold(supabase, user.id, "savings_goals", input.goalId)) {
      throw new Error(HOUSEHOLD_READ_ONLY_MESSAGE);
    }
    throw new Error("Meta no encontrada");
  }
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
    .update({ last_edited_by: user.id, current_amount: Math.max(0, Number(goalRow.current_amount) - input.amount) })
    .eq("id", input.goalId)
    .in("user_id", scope);
  if (error) {
    await deleteLinkedTransaction(txnId);
    throw new Error(error.message);
  }
}

/**
 * Gastar del frasco (Delta A): consumir parte de una meta en una compra real.
 * Crea un gasto categorizado vinculado (linked_kind='goal') OFF-BUDGET —
 * `counts_in_budget=false`, así NO cuenta en el gasto del mes ni en el free
 * cashflow (ya se contó al aportar) — y baja `current_amount` Y `target_amount`
 * por el mismo monto (la brecha meta−acumulado se conserva). Rollback de la
 * transacción si el update de la meta falla.
 */
export async function spendFromGoal(input: {
  goalId: string;
  amount: number;
  spendDate: string;
  categoryId: string | null;
  note?: string;
}): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);

  const { data: goalRow, error: gErr } = await supabase
    .from("savings_goals")
    .select("id,name,currency,current_amount,target_amount,status")
    .eq("id", input.goalId)
    .in("user_id", scope)
    .maybeSingle();
  if (gErr) throw new Error(gErr.message);
  if (!goalRow) {
    // Distingue "no existe" de "es de otro miembro del hogar": con el
    // alcance de hogar la fila SE VE en pantalla, así que un "no
    // encontrada" pelado parecería un bug.
    if (await existsInHousehold(supabase, user.id, "savings_goals", input.goalId)) {
      throw new Error(HOUSEHOLD_READ_ONLY_MESSAGE);
    }
    throw new Error("Meta no encontrada");
  }
  if (input.amount <= 0) throw new Error("El monto debe ser mayor a 0.");
  if (input.amount > Number(goalRow.current_amount)) {
    throw new Error("No puedes gastar más de lo acumulado en la meta.");
  }

  const txnId = await registerLinkedTransaction(
    goalSpendToTxn({
      goalId: goalRow.id,
      goalName: goalRow.name,
      currency: goalRow.currency,
      spendDate: input.spendDate,
      amount: input.amount,
      categoryId: input.categoryId,
      note: input.note,
    }),
  );

  const nextCurrent = Math.max(0, Number(goalRow.current_amount) - input.amount);
  const nextTarget = Math.max(0, Number(goalRow.target_amount) - input.amount);
  const { error } = await supabase
    .from("savings_goals")
    .update({ last_edited_by: user.id, current_amount: nextCurrent, target_amount: nextTarget })
    .eq("id", input.goalId)
    .in("user_id", scope);
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
  /** Tasas FX en vivo para mostrar el equivalente al capturar en otra moneda. */
  fxRates: Record<string, number>;
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

  const hasEmergencyFund = goals.some((g) => /emergencia|paz/i.test(g.name) && g.currentAmount > 0);
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

  return {
    diagnosis,
    goals,
    debts,
    freeCashflow: base.indicators.freeCashflow,
    currency,
    indexRates,
    fxRates: rates,
  };
}

/** Resumen de control de demostración (no toca la BD). */
export function buildDemoControlSummary(): ControlSummary {
  const currency = "CRC";
  const goals: SavingsGoal[] = [
    {
      id: "g1",
      name: "Fondo de emergencia",
      goalType: "seguridad",
      kind: "meta",
      targetAmount: 3_000_000,
      currentAmount: 900_000,
      monthlyContribution: 90_000,
      currency,
      targetDate: futureISO(18),
      priority: "alta",
      status: "revisar",
      recurrence: "ninguna",
    },
    {
      id: "g2",
      name: "Viaje a Europa",
      kind: "meta",
      targetAmount: 2_400_000,
      currentAmount: 300_000,
      monthlyContribution: 60_000,
      currency,
      targetDate: futureISO(10),
      priority: "baja",
      status: "revisar",
      recurrence: "ninguna",
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
  return { diagnosis, goals, debts, freeCashflow: 175_000, currency, indexRates: {}, fxRates: {} };
}

function futureISO(monthsAhead: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + monthsAhead);
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

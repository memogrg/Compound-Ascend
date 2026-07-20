import "server-only";

/**
 * Orquestador de escritura (Fase 1 · interconexión de bloques).
 *
 * "Una transacción es el hecho único": cuando otro módulo registra un evento
 * de dinero (pago de deuda, dividendo, renta, aporte a meta), pasa por aquí
 * para que la transacción vinculada y el registro especializado nazcan en la
 * misma operación.
 *
 * Patrón: la transacción se crea primero (devuelve id); el caller escribe su
 * registro especializado con ese id. Si la escritura especializada falla, el
 * caller invoca el rollback compensatorio (deleteLinkedTransaction) y
 * propaga el error — así no quedan transacciones huérfanas.
 *
 * Dirección de dependencia: control/wealth → financial-base (nunca al revés),
 * igual que el resto del codebase.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { getActiveHouseholdId, householdWriteScope } from "@/lib/household/active";
import { logHouseholdDeletion } from "@/lib/household/activity-log";
import {
  createTransaction,
  buildTransactionRow,
  type TransactionInsert,
} from "@/modules/financial-base/services/transaction-service";
import { txnInputSchema } from "@/modules/financial-base/schemas";
import type { LinkedTxnInput } from "@/modules/financial-base/engine/linked";

/**
 * Crea la transacción vinculada y devuelve su id. Valida el input con el
 * mismo schema que el resto del módulo (defaults incluidos).
 */
export async function registerLinkedTransaction(input: LinkedTxnInput): Promise<string> {
  const parsed = txnInputSchema.parse(input);
  const { id } = await createTransaction(parsed);
  return id;
}

/**
 * Igual que `registerLinkedTransaction` pero NO inserta: valida el input y
 * resuelve la fila de la transacción. Para flujos atómicos donde una RPC
 * transaccional inserta la transacción y su ledger en una sola operación.
 */
export async function buildLinkedTransactionRow(
  input: LinkedTxnInput,
): Promise<TransactionInsert> {
  const parsed = txnInputSchema.parse(input);
  const { row } = await buildTransactionRow(parsed);
  return row;
}

/**
 * Propagación para transacciones vinculadas creadas DESDE el composer
 * (Fase 2): escribe el registro especializado mínimo para que el módulo
 * dueño vea el evento. Solo debt/goal — los flujos de wealth (dividendo,
 * renta) tienen su propio formulario y pasan por sus servicios.
 *
 * NO se usa en los flujos de control/wealth (Fase 1): ellos escriben su
 * ledger completo (extra, modos, income_sources) y llaman a
 * registerLinkedTransaction; propagar aquí también lo duplicaría.
 */
export async function propagateLinkedTransaction(args: {
  transactionId: string;
  kind: string;
  linkedKind: string;
  linkedId: string | null;
  amount: number;
  occurredOn: string;
}): Promise<void> {
  if (!args.linkedId || args.kind !== "gasto") return;
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);

  if (args.linkedKind === "debt") {
    // Desglose cuota vs abono extra (Fase 7): si el pago supera la cuota
    // vigente, el excedente amortiza capital directo. El split capital/interés
    // se estima con el engine de amortización (null si no hay tasa).
    const { data: debt, error: dErr } = await supabase
      .from("debts")
      .select("balance,apr,current_payment,min_payment")
      .eq("id", args.linkedId)
      .in("user_id", scope)
      .maybeSingle();
    if (dErr) throw new Error(dErr.message);
    if (!debt) throw new Error("La deuda vinculada ya no existe o no te pertenece.");

    const { estimatePaymentSplit } = await import("@/modules/control/engine/amortization");
    const cuota =
      Number(debt.current_payment) > 0
        ? Number(debt.current_payment)
        : Number(debt.min_payment ?? 0);
    const split = estimatePaymentSplit({
      totalPaid: args.amount,
      cuota,
      balance: Number(debt.balance),
      apr: debt.apr == null ? null : Number(debt.apr),
    });

    // household: el ledger especializado comparte hogar igual que la transacción.
    const household_id = await getActiveHouseholdId(supabase, user.id);
    const { error } = await supabase.from("debt_payments").insert({
      user_id: user.id,
      household_id,
      created_by: user.id,
      last_edited_by: user.id,
      debt_id: args.linkedId,
      occurred_on: args.occurredOn,
      amount: split.amount,
      extra_amount: split.extraAmount,
      extra_mode: null,
      principal: split.principal,
      interest: split.interest,
      transaction_id: args.transactionId,
    });
    if (error) throw new Error(error.message);
    return;
  }

  if (args.linkedKind === "goal") {
    const { data: goal, error: gErr } = await supabase
      .from("savings_goals")
      .select("current_amount")
      .eq("id", args.linkedId)
      .in("user_id", scope)
      .maybeSingle();
    if (gErr) throw new Error(gErr.message);
    if (!goal) throw new Error("Meta no encontrada");
    const { error } = await supabase
      .from("savings_goals")
      .update({ last_edited_by: user.id, current_amount: Number(goal.current_amount) + args.amount })
      .eq("id", args.linkedId)
      .in("user_id", scope);
    if (error) throw new Error(error.message);
  }
  // holding / policy / rental: sin propagación desde el composer (por ahora).
}

/**
 * Conciliación (Fase 6): vincula una transacción EXISTENTE a una entidad y
 * propaga el registro especializado (debt_payments / avance de meta). Si la
 * propagación falla, el vínculo se revierte — la transacción queda como
 * estaba. Solo aplica a transacciones aún sin vínculo.
 */
export async function linkExistingTransaction(args: {
  transactionId: string;
  linkedKind: "debt" | "goal" | "holding" | "policy" | "rental";
  linkedId: string;
}): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);

  const { data: txn, error: tErr } = await supabase
    .from("transactions")
    .select("id,kind,amount,occurred_on,linked_kind")
    .eq("id", args.transactionId)
    .in("user_id", scope)
    .maybeSingle();
  if (tErr) throw new Error(tErr.message);
  if (!txn) throw new Error("Transacción no encontrada");
  if ((txn.linked_kind ?? "none") !== "none") throw new Error("La transacción ya está vinculada.");

  // Fase 6.1: la entidad debe existir y ser del usuario antes de vincular.
  const { assertLinkableEntity } =
    await import("@/modules/financial-base/services/linkable-entities-service");
  await assertLinkableEntity(args.linkedKind, args.linkedId);

  const { error: upErr } = await supabase
    .from("transactions")
    .update({ last_edited_by: user.id, linked_kind: args.linkedKind, linked_id: args.linkedId })
    .eq("id", args.transactionId)
    .in("user_id", scope);
  if (upErr) throw new Error(upErr.message);

  try {
    await propagateLinkedTransaction({
      transactionId: args.transactionId,
      kind: txn.kind,
      linkedKind: args.linkedKind,
      linkedId: args.linkedId,
      amount: Number(txn.amount),
      occurredOn: txn.occurred_on,
    });
  } catch (err) {
    // Compensación: revierte el vínculo; la transacción no se toca más.
    await supabase
      .from("transactions")
      .update({ last_edited_by: user.id, linked_kind: "none", linked_id: null })
      .eq("id", args.transactionId)
      .in("user_id", scope);
    throw err;
  }
}

/** Rollback compensatorio: borra la transacción creada por el orquestador. */
export async function deleteLinkedTransaction(transactionId: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);
  await supabase.from("transactions").delete().eq("id", transactionId).in("user_id", scope);
  await logHouseholdDeletion(supabase, { userId: user.id, table: "transactions", rowId: transactionId });
}

/**
 * Reversión del ledger especializado al ELIMINAR una transacción vinculada
 * (integridad · Fase 1 · orquestador). Inversa de `propagateLinkedTransaction`:
 * deshace el efecto que el evento de dinero dejó en su módulo dueño para que no
 * queden registros huérfanos (un debt_payment sin su gasto, un current_amount
 * inflado, etc.).
 *
 *  - debt  → borra el `debt_payment` ligado (y su transacción) vía la RPC atómica
 *    `delete_debt_payment`. El saldo de la deuda se recalcula desde los pagos
 *    restantes, así que no hay que tocarlo a mano.
 *  - goal  → aplica el delta inverso a `savings_goals`:
 *      · APORTE (gasto budget-aware) lo había subido `current_amount` → se resta.
 *      · RETIRO (ingreso) lo había bajado `current_amount` → se suma.
 *      · GASTO del frasco (gasto OFF-BUDGET, `countsInBudget=false`) había bajado
 *        `current_amount` Y `target_amount` → se restauran AMBOS (+amount). Es el
 *        inverso exacto de spendFromGoal. Sin este caso, borrar un consumo
 *        restaría del acumulado (como un aporte) y dejaría la meta encogida.
 *    Nunca baja de 0.
 *  - holding / policy / rental → sin reversión definida aquí: sus ledgers
 *    especializados (dividends, holding_contributions, pólizas, renta) se
 *    gestionan/borran en sus propios módulos; revertirlos parcialmente desde este
 *    orquestador arriesgaría corromper datos. Se deja documentado (no-op).
 *
 * Idempotente y defensivo: si el registro de origen ya no existe, no falla.
 */
export async function reverseLinkedTransaction(args: {
  transactionId: string;
  /** kind de la transacción ('gasto' | 'ingreso' | …): fija el sentido en metas. */
  kind: string;
  linkedKind: string;
  linkedId: string | null;
  amount: number;
  occurredOn: string;
  /** Off-budget: distingue un consumo del frasco de un aporte (ambos son gasto). */
  countsInBudget?: boolean;
}): Promise<void> {
  if (!args.linkedId) return;
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);

  if (args.linkedKind === "debt") {
    const { data: pay, error: pErr } = await supabase
      .from("debt_payments")
      .select("id")
      .eq("transaction_id", args.transactionId)
      .in("user_id", scope)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (pay) {
      const { error } = await supabase.rpc("delete_debt_payment", { p_payment_id: pay.id });
      if (error) throw new Error(error.message);
    }
    return;
  }

  if (args.linkedKind === "goal") {
    // Un consumo del frasco es un gasto OFF-BUDGET: bajó current_amount Y
    // target_amount, así que su reversión restaura AMBOS (inverso de spendFromGoal).
    const isSpend = args.kind === "gasto" && args.countsInBudget === false;
    const { data: goal, error: gErr } = await supabase
      .from("savings_goals")
      .select("current_amount,target_amount")
      .eq("id", args.linkedId)
      .in("user_id", scope)
      .maybeSingle();
    if (gErr) throw new Error(gErr.message);
    if (!goal) return;

    if (isSpend) {
      const { error } = await supabase
        .from("savings_goals")
        .update({ last_edited_by: user.id,
          current_amount: Number(goal.current_amount) + args.amount,
          target_amount: Number(goal.target_amount) + args.amount,
        })
        .eq("id", args.linkedId)
        .in("user_id", scope);
      if (error) throw new Error(error.message);
      return;
    }

    // Aporte (gasto budget-aware) subió → resta; retiro (ingreso) bajó → suma.
    const delta = args.kind === "gasto" ? -args.amount : args.amount;
    const next = Math.max(0, Number(goal.current_amount) + delta);
    const { error } = await supabase
      .from("savings_goals")
      .update({ last_edited_by: user.id, current_amount: next })
      .eq("id", args.linkedId)
      .in("user_id", scope);
    if (error) throw new Error(error.message);
    return;
  }

  // holding / policy / rental: reversión no definida (ver nota arriba).
}

/**
 * Id de una categoría de sistema por key (p. ej. 'deudas', 'inc_pasivo').
 * Best-effort: si no existe devuelve null y la transacción queda sin categoría
 * (el vínculo linked_kind/linked_id sigue contando la historia).
 */
export async function getSystemCategoryId(key: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("expense_categories")
    .select("id")
    .eq("key", key)
    .eq("is_system", true)
    .maybeSingle();
  return data?.id ?? null;
}

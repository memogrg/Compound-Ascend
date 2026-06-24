import "server-only";

/**
 * Servicio del Saco de Liquidez ("Tu Liquidez"). Respeta RLS (cliente de sesión).
 * Fuente de verdad: el ledger de movimientos reales; el saldo es SUM(delta),
 * normalizado a la moneda de visualización. Los deltas por transacción se
 * enganchan desde transaction-service (createTransaction/updateTransaction).
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
import { getActiveHouseholdId } from "@/lib/household/active";
import { convertCurrency } from "@/lib/fx";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { getDisplayCurrency } from "@/modules/financial-base/services/base-service";
import {
  computeLiquidityBalance,
  periodNetChange,
  type LiquidityRow,
} from "@/modules/financial-base/engine/liquidity";
import type { TxnKind, Period } from "@/modules/financial-base/types";
import type { LiquidityLedgerRow } from "@/lib/supabase/database.types";

type LedgerSlice = Pick<LiquidityLedgerRow, "delta" | "currency" | "reason" | "occurred_on">;

/** Filas del ledger del usuario, ya normalizadas a la moneda de display. */
async function loadRows(
  ctx?: AuthContext,
): Promise<{ rows: LiquidityRow[]; currency: string; raw: LedgerSlice[] }> {
  const { db, userId } = await resolveAuth(ctx);
  const [{ data }, currency, rates] = await Promise.all([
    db
      .from("liquidity_ledger")
      .select("delta, currency, reason, occurred_on")
      .eq("user_id", userId),
    getDisplayCurrency(ctx),
    getFxRates(),
  ]);
  const raw = (data ?? []) as LedgerSlice[];
  const rows: LiquidityRow[] = raw.map((r) => ({
    delta: convertCurrency(Number(r.delta), r.currency, currency, rates),
    reason: r.reason,
    occurredOn: r.occurred_on,
  }));
  return { rows, currency, raw };
}

/** Saldo actual de liquidez + si el usuario ya fijó su saldo inicial. */
export async function getLiquidityBalance(ctx?: AuthContext): Promise<{
  balance: number;
  currency: string;
  hasOpening: boolean;
}> {
  const { rows, currency, raw } = await loadRows(ctx);
  return {
    balance: computeLiquidityBalance(rows),
    currency,
    hasOpening: raw.some((r) => r.reason === "apertura"),
  };
}

/** Fija (o reescribe) el saldo inicial. Idempotente: una sola fila 'apertura'. */
export async function setOpeningBalance(amount: number): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const household_id = await getActiveHouseholdId(supabase, user.id);
  const currency = await getDisplayCurrency();

  const { data: existing } = await supabase
    .from("liquidity_ledger")
    .select("id")
    .eq("user_id", user.id)
    .eq("reason", "apertura")
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("liquidity_ledger")
      .update({ delta: amount, currency })
      .eq("id", existing.id);
    return;
  }
  await supabase.from("liquidity_ledger").insert({
    user_id: user.id,
    household_id,
    delta: amount,
    currency,
    reason: "apertura",
    transaction_id: null,
  });
}

/** Ajuste 1-toque: registra el delta entre el saldo real y el calculado. */
export async function reconcileBalance(realBalance: number): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const household_id = await getActiveHouseholdId(supabase, user.id);
  const { rows, currency } = await loadRows();
  const delta = Math.round((realBalance - computeLiquidityBalance(rows)) * 100) / 100;
  if (delta === 0) return; // ya cuadra: no ensuciamos el ledger.
  await supabase.from("liquidity_ledger").insert({
    user_id: user.id,
    household_id,
    delta,
    currency,
    reason: "ajuste",
    transaction_id: null,
  });
}

/**
 * Upsert del delta de una transacción real. ingreso → +amount; gasto → −amount;
 * cualquier otro kind (transferencia/ajuste) → delta 0: se borra la fila para no
 * dejar un delta huérfano si la transacción cambió de tipo.
 */
export async function recordTransactionDelta(args: {
  transactionId: string;
  kind: TxnKind;
  amount: number;
  currency: string;
  occurredOn: string;
}): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const delta =
    args.kind === "ingreso" ? args.amount : args.kind === "gasto" ? -args.amount : 0;

  if (delta === 0) {
    await supabase
      .from("liquidity_ledger")
      .delete()
      .eq("user_id", user.id)
      .eq("transaction_id", args.transactionId);
    return;
  }

  const household_id = await getActiveHouseholdId(supabase, user.id);
  const { data: existing } = await supabase
    .from("liquidity_ledger")
    .select("id")
    .eq("user_id", user.id)
    .eq("transaction_id", args.transactionId)
    .maybeSingle();

  if (existing?.id) {
    await supabase
      .from("liquidity_ledger")
      .update({ delta, currency: args.currency, occurred_on: args.occurredOn })
      .eq("id", existing.id);
    return;
  }
  await supabase.from("liquidity_ledger").insert({
    user_id: user.id,
    household_id,
    delta,
    currency: args.currency,
    reason: "transaccion",
    transaction_id: args.transactionId,
    occurred_on: args.occurredOn,
  });
}

/** Cambio de liquidez del periodo (para el checkpoint/ritual del mes). */
export async function getPeriodLiquidityChange(period: Period): Promise<number> {
  const { rows } = await loadRows();
  return periodNetChange(rows, { year: period.year, month: period.month });
}

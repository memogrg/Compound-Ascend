import "server-only";

/**
 * Lectura/escritura de la cola de propuestas (ingest_proposals) para la entrega
 * REACTIVA por WhatsApp. Service-role (el webhook no tiene sesión de usuario). La
 * propiedad es por cuenta = hogar si existe, si no el usuario (mismo criterio que
 * el índice de dedup). Resuelve la etiqueta de tarjeta vía account_cards.
 */
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { listAccountCards, resolveCardLabel } from "@/lib/ingestion/cards-service";

/** Propuesta lista para ofrecer al usuario (con etiqueta de tarjeta resuelta). */
export interface PendingProposal {
  id: string;
  kind: "gasto" | "ingreso";
  amount: number;
  currency: string;
  occurredOn: string; // YYYY-MM-DD
  merchant: string | null;
  cardLabel: string | null;
}

const PENDING_COLS = "id, kind, amount, currency, occurred_on, merchant, card_last4";

type ProposalRow = {
  id: string;
  kind: "gasto" | "ingreso";
  amount: number;
  currency: string;
  occurred_on: string;
  merchant: string | null;
  card_last4: string | null;
};

/** Mapea fila + tarjetas de la cuenta a PendingProposal (etiqueta resuelta). */
function toPendingProposal(row: ProposalRow, cards: Awaited<ReturnType<typeof listAccountCards>>): PendingProposal {
  return {
    id: row.id,
    kind: row.kind,
    amount: row.amount,
    currency: row.currency,
    occurredOn: row.occurred_on,
    merchant: row.merchant,
    cardLabel: resolveCardLabel(cards, row.card_last4),
  };
}

/** Propuestas 'pending' de la cuenta, más antiguas primero, con etiqueta de tarjeta. */
export async function listPendingProposals(
  userId: string,
  householdId: string | null,
): Promise<PendingProposal[]> {
  const supabase = createServiceRoleClient();
  const q = supabase
    .from("ingest_proposals")
    .select(PENDING_COLS)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  const { data, error } = householdId
    ? await q.eq("household_id", householdId)
    : await q.eq("user_id", userId).is("household_id", null);
  if (error || !data) return [];
  const cards = await listAccountCards({ userId, householdId });
  return (data as ProposalRow[]).map((r) => toPendingProposal(r, cards));
}

/** Cantidad de propuestas 'pending' de la cuenta. */
export async function countPendingProposals(
  userId: string,
  householdId: string | null,
): Promise<number> {
  const supabase = createServiceRoleClient();
  const q = supabase
    .from("ingest_proposals")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  const { count } = householdId
    ? await q.eq("household_id", householdId)
    : await q.eq("user_id", userId).is("household_id", null);
  return count ?? 0;
}

/** La propuesta 'pending' más antigua de la cuenta, o null. */
export async function getOldestPendingProposal(
  userId: string,
  householdId: string | null,
): Promise<PendingProposal | null> {
  const supabase = createServiceRoleClient();
  const q = supabase
    .from("ingest_proposals")
    .select(PENDING_COLS)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1);
  const { data, error } = householdId
    ? await q.eq("household_id", householdId)
    : await q.eq("user_id", userId).is("household_id", null);
  const row = (data as ProposalRow[] | null)?.[0];
  if (error || !row) return null;
  const cards = await listAccountCards({ userId, householdId });
  return toPendingProposal(row, cards);
}

/** Marca una propuesta como confirmed (tras crear la transacción real). */
export async function markProposalConfirmed(id: string): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase.from("ingest_proposals").update({ status: "confirmed" }).eq("id", id);
}

/** Marca una propuesta como discarded (el usuario la descartó). */
export async function markProposalDiscarded(id: string): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase.from("ingest_proposals").update({ status: "discarded" }).eq("id", id);
}

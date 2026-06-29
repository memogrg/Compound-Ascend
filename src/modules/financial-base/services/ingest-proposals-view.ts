import "server-only";

/**
 * Lectura de la cola de propuestas de ingesta (ingest_proposals) para la bandeja
 * "Por revisar" de la app. Usa el cliente de SESIÓN → respeta RLS: el usuario solo
 * ve las propuestas de su cuenta (las policies SELECT/UPDATE son del dueño; el
 * INSERT lo hace solo el poller con service-role). Resuelve la etiqueta de tarjeta
 * por (cuenta, last4) contra account_cards.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveCardLabel } from "@/lib/ingestion/cards-service";

/** Propuesta lista para la UI (forma plana, etiqueta de tarjeta resuelta). */
export interface PendingProposalView {
  id: string;
  kind: "gasto" | "ingreso";
  amount: number;
  currency: string;
  occurredOn: string; // YYYY-MM-DD
  merchant: string | null;
  cardLast4: string | null;
  cardLabel: string | null;
  confidence: number;
}

const COLS = "id, kind, amount, currency, occurred_on, merchant, card_last4, confidence";

type ProposalRow = {
  id: string;
  kind: "gasto" | "ingreso";
  amount: number;
  currency: string;
  occurred_on: string;
  merchant: string | null;
  card_last4: string | null;
  confidence: number;
};

type CardRow = { last4: string; label: string; holder_name: string | null };

/** Mapea una fila + tarjetas de la cuenta a la vista (etiqueta resuelta). Puro. */
export function mapProposalRow(row: ProposalRow, cards: CardRow[]): PendingProposalView {
  const cardList = cards.map((c) => ({ last4: c.last4, label: c.label, holderName: c.holder_name }));
  return {
    id: row.id,
    kind: row.kind,
    amount: row.amount,
    currency: row.currency,
    occurredOn: row.occurred_on,
    merchant: row.merchant,
    cardLast4: row.card_last4,
    cardLabel: resolveCardLabel(cardList, row.card_last4),
    confidence: row.confidence,
  };
}

/** Propuestas 'pending' del usuario (RLS), más antiguas primero, con etiqueta. */
export async function listMyPendingProposals(): Promise<PendingProposalView[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ingest_proposals")
    .select(COLS)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  const { data: cardRows } = await supabase.from("account_cards").select("last4, label, holder_name");
  const cards = (cardRows ?? []) as CardRow[];
  return (data as ProposalRow[]).map((r) => mapProposalRow(r, cards));
}

/**
 * Mapea una propuesta a la entrada de `addTransactionAction` (txnInputSchema). Puro
 * y testeable: kind tal cual (gasto/ingreso), merchantOrSource = comercio,
 * description = comercio + (· etiqueta de tarjeta si hay).
 */
export function proposalToTxnInput(p: PendingProposalView) {
  const description = `${p.merchant ?? ""}${p.cardLabel ? ` · ${p.cardLabel}` : ""}`.trim();
  return {
    kind: p.kind,
    amount: p.amount,
    currency: p.currency,
    occurredOn: p.occurredOn,
    merchantOrSource: p.merchant ?? undefined,
    description: description || (p.kind === "ingreso" ? "Ingreso" : "Gasto"),
    origin: "imported" as const,
    source: "email" as const,
    status: "confirmed" as const,
    confidence: p.confidence,
  };
}

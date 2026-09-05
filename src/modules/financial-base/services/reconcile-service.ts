import "server-only";

/**
 * Conciliador de ingesta (nivel B: avisar y UNIR).
 *
 *  · attachDuplicateHints: para cada propuesta pendiente busca un movimiento ya
 *    registrado que parezca el mismo (recibo, manual, importado…). La bandeja
 *    «Por revisar» lo muestra ANTES de confirmar.
 *  · mergeProposalIntoTransaction: «Sí, es el mismo» → el movimiento existente
 *    gana lo que trae el banco (referencia, último-4, banco) y la propuesta queda
 *    `merged` apuntando a él. No se crea nada nuevo.
 *  · autoMergePendingProposal: el camino inverso. Al registrar a mano / por
 *    recibo / por importación, si hay una propuesta pendiente que parece la misma,
 *    se une sola y se le avisa a la persona.
 *
 * Sesión + RLS: solo las filas del hogar. La decisión de "parece el mismo" vive
 * en src/lib/ingestion/reconcile.ts (pura).
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { householdMemberIds } from "@/lib/household/active";
import { logger } from "@/lib/logger";
import {
  buscarCandidato,
  parecenElMismo,
  ventanaDeFechas,
  type Movimiento,
} from "@/lib/ingestion/reconcile";
import type { PendingProposalView } from "@/modules/financial-base/services/ingest-proposals-view";
import type { TransactionRow } from "@/lib/supabase/database.types";

/** Movimiento ya registrado que una propuesta podría estar duplicando. */
export interface DuplicateHint {
  transactionId: string;
  description: string; // comercio o descripción, para mostrar
  amount: number;
  currency: string;
  occurredOn: string;
}

type TxnLite = {
  id: string;
  kind: string;
  amount: number;
  currency: string;
  occurred_on: string;
  merchant_or_source: string | null;
  description: string | null;
  external_ref: string | null;
};

const TXN_COLS =
  "id, kind, amount, currency, occurred_on, merchant_or_source, description, external_ref";

function toMovimiento(t: TxnLite): Movimiento & { label: string } {
  return {
    id: t.id,
    kind: t.kind as "gasto" | "ingreso",
    amount: Number(t.amount),
    currency: t.currency,
    occurredOn: t.occurred_on,
    merchant: t.merchant_or_source ?? t.description ?? null,
    label: t.merchant_or_source ?? t.description ?? "Movimiento",
  };
}

/** Movimientos del hogar dentro de una ventana de fechas (para comparar). */
async function movimientosEnVentana(desde: string, hasta: string) {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const memberIds = await householdMemberIds(supabase, user.id);
  const { data } = await supabase
    .from("transactions")
    .select(TXN_COLS)
    .in("user_id", memberIds)
    .in("kind", ["gasto", "ingreso"])
    .gte("occurred_on", desde)
    .lte("occurred_on", hasta);
  return ((data ?? []) as TxnLite[]).map(toMovimiento);
}

/** Pista de duplicado por propuesta (id → hint). Best-effort: si falla, vacío. */
export async function attachDuplicateHints(
  proposals: PendingProposalView[],
): Promise<Map<string, DuplicateHint>> {
  const out = new Map<string, DuplicateHint>();
  const ventana = ventanaDeFechas(proposals);
  if (!ventana) return out;
  try {
    const existentes = await movimientosEnVentana(ventana.desde, ventana.hasta);
    for (const p of proposals) {
      const cand: Movimiento = {
        id: p.id,
        kind: p.kind,
        amount: p.amount,
        currency: p.currency,
        occurredOn: p.occurredOn,
        merchant: p.merchant,
      };
      const m = buscarCandidato(cand, existentes);
      if (m) {
        out.set(p.id, {
          transactionId: m.id,
          description: m.label,
          amount: m.amount,
          currency: m.currency,
          occurredOn: m.occurredOn,
        });
      }
    }
  } catch (err) {
    logger.warn("conciliador: no se pudieron buscar duplicados", {
      message: err instanceof Error ? err.message : "?",
    });
  }
  return out;
}

/**
 * «Sí, es el mismo»: la propuesta se funde con el movimiento. Claim atómico sobre
 * la propuesta (solo pending → merged); el movimiento se enriquece con lo que no
 * tenía. RLS garantiza que ambos son del hogar.
 */
export async function mergeProposalIntoTransaction(
  proposalId: string,
  transactionId: string,
): Promise<{ ok: boolean; message?: string }> {
  await requireUser();
  const supabase = await createSupabaseServerClient();

  const { data: txn } = await supabase
    .from("transactions")
    .select(`${TXN_COLS}, card_last4, bank_code`)
    .eq("id", transactionId)
    .maybeSingle();
  if (!txn) return { ok: false, message: "Ese movimiento ya no existe." };

  const { data: claimed } = await supabase
    .from("ingest_proposals")
    .update({ status: "merged", merged_into: transactionId })
    .eq("id", proposalId)
    .eq("status", "pending")
    .select("id, external_ref, card_last4, bank_code, merchant")
    .maybeSingle();
  if (!claimed) return { ok: false, message: "Esa propuesta ya no está disponible." };

  const t = txn as TxnLite & { card_last4: string | null; bank_code: string | null };
  const patch: Partial<TransactionRow> = {};
  if (!t.external_ref && claimed.external_ref) patch.external_ref = claimed.external_ref;
  if (!t.card_last4 && claimed.card_last4) patch.card_last4 = claimed.card_last4;
  if (!t.bank_code && claimed.bank_code) patch.bank_code = claimed.bank_code;
  if (!t.merchant_or_source && claimed.merchant) patch.merchant_or_source = claimed.merchant;
  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from("transactions").update(patch).eq("id", transactionId);
    if (error) {
      logger.warn("conciliador: no se pudo enriquecer el movimiento", { message: error.message });
    }
  }
  return { ok: true };
}

/** Lo que se acaba de registrar por otra puerta (manual, recibo, chat, importación). */
export interface CreatedForReconcile {
  id: string;
  kind: "gasto" | "ingreso";
  amount: number;
  currency: string;
  occurredOn: string;
  merchant: string | null;
}

export interface AutoMerged {
  proposalId: string;
  merchant: string | null;
  amount: number;
  currency: string;
}

/**
 * Camino inverso: si hay una propuesta pendiente que parece este movimiento, se
 * une sola (merged) y el movimiento gana la referencia del banco. Best-effort y
 * silencioso ante errores: nunca hace fallar el alta que ya ocurrió.
 */
export async function autoMergePendingProposal(
  created: CreatedForReconcile,
): Promise<AutoMerged | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const ventana = ventanaDeFechas([created])!;
    const { data } = await supabase
      .from("ingest_proposals")
      .select(
        "id, kind, amount, currency, occurred_on, merchant, external_ref, card_last4, bank_code",
      )
      .eq("status", "pending")
      .eq("kind", created.kind)
      .gte("occurred_on", ventana.desde)
      .lte("occurred_on", ventana.hasta);
    const pendientes = (data ?? []).map((p) => ({
      id: p.id as string,
      kind: p.kind as "gasto" | "ingreso",
      amount: Number(p.amount),
      currency: p.currency as string,
      occurredOn: p.occurred_on as string,
      merchant: (p.merchant as string | null) ?? null,
      external_ref: (p.external_ref as string | null) ?? null,
      card_last4: (p.card_last4 as string | null) ?? null,
      bank_code: (p.bank_code as string | null) ?? null,
    }));
    const match = pendientes.find((p) => parecenElMismo(created, p));
    if (!match) return null;

    const { data: claimed } = await supabase
      .from("ingest_proposals")
      .update({ status: "merged", merged_into: created.id })
      .eq("id", match.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claimed) return null;

    const patch: Partial<TransactionRow> = {};
    if (match.external_ref) patch.external_ref = match.external_ref;
    if (match.card_last4) patch.card_last4 = match.card_last4;
    if (match.bank_code) patch.bank_code = match.bank_code;
    if (Object.keys(patch).length > 0) {
      await supabase.from("transactions").update(patch).eq("id", created.id);
    }
    return {
      proposalId: match.id,
      merchant: match.merchant,
      amount: match.amount,
      currency: match.currency,
    };
  } catch (err) {
    logger.warn("conciliador: unión automática fallida", {
      message: err instanceof Error ? err.message : "?",
    });
    return null;
  }
}

import "server-only";

/**
 * Crea transacciones confirmadas por el usuario (wizard, chat IA, recibo).
 *
 * Fase 5 (interconexión): delega en el pipeline central de financial-base —
 * la misma ruta que el composer — para que apliquen las reglas de
 * auto-categorización/auto-vínculo (Fase 2) y la propagación al ledger
 * especializado (pago de deuda / aporte a meta) con compensación.
 * El insert directo anterior se saltaba todo eso. El household_id lo pone el
 * pipeline central (integración household de main), no este servicio.
 */
import { createTransaction as createBaseTransaction } from "@/modules/financial-base";
import { propagateLinkedTransaction, deleteLinkedTransaction } from "@/modules/financial-base";
import type { TransactionInput } from "@/modules/assistant/schemas";

export async function createTransaction(input: TransactionInput): Promise<void> {
  const created = await createBaseTransaction({
    kind: input.kind,
    amount: input.amount,
    currency: input.currency,
    occurredOn: input.occurredOn,
    categoryId: null,
    accountId: null,
    // La descripción funciona como comercio/fuente: las reglas hacen match
    // sobre ella (igual que el texto del recibo escaneado).
    merchantOrSource: input.description,
    description: input.description,
    status: "confirmed",
    origin: input.source === "receipt" ? "scanned" : "ai_assisted",
    linkedKind: input.linkedKind ?? "none",
    linkedId: input.linkedId ?? null,
  });

  // Propagación (vínculo propuesto por la IA o aplicado por regla).
  if (created.linkedKind !== "none" && created.linkedId) {
    try {
      await propagateLinkedTransaction({
        transactionId: created.id,
        kind: input.kind,
        linkedKind: created.linkedKind,
        linkedId: created.linkedId,
        amount: input.amount,
        occurredOn: input.occurredOn,
      });
    } catch (err) {
      await deleteLinkedTransaction(created.id);
      throw err;
    }
  }
}

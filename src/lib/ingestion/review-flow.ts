/**
 * Lógica PURA de la entrega reactiva de propuestas por WhatsApp, sobre puertos
 * inyectados (sin IO ni service-role). El router arma los puertos con el provider,
 * el vínculo y los servicios; aquí solo orquestamos para poder testear el flujo
 * (proponer → confirmar/descartar → encadenar la siguiente) sin red ni BD.
 */
import type { PendingAction } from "@/lib/whatsapp/links-service";
import { formatMoney } from "@/lib/whatsapp/format";

/** Propuesta lista para ofrecer (la provee proposals-service). */
export interface ProposalView {
  id: string;
  kind: "gasto" | "ingreso";
  amount: number;
  currency: string;
  occurredOn: string;
  merchant: string | null;
  cardLabel: string | null;
}

export type Button = { id: string; title: string };
const BUTTONS: Button[] = [
  { id: "yes", title: "Sí" },
  { id: "edit", title: "Editar" },
];

/** PendingAction que nació de una propuesta de ingesta (lleva proposalId). */
export type ProposalPending = PendingAction & { proposalId: string };

/** Mapea una propuesta a PendingAction (origin/source notification + proposalId). */
export function proposalToPendingAction(p: ProposalView): ProposalPending {
  const detail = [p.merchant, p.cardLabel].filter(Boolean).join(" · ");
  return {
    kind: p.kind,
    description: detail || (p.kind === "ingreso" ? "Ingreso" : "Gasto"),
    amount: p.amount,
    currency: p.currency,
    occurredOn: p.occurredOn,
    merchant: p.merchant,
    origin: "notification",
    source: "notification",
    proposalId: p.id,
    cardLabel: p.cardLabel,
  };
}

/** Texto del prompt de una propuesta: "🏦 {kind} de {monto}{ · detalle} el {fecha}". */
export function buildProposalPrompt(a: PendingAction): string {
  const tipo = a.kind === "ingreso" ? "Ingreso" : "Gasto";
  const detail = [a.merchant, a.cardLabel].filter(Boolean).join(" · ");
  const tail = detail ? ` · ${detail}` : "";
  return `🏦 ${tipo} de ${formatMoney(a.amount, a.currency)}${tail} el ${a.occurredOn}. ¿Lo agrego?`;
}

/** Línea de nudge para el saludo; null si no hay pendientes. */
export function buildPendingNudge(count: number): string | null {
  if (count <= 0) return null;
  const plural = count === 1 ? "movimiento" : "movimientos";
  return `📋 Tenés ${count} ${plural} del banco por confirmar. Escribí *revisar* para verlos.`;
}

/** Puertos que el router implementa con provider + servicios. */
export interface ReviewDeps {
  getOldestPending(): Promise<ProposalView | null>;
  setPending(action: PendingAction | null): Promise<void>;
  // sendButtons/sendText devuelven lo que devuelva el provider (SendResult); no lo
  // usamos, por eso `unknown`.
  sendButtons(text: string, buttons: Button[]): Promise<unknown>;
  sendText(text: string): Promise<unknown>;
  createTransaction(action: PendingAction): Promise<{ ok: boolean }>;
  markConfirmed(proposalId: string): Promise<void>;
  markDiscarded(proposalId: string): Promise<void>;
}

/**
 * Ofrece la propuesta pendiente más antigua (la deja como pending_action y manda
 * los botones Sí/Editar). Si no quedan, limpia el pending y avisa. Devuelve si
 * ofreció algo.
 */
export async function surfaceNextProposal(deps: ReviewDeps): Promise<boolean> {
  const next = await deps.getOldestPending();
  if (!next) {
    await deps.setPending(null);
    await deps.sendText("✅ No tenés movimientos por confirmar.");
    return false;
  }
  const action = proposalToPendingAction(next);
  await deps.setPending(action);
  await deps.sendButtons(buildProposalPrompt(action), BUTTONS);
  return true;
}

/**
 * Confirma una propuesta: crea la transacción real y, si sale bien, marca la
 * propuesta confirmed y encadena la siguiente pendiente. Si falla, deja el pending
 * para reintentar.
 */
export async function confirmProposal(deps: ReviewDeps, pending: ProposalPending): Promise<void> {
  const res = await deps.createTransaction(pending);
  if (!res.ok) {
    await deps.sendText("No pude guardarlo. Probá de nuevo en un momento.");
    return;
  }
  await deps.markConfirmed(pending.proposalId);
  const enDonde = pending.merchant ? ` en ${pending.merchant}` : "";
  await deps.sendText(
    `✅ Anotado: ${pending.kind} de ${formatMoney(pending.amount, pending.currency)}${enDonde}.`,
  );
  await surfaceNextProposal(deps); // encadena el siguiente
}

/** Descarta una propuesta y pasa a la siguiente pendiente. */
export async function discardProposal(deps: ReviewDeps, pending: ProposalPending): Promise<void> {
  await deps.markDiscarded(pending.proposalId);
  await deps.sendText("Descarté ese movimiento.");
  await surfaceNextProposal(deps);
}

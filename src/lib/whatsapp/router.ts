import "server-only";

/**
 * Enrutador de mensajes entrantes de WhatsApp. Recibe el mensaje ya parseado y
 * la firma ya validada (el webhook no confía en el contenido). El texto del
 * usuario es DATO, nunca instrucciones para el código.
 *
 * Capacidades:
 *  - Enrolamiento por OTP (números no vinculados).
 *  - Foto de recibo -> propuesta -> confirmación -> transacción (este sub-PR).
 *  - Texto (gasto/ingreso) y consultas de solo lectura: sub-PRs siguientes.
 *
 * Nada se escribe sin confirmación explícita del usuario.
 */
import { financeChatWithTools, scanReceipt } from "@/lib/ai/orchestrator";
import { buildWhatsAppToolContext } from "@/lib/whatsapp/tool-context";
import { assertTokenBudget, recordUsage } from "@/lib/ai/usage";
import { AppError } from "@/lib/errors";
import type { ChatMessage } from "@/lib/ai/provider";
import { buildContextForUser } from "@/lib/whatsapp/context-service";
import {
  activateLinkByOtp,
  getActiveLinkByPhone,
  getPendingAction,
  getUserCurrency,
  getUserDisplayName,
  setPendingAction,
  touchLastSeen,
  type ActiveLink,
  type PendingAction,
} from "@/lib/whatsapp/links-service";
import { createTransactionForUser } from "@/lib/whatsapp/write-service";
import { moveLastTransaction, parseMoveCommand } from "@/lib/whatsapp/recategorize-service";
import { formatMoney, todayIso } from "@/lib/whatsapp/format";
import { parseNotification } from "@/lib/ingestion/sources";
import { toPendingAction, dedupKey } from "@/lib/ingestion/normalize";
import {
  surfaceNextProposal,
  confirmProposal,
  discardProposal,
  buildPendingNudge,
  type ReviewDeps,
  type ProposalPending,
} from "@/lib/ingestion/review-flow";
import {
  getOldestPendingProposal,
  countPendingProposals,
  markProposalConfirmed,
  markProposalDiscarded,
} from "@/lib/ingestion/proposals-service";
import type { WhatsAppProvider } from "@/lib/whatsapp/provider";

export type InboundMessage = {
  phone: string; // E.164 (+506...)
  body: string;
  numMedia: number;
  mediaUrl: string | null;
  mediaType: string | null;
};

const NOT_LINKED =
  "Este número no está vinculado. Entrá a la app → Perfil → Vincular WhatsApp para empezar.";
const OTP_RE = /^\d{6}$/;
// Acepta texto y también la respuesta numérica del fallback de botones (1=Sí, 2=Editar).
const CONFIRM_RE = /^(s[ií]|yes|ok|dale|confirmar|confirmo|listo|1)$/;
const EDIT_RE = /^(edit(ar)?|2)$/;
const REVIEW_RE = /^(revisar|revisi[oó]n|movimientos|pendientes)$/;
const HELP_RE = /^(ayuda|men[uú]|hola|help|empezar|start|\?)$/;
const MOVE_HINT = "\n↩️ ¿Sobre equivocado? Respondé *mover a <sobre>* (agregá *siempre* para recordarlo).";
const HELP_TEXT =
  "👋 Soy tu asistente de Compound Ascend. Puedo:\n\n" +
  "📸 Registrar un gasto: enviá una *foto* del recibo.\n" +
  '✍️ Registrar por texto: "gasté 12000 en super" o "me entraron 50000 de freelance".\n' +
  '🔁 Re-clasificar lo último: "mover a Paseos" (o "mover a Paseos siempre" para recordarlo).\n' +
  '📊 Responder consultas: "¿cuánto gasté este mes?", "¿cómo va mi presupuesto?".\n\n' +
  "Siempre te pido confirmar antes de guardar.";

export async function routeInbound(provider: WhatsAppProvider, msg: InboundMessage): Promise<void> {
  const link = await getActiveLinkByPhone(msg.phone);

  // Enrolamiento por OTP (solo si el número aún no está vinculado).
  if (!link && OTP_RE.test(msg.body)) {
    const res = await activateLinkByOtp(msg.phone, msg.body);
    if (res.ok) {
      const name = await getUserDisplayName(res.userId);
      await provider.sendText(
        msg.phone,
        `✅ Listo${name ? `, ${name}` : ""}. Tu WhatsApp quedó vinculado a tu familia en Compound Ascend.`,
      );
    } else if (res.reason === "phone_taken") {
      await provider.sendText(
        msg.phone,
        "Este número ya está vinculado a otra cuenta. Desvinculalo primero desde esa cuenta.",
      );
    } else {
      await provider.sendText(
        msg.phone,
        "Ese código no es válido o expiró. Generá uno nuevo en la app → Perfil → Vincular WhatsApp.",
      );
    }
    return;
  }

  if (!link) {
    await provider.sendText(msg.phone, NOT_LINKED);
    return;
  }

  await touchLastSeen(link.id);
  await handleActiveMessage(provider, link, msg);
}

/** Arma los puertos de review-flow con el provider, el vínculo y los servicios. */
function buildReviewDeps(
  provider: WhatsAppProvider,
  link: ActiveLink,
  phone: string,
): ReviewDeps {
  return {
    getOldestPending: () => getOldestPendingProposal(link.userId, link.householdId),
    setPending: (action) => setPendingAction(link.id, action),
    sendButtons: (text, buttons) => provider.sendButtons(phone, text, buttons),
    sendText: (text) => provider.sendText(phone, text),
    createTransaction: (action) => createTransactionForUser(link.userId, link.householdId, action),
    markConfirmed: (id) => markProposalConfirmed(id),
    markDiscarded: (id) => markProposalDiscarded(id),
  };
}

/** Mensajes de un número ya vinculado. */
async function handleActiveMessage(
  provider: WhatsAppProvider,
  link: ActiveLink,
  msg: InboundMessage,
): Promise<void> {
  const lower = msg.body.trim().toLowerCase();
  const pending = await getPendingAction(link.id);

  // Confirmación de una propuesta pendiente.
  if (pending) {
    if (CONFIRM_RE.test(lower)) {
      // Propuesta de la cola de ingesta: crea la transacción, marca confirmed y
      // encadena la siguiente pendiente.
      if (pending.proposalId) {
        await confirmProposal(buildReviewDeps(provider, link, msg.phone), pending as ProposalPending);
        return;
      }
      const res = await createTransactionForUser(link.userId, link.householdId, pending);
      await setPendingAction(link.id, null);
      const sobre = res.categoryName ? ` · en ${res.categoryName}` : " · por clasificar";
      await provider.sendText(
        msg.phone,
        res.ok
          ? `✅ Anotado: ${pending.kind} de ${formatMoney(pending.amount, pending.currency)}${pending.merchant ? ` en ${pending.merchant}` : ""}${sobre}.${MOVE_HINT}`
          : "No pude guardarlo. Probá de nuevo en un momento.",
      );
      return;
    }
    if (EDIT_RE.test(lower)) {
      // Propuesta de la cola: marcar discarded y pasar a la siguiente.
      if (pending.proposalId) {
        await discardProposal(buildReviewDeps(provider, link, msg.phone), pending as ProposalPending);
        return;
      }
      await setPendingAction(link.id, null);
      await provider.sendText(
        msg.phone,
        "Listo, descarté esa propuesta. Enviá de nuevo el dato corregido (foto o texto).",
      );
      return;
    }
    // No es confirmación: descartamos la propuesta vieja y seguimos con el input nuevo.
    await setPendingAction(link.id, null);
  }

  // "revisar": ofrece la propuesta del banco más antigua por confirmar.
  if (REVIEW_RE.test(lower)) {
    await surfaceNextProposal(buildReviewDeps(provider, link, msg.phone));
    return;
  }

  // Ayuda / saludo: respuesta rápida sin consumir IA. Con nudge si hay pendientes.
  if (HELP_RE.test(lower)) {
    const nudge = buildPendingNudge(
      await countPendingProposals(link.userId, link.householdId),
    );
    await provider.sendText(msg.phone, nudge ? `${HELP_TEXT}\n\n${nudge}` : HELP_TEXT);
    return;
  }

  // "mover/cambiar a <sobre> [siempre]": re-clasifica la última transacción.
  const move = parseMoveCommand(msg.body);
  if (move) {
    await handleMoveCommand(provider, link, msg.phone, move.sobre, move.alsoRule);
    return;
  }

  // Foto de recibo.
  if (msg.numMedia > 0 && msg.mediaUrl && (msg.mediaType ?? "").startsWith("image/")) {
    await handleReceiptPhoto(provider, link, msg, msg.mediaUrl);
    return;
  }

  if (!msg.body) {
    await provider.sendText(
      msg.phone,
      'Mandame una foto del recibo o escribí un gasto/ingreso, p. ej. "gasté 12000 en super".',
    );
    return;
  }

  // Notificación de banco reenviada (capa de ingesta): si calza una plantilla,
  // se propone como transacción con el flujo de confirmación de siempre.
  const movs = parseNotification(msg.body);
  if (movs.length) {
    const mov = movs[0]!;
    // Dedup: dedupKey(mov) identifica el movimiento. TODO(ingesta): persistir esta
    // clave (p. ej. en whatsapp_links o una tabla) para no re-proponer la misma
    // notificación si el usuario la reenvía dos veces. Sin estado global en memoria.
    void dedupKey(mov);

    const pendingTxn = toPendingAction(mov);
    await setPendingAction(link.id, pendingTxn);
    const low = mov.confidence < 0.7 ? " (verificá el monto)" : "";
    const lead = `🏦 ${mov.kind === "ingreso" ? "Ingreso" : "Gasto"} de ${formatMoney(mov.amount, mov.currency)}${mov.merchant ? ` · ${mov.merchant}` : ""}.${low}`;
    await provider.sendButtons(msg.phone, `${lead} ¿Lo agrego?`, [
      { id: "yes", title: "Sí" },
      { id: "edit", title: "Editar" },
    ]);
    return;
  }

  // Texto libre: gasto/ingreso (con confirmación) o consulta de solo lectura.
  await handleText(provider, link, msg);
}

/** Comando "mover a <sobre> [siempre]": re-clasifica la última transacción del usuario. */
async function handleMoveCommand(
  provider: WhatsAppProvider,
  link: ActiveLink,
  phone: string,
  sobre: string,
  alsoRule: boolean,
): Promise<void> {
  if (!sobre) {
    await provider.sendText(phone, '¿A qué sobre lo movemos? Probá: *mover a Paseos*.');
    return;
  }
  const res = await moveLastTransaction(link.userId, sobre, alsoRule);
  switch (res.status) {
    case "ok":
      await provider.sendText(
        phone,
        `✅ Movido a ${res.categoryName}` +
          (res.ruleUpdated && res.merchant ? ` · lo recordaré para ${res.merchant}.` : "."),
      );
      return;
    case "ambiguous":
      await provider.sendText(
        phone,
        `¿Cuál sobre? Tengo varios parecidos: ${res.options.join(", ")}. Escribí el nombre exacto.`,
      );
      return;
    case "not_found":
      await provider.sendText(
        phone,
        `No encontré un sobre que se llame "${res.name}". Mirá tus sobres en la app o probá otro nombre.`,
      );
      return;
    case "no_txn":
      await provider.sendText(phone, "No tenés un movimiento reciente para mover.");
      return;
    default:
      await provider.sendText(phone, "No pude moverlo. Probá de nuevo en un momento.");
  }
}

/** Texto libre: arma el contexto del hogar, consulta a la IA y, si propone una
 * transacción, la deja PENDIENTE de confirmación. Las consultas se responden sin
 * escribir nada. */
async function handleText(
  provider: WhatsAppProvider,
  link: ActiveLink,
  msg: InboundMessage,
): Promise<void> {
  try {
    await assertTokenBudget(link.userId);
  } catch (err) {
    await provider.sendText(
      msg.phone,
      err instanceof AppError ? err.message : "No pude procesar tu mensaje ahora.",
    );
    return;
  }

  const ctx = await buildContextForUser(link.userId, link.householdId);
  const messages: ChatMessage[] = [{ role: "user", content: msg.body }];
  // Habilita la herramienta de deuda (function-calling) también en WhatsApp. El
  // toolContext se arma con service-role (sin sesión) y en moneda PRINCIPAL.
  // Best-effort: si falla, financeChatWithTools sin toolContext = chat normal.
  let toolContext;
  try {
    toolContext = await buildWhatsAppToolContext(link.userId, link.householdId);
  } catch {
    toolContext = undefined;
  }
  const result = await financeChatWithTools(messages, ctx, toolContext);
  await recordUsage(link.userId, result.tokensIn, result.tokensOut);

  const action =
    result.action?.type === "create_transaction"
      ? toTxnAction(result.action.payload, ctx.currency)
      : null;

  if (action) {
    await setPendingAction(link.id, action);
    const lead =
      result.action?.summary?.trim() ||
      `${action.kind === "ingreso" ? "Ingreso" : "Gasto"} de ${formatMoney(action.amount, action.currency)}${action.description ? ` · ${action.description}` : ""}`;
    await provider.sendButtons(msg.phone, `${lead}. ¿Lo agrego?`, [
      { id: "yes", title: "Sí" },
      { id: "edit", title: "Editar" },
    ]);
    return;
  }

  // Consulta o respuesta general (solo lectura): NO escribe nada.
  await provider.sendText(
    msg.phone,
    result.reply ||
      'No entendí. Probá: "gasté 12000 en super", "¿cuánto gasté este mes?" o enviá una foto del recibo.',
  );
}

/** Mapea el payload de la acción `create_transaction` a una PendingAction. */
function toTxnAction(
  payload: Record<string, unknown>,
  fallbackCurrency: string,
): PendingAction | null {
  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const kind = String(payload.kind ?? "gasto") === "ingreso" ? "ingreso" : "gasto";
  const description =
    typeof payload.description === "string" && payload.description.trim()
      ? payload.description.trim()
      : kind === "ingreso"
        ? "Ingreso"
        : "Gasto";
  const currency =
    typeof payload.currency === "string" && payload.currency ? payload.currency : fallbackCurrency;
  return {
    kind,
    description,
    amount,
    currency,
    occurredOn: todayIso(),
    merchant: null,
    origin: "ai_assisted",
    source: "chat",
  };
}

async function handleReceiptPhoto(
  provider: WhatsAppProvider,
  link: ActiveLink,
  msg: InboundMessage,
  mediaUrl: string,
): Promise<void> {
  try {
    await assertTokenBudget(link.userId);
  } catch (err) {
    await provider.sendText(
      msg.phone,
      err instanceof AppError ? err.message : "No pude procesar la imagen ahora.",
    );
    return;
  }

  const media = await provider.downloadMedia(mediaUrl);
  if (!media) {
    await provider.sendText(msg.phone, "No pude descargar la imagen. Probá de nuevo.");
    return;
  }

  const { extract, tokensIn, tokensOut } = await scanReceipt(media.base64, media.mimeType);
  await recordUsage(link.userId, tokensIn, tokensOut);

  if (extract.amount == null) {
    await provider.sendText(
      msg.phone,
      "No pude leer el monto del recibo. Probá con una foto más clara o enviá el gasto por texto.",
    );
    return;
  }

  const currency = await getUserCurrency(link.userId);
  const date = extract.date ?? todayIso();
  const action: PendingAction = {
    kind: "gasto",
    description: extract.merchant ?? extract.category ?? "Gasto",
    amount: extract.amount,
    currency,
    occurredOn: date,
    merchant: extract.merchant,
    origin: "scanned",
    source: "receipt",
  };
  await setPendingAction(link.id, action);

  const parts = [
    `🧾 ${extract.merchant ?? "Comercio"}`,
    formatMoney(extract.amount, currency),
    date,
  ];
  if (extract.category) parts.push(`categoría ${extract.category}`);
  await provider.sendButtons(msg.phone, `${parts.join(" · ")}. ¿Lo agrego?`, [
    { id: "yes", title: "Sí" },
    { id: "edit", title: "Editar" },
  ]);
}

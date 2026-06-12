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
import { financeChat, scanReceipt } from "@/lib/ai/orchestrator";
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
import { formatMoney, todayIso } from "@/lib/whatsapp/format";
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
const CONFIRM_RE = /^(s[ií]|yes|ok|dale|confirmar|confirmo|listo)$/;
const EDIT_RE = /^edit/;
const HELP_RE = /^(ayuda|men[uú]|hola|help|empezar|start|\?)$/;
const HELP_TEXT =
  "👋 Soy tu asistente de Compound Ascend. Puedo:\n\n" +
  "📸 Registrar un gasto: enviá una *foto* del recibo.\n" +
  '✍️ Registrar por texto: "gasté 12000 en super" o "me entraron 50000 de freelance".\n' +
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
      const res = await createTransactionForUser(link.userId, link.householdId, pending);
      await setPendingAction(link.id, null);
      await provider.sendText(
        msg.phone,
        res.ok
          ? `✅ Anotado: ${pending.kind} de ${formatMoney(pending.amount, pending.currency)}${pending.merchant ? ` en ${pending.merchant}` : ""}.`
          : "No pude guardarlo. Probá de nuevo en un momento.",
      );
      return;
    }
    if (EDIT_RE.test(lower)) {
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

  // Ayuda / saludo: respuesta rápida sin consumir IA.
  if (HELP_RE.test(lower)) {
    await provider.sendText(msg.phone, HELP_TEXT);
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

  // Texto libre: gasto/ingreso (con confirmación) o consulta de solo lectura.
  await handleText(provider, link, msg);
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
  const result = await financeChat(messages, ctx);
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

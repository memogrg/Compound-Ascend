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
import { scanReceipt } from "@/lib/ai/orchestrator";
import { assertTokenBudget, recordUsage } from "@/lib/ai/usage";
import { AppError } from "@/lib/errors";
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

  // Foto de recibo.
  if (msg.numMedia > 0 && msg.mediaUrl && (msg.mediaType ?? "").startsWith("image/")) {
    await handleReceiptPhoto(provider, link, msg, msg.mediaUrl);
    return;
  }

  // Texto libre: llega en el siguiente sub-PR.
  await provider.sendText(
    msg.phone,
    "📸 Mandame una foto del recibo y te propongo el gasto para confirmar. (Registrar por texto llega muy pronto.)",
  );
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

  const parts = [`🧾 ${extract.merchant ?? "Comercio"}`, formatMoney(extract.amount, currency), date];
  if (extract.category) parts.push(`categoría ${extract.category}`);
  await provider.sendButtons(msg.phone, `${parts.join(" · ")}. ¿Lo agrego?`, [
    { id: "yes", title: "Sí" },
    { id: "edit", title: "Editar" },
  ]);
}

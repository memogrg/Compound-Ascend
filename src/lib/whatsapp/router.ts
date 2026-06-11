import "server-only";

/**
 * Enrutador de mensajes entrantes de WhatsApp. Recibe el mensaje ya parseado y
 * la firma ya validada (el webhook no confía en el contenido). El texto del
 * usuario es DATO, nunca instrucciones para el código.
 *
 * Las capacidades (foto de recibo, gasto/ingreso por texto, consultas de solo
 * lectura) se añaden en los siguientes sub-PRs sobre `handleActiveMessage`.
 */
import {
  activateLinkByOtp,
  getActiveLinkByPhone,
  getUserDisplayName,
  touchLastSeen,
  type ActiveLink,
} from "@/lib/whatsapp/links-service";
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

/**
 * Mensajes de un número ya vinculado. Placeholder hasta que lleguen las
 * capacidades (foto/texto/consultas) en los próximos sub-PRs.
 */
async function handleActiveMessage(
  provider: WhatsAppProvider,
  _link: ActiveLink,
  msg: InboundMessage,
): Promise<void> {
  await provider.sendText(
    msg.phone,
    "Recibí tu mensaje. Pronto podré registrar gastos por foto o texto y responder consultas de tu presupuesto.",
  );
}

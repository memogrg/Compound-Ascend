import "server-only";

/**
 * Selector de proveedor de WhatsApp por entorno: se prefiere Meta Cloud API si
 * está configurado, si no Twilio, y si faltan credenciales un proveedor Noop que
 * omite el envío con gracia (mismo patrón que `src/lib/email/send.ts`).
 */
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { MetaWhatsAppProvider } from "@/lib/whatsapp/meta";
import { TwilioWhatsAppProvider } from "@/lib/whatsapp/twilio";
import type { DownloadedMedia, SendResult, WhatsAppProvider } from "@/lib/whatsapp/provider";

export type {
  WhatsAppProvider,
  WhatsAppButton,
  DownloadedMedia,
  SendResult,
} from "@/lib/whatsapp/provider";

export function isWhatsAppConfigured(): boolean {
  const env = getServerEnv();
  if (env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN) return true;
  return Boolean(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_NUMBER);
}

/** Proveedor inactivo: registra y omite (no rompe el flujo si falta config). */
class NoopWhatsAppProvider implements WhatsAppProvider {
  readonly name = "noop";
  async sendText(): Promise<SendResult> {
    logger.info("whatsapp: omitido (proveedor no configurado)");
    return { ok: false, skipped: true };
  }
  async sendButtons(): Promise<SendResult> {
    logger.info("whatsapp: omitido (proveedor no configurado)");
    return { ok: false, skipped: true };
  }
  async downloadMedia(): Promise<DownloadedMedia | null> {
    return null;
  }
}

export function getWhatsAppProvider(): WhatsAppProvider {
  const env = getServerEnv();
  if (env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ACCESS_TOKEN) {
    return new MetaWhatsAppProvider(
      env.WHATSAPP_PHONE_NUMBER_ID,
      env.WHATSAPP_ACCESS_TOKEN,
      env.WHATSAPP_API_VERSION || "v21.0",
    );
  }
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_NUMBER) {
    return new TwilioWhatsAppProvider(
      env.TWILIO_ACCOUNT_SID,
      env.TWILIO_AUTH_TOKEN,
      env.TWILIO_WHATSAPP_NUMBER,
    );
  }
  return new NoopWhatsAppProvider();
}

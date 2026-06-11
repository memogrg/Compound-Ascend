import "server-only";

/**
 * Selector de proveedor de WhatsApp por entorno (hoy solo Twilio). Si faltan
 * credenciales, devuelve un proveedor Noop que omite el envío con gracia
 * (mismo patrón que `src/lib/email/send.ts`).
 */
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { TwilioWhatsAppProvider } from "@/lib/whatsapp/twilio";
import type {
  DownloadedMedia,
  SendResult,
  WhatsAppProvider,
} from "@/lib/whatsapp/provider";

export type {
  WhatsAppProvider,
  WhatsAppButton,
  DownloadedMedia,
  SendResult,
} from "@/lib/whatsapp/provider";

export function isWhatsAppConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(
    env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_NUMBER,
  );
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
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_WHATSAPP_NUMBER) {
    return new TwilioWhatsAppProvider(
      env.TWILIO_ACCOUNT_SID,
      env.TWILIO_AUTH_TOKEN,
      env.TWILIO_WHATSAPP_NUMBER,
    );
  }
  return new NoopWhatsAppProvider();
}

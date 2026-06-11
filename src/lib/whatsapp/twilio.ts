import "server-only";

/**
 * Implementación de WhatsAppProvider con la API REST de Twilio.
 * - Envío: POST a /Messages.json con auth básica (ACCOUNT_SID:AUTH_TOKEN) y
 *   `From = whatsapp:${TWILIO_WHATSAPP_NUMBER}`.
 * - Descarga de media: GET al MediaUrl con la misma auth básica (Twilio protege
 *   el adjunto), devuelto como base64 + mimeType.
 */
import { logger } from "@/lib/logger";
import {
  formatButtonsAsText,
  type DownloadedMedia,
  type SendResult,
  type WhatsAppButton,
  type WhatsAppProvider,
} from "@/lib/whatsapp/provider";

const TIMEOUT_MS = 10000;
const API_BASE = "https://api.twilio.com/2010-04-01";

function basicAuth(sid: string, token: string): string {
  return "Basic " + Buffer.from(`${sid}:${token}`).toString("base64");
}

function toWhatsApp(to: string): string {
  return to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
}

export class TwilioWhatsAppProvider implements WhatsAppProvider {
  readonly name = "twilio";

  constructor(
    private readonly sid: string,
    private readonly token: string,
    private readonly fromNumber: string,
  ) {}

  sendText(to: string, body: string): Promise<SendResult> {
    return this.send(to, body);
  }

  sendButtons(to: string, body: string, options?: WhatsAppButton[]): Promise<SendResult> {
    // El sandbox/los números no aprobados de Twilio no permiten botones
    // interactivos sin plantillas; degradamos a texto numerado (mismo contrato).
    return this.send(to, formatButtonsAsText(body, options));
  }

  private async send(to: string, body: string): Promise<SendResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE}/Accounts/${this.sid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: basicAuth(this.sid, this.token),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          From: toWhatsApp(this.fromNumber),
          To: toWhatsApp(to),
          Body: body,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        logger.warn("whatsapp(twilio): respuesta no OK", { status: res.status });
        return { ok: false, error: `status ${res.status}` };
      }
      return { ok: true };
    } catch (err) {
      logger.error("whatsapp(twilio): fallo al enviar", {
        message: err instanceof Error ? err.message : "?",
      });
      return { ok: false, error: "network" };
    } finally {
      clearTimeout(timer);
    }
  }

  async downloadMedia(mediaUrl: string): Promise<DownloadedMedia | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(mediaUrl, {
        headers: { Authorization: basicAuth(this.sid, this.token) },
        signal: controller.signal,
      });
      if (!res.ok) {
        logger.warn("whatsapp(twilio): media no OK", { status: res.status });
        return null;
      }
      const mimeType = res.headers.get("content-type") ?? "application/octet-stream";
      const buf = Buffer.from(await res.arrayBuffer());
      return { base64: buf.toString("base64"), mimeType };
    } catch (err) {
      logger.error("whatsapp(twilio): fallo al bajar media", {
        message: err instanceof Error ? err.message : "?",
      });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

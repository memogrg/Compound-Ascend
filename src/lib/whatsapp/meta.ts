import "server-only";

/**
 * Implementación de WhatsAppProvider con Meta WhatsApp Cloud API (Graph).
 * - Envío: POST /{PHONE_NUMBER_ID}/messages con Bearer y JSON.
 * - Media entrante: en Meta el mensaje trae un media_id (no URL). Flujo en 2 pasos:
 *   (1) GET /{media_id} -> { url }, (2) GET url con Bearer -> bytes.
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
const GRAPH = "https://graph.facebook.com";

/** Meta quiere el número sin "whatsapp:" ni "+": dígitos con código de país. */
function toMeta(to: string): string {
  return to.replace(/^whatsapp:/, "").replace(/^\+/, "").trim();
}

export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name = "meta";

  constructor(
    private readonly phoneNumberId: string,
    private readonly accessToken: string,
    private readonly apiVersion: string = "v21.0",
  ) {}

  sendText(to: string, body: string): Promise<SendResult> {
    return this.send(to, body);
  }

  sendButtons(to: string, body: string, options?: WhatsAppButton[]): Promise<SendResult> {
    // Mismo contrato que Twilio: degradamos a texto numerado para no depender de
    // plantillas/interactivos nativos. (Botones nativos = delta futuro.)
    return this.send(to, formatButtonsAsText(body, options));
  }

  private async send(to: string, body: string): Promise<SendResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${GRAPH}/${this.apiVersion}/${this.phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: toMeta(to),
          type: "text",
          text: { preview_url: false, body },
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        logger.warn("whatsapp(meta): respuesta no OK", { status: res.status });
        return { ok: false, error: `status ${res.status}` };
      }
      return { ok: true };
    } catch (err) {
      logger.error("whatsapp(meta): fallo al enviar", {
        message: err instanceof Error ? err.message : "?",
      });
      return { ok: false, error: "network" };
    } finally {
      clearTimeout(timer);
    }
  }

  /** `mediaRef` = media_id del mensaje entrante. */
  async downloadMedia(mediaRef: string): Promise<DownloadedMedia | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const metaRes = await fetch(`${GRAPH}/${this.apiVersion}/${mediaRef}`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
        signal: controller.signal,
      });
      if (!metaRes.ok) {
        logger.warn("whatsapp(meta): media meta no OK", { status: metaRes.status });
        return null;
      }
      const { url } = (await metaRes.json()) as { url?: string };
      if (!url) return null;
      const binRes = await fetch(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
        signal: controller.signal,
      });
      if (!binRes.ok) {
        logger.warn("whatsapp(meta): media bin no OK", { status: binRes.status });
        return null;
      }
      const mimeType = binRes.headers.get("content-type") ?? "application/octet-stream";
      const buf = Buffer.from(await binRes.arrayBuffer());
      return { base64: buf.toString("base64"), mimeType };
    } catch (err) {
      logger.error("whatsapp(meta): fallo al bajar media", {
        message: err instanceof Error ? err.message : "?",
      });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

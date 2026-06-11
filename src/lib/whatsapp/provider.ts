/**
 * Capa de mensajería de WhatsApp DESACOPLADA del proveedor. Permite migrar
 * Twilio -> Meta Cloud API sin tocar el resto del código: solo se añade otra
 * implementación de esta interfaz y se selecciona en `index.ts`.
 */

/** Botón/opción de respuesta rápida (degradado a texto si el canal no los soporta). */
export type WhatsAppButton = { id: string; title: string };

/** Adjunto descargado de un mensaje entrante (p. ej. foto de recibo). */
export type DownloadedMedia = { base64: string; mimeType: string };

export type SendResult = { ok: boolean; skipped?: boolean; error?: string };

export interface WhatsAppProvider {
  readonly name: string;
  /** Envía texto plano. `to` en E.164 (+506...). */
  sendText(to: string, body: string): Promise<SendResult>;
  /** Envía texto con opciones; degradable a texto numerado. */
  sendButtons(to: string, body: string, options?: WhatsAppButton[]): Promise<SendResult>;
  /** Descarga un adjunto entrante y lo devuelve como base64 + mimeType. */
  downloadMedia(mediaUrl: string): Promise<DownloadedMedia | null>;
}

/** Une cuerpo + opciones numeradas (fallback común cuando no hay botones nativos). */
export function formatButtonsAsText(body: string, options?: WhatsAppButton[]): string {
  if (!options || options.length === 0) return body;
  return `${body}\n\n${options.map((o, i) => `${i + 1}. ${o.title}`).join("\n")}`;
}

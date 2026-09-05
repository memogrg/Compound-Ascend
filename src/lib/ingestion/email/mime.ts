/**
 * Lectura MIME de un correo de ingesta: cuerpo decodificado y, si viene como
 * «Reenviar como archivo adjunto» (Gmail, Outlook, Apple Mail), los correos
 * ORIGINALES que viajan adentro como adjuntos message/rfc822 (.eml).
 *
 * Un solo correo puede traer sesenta avisos del banco: es la forma de cargar el
 * historial sin reenviar uno por uno. Cada adjunto se devuelve como un mensaje
 * propio con SU remitente, asunto, fecha y cuerpo; el dueño se resuelve por el
 * sobre del correo EXTERIOR (fue el que llegó a la dirección de ingesta), así
 * que quien lo llama copia recipients/envelopeTo del exterior a cada uno.
 *
 * Sin "server-only": se prueba con buffers MIME construidos a mano.
 */
import { simpleParser, type ParsedMail } from "mailparser";

/** Un correo ya decodificado, con lo que la ingesta necesita. */
export interface DecodedMail {
  messageId: string | null;
  from: string | null;
  subject: string | null;
  text: string;
  date: string | null; // ISO
  /** Correos originales adjuntos (.eml), ya decodificados. Vacío si no hay. */
  attached: DecodedMail[];
}

/** Quita etiquetas HTML y colapsa espacios (fallback cuando no hay text/plain).
 *  Los bloques <style>/<script>/<head> se descartan enteros: su contenido no es
 *  texto del correo (los estados de cuenta de BAC llegan con hojas de estilo). */
export function stripHtml(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\s*(br|\/p|\/div|\/tr|\/li|\/h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function bodyText(parsed: ParsedMail): string {
  const plain = (parsed.text ?? "").trim();
  if (plain) return plain;
  return parsed.html ? stripHtml(parsed.html) : "";
}

function isAttachedMail(a: { contentType?: string; filename?: string }): boolean {
  const ct = (a.contentType ?? "").toLowerCase();
  if (ct === "message/rfc822") return true;
  return /\.eml$/i.test(a.filename ?? "");
}

const MAX_ATTACHED = 200; // techo defensivo por correo

/**
 * Decodifica un RFC822 completo. Los adjuntos .eml se decodifican UN nivel
 * (un .eml dentro de un .eml no se abre: no es un caso real y evita bombas).
 */
export async function decodeMail(source: Buffer, depth = 0): Promise<DecodedMail> {
  const parsed = await simpleParser(source);
  const attached: DecodedMail[] = [];
  if (depth === 0) {
    for (const a of parsed.attachments ?? []) {
      if (attached.length >= MAX_ATTACHED) break;
      if (!isAttachedMail(a)) continue;
      try {
        attached.push(await decodeMail(a.content, depth + 1));
      } catch {
        // Un adjunto corrupto no invalida el resto del lote.
      }
    }
  }
  return {
    messageId: parsed.messageId ?? null,
    from: parsed.from?.value?.[0]?.address?.toLowerCase() ?? null,
    subject: parsed.subject ?? null,
    text: bodyText(parsed),
    date: parsed.date ? parsed.date.toISOString() : null,
    attached,
  };
}

/**
 * Clasifica un correo que llegó con dueño pero que ningún parser convirtió en
 * movimiento. Puro: testeable sin red.
 *
 * Dos casos que importan y que antes se perdían en silencio:
 *
 *  · La CONFIRMACIÓN DE REENVÍO de Gmail. Cuando el usuario agrega su dirección
 *    de ingesta como destino de reenvío, Google le manda a ESA dirección un correo
 *    con un enlace `…/mail/vf-<token>` (y a veces un código). Llega aquí, no al
 *    usuario. Se extrae el enlace para mostrárselo en la app. El enlace gemelo
 *    con prefijo `uf-` CANCELA el reenvío: nunca se ofrece.
 *  · Un aviso de un banco que todavía no sabemos leer. Se guarda un recorte del
 *    texto: es la materia prima para escribir el parser que falta.
 */
import type { ImapMessage } from "@/lib/ingestion/email/imap-poller";

export type IngestNoticeKind = "gmail_forwarding" | "unparsed";

export interface IngestNotice {
  kind: IngestNoticeKind;
  fromAddress: string;
  subject: string;
  snippet: string;
  confirmUrl: string | null;
  confirmCode: string | null;
  messageId: string;
}

const SNIPPET_MAX = 4000;
const GMAIL_FORWARDING_FROM = /forwarding-noreply@google\.com$/i;
const GMAIL_FORWARDING_SUBJECT = /forwarding confirmation|confirmaci[oó]n de reenv[ií]o/i;
// Solo el enlace de CONFIRMAR (vf-). El de cancelar es uf- y no se toca.
const CONFIRM_URL_RE = /https:\/\/mail(?:-settings)?\.google\.com\/mail\/vf-[A-Za-z0-9_\-%.]+/;

/** ¿Es la confirmación de reenvío de Gmail? Por remitente o por asunto. */
export function isGmailForwardingConfirmation(
  message: Pick<ImapMessage, "from" | "subject">,
): boolean {
  return GMAIL_FORWARDING_FROM.test(message.from) || GMAIL_FORWARDING_SUBJECT.test(message.subject);
}

/** Construye el aviso a guardar para un correo con dueño y sin movimientos. */
export function buildNotice(message: ImapMessage): IngestNotice {
  const snippet = message.text.slice(0, SNIPPET_MAX);
  if (isGmailForwardingConfirmation(message)) {
    const url = message.text.match(CONFIRM_URL_RE)?.[0] ?? null;
    // El código de 8-9 dígitos viaja en el asunto: "(#123456789)".
    const code = message.subject.match(/\b(\d{8,9})\b/)?.[1] ?? null;
    return {
      kind: "gmail_forwarding",
      fromAddress: message.from,
      subject: message.subject,
      snippet,
      confirmUrl: url,
      confirmCode: code,
      messageId: message.id,
    };
  }
  return {
    kind: "unparsed",
    fromAddress: message.from,
    subject: message.subject,
    snippet,
    confirmUrl: null,
    confirmCode: null,
    messageId: message.id,
  };
}

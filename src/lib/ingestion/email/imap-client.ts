import "server-only";

/**
 * Adaptador IMAP real (imapflow) detrás de una factory. Es el ÚNICO punto que
 * importa imapflow; la lógica de ingesta (imap-poller.ts) opera sobre la interfaz
 * `ImapClient` y se prueba con un fake. Sin sesión de usuario: lo dispara el cron.
 */
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import {
  extractRecipientCandidates,
  type ImapClient,
  type RawImapMessage,
} from "@/lib/ingestion/email/imap-poller";

/** ¿Están las credenciales del buzón de ingesta? Si no, el poller se omite. */
export function isEmailIngestConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.GMAIL_IMAP_USER && env.GMAIL_IMAP_APP_PASSWORD);
}

/**
 * Cuerpo DECODIFICADO de un correo MIME, vía mailparser: resuelve
 * quoted-printable/base64/multipart. Prefiere text/plain; si no hay, deriva del
 * HTML. Esto arregla las notificaciones de BAC que llegaban en quoted-printable.
 */
async function extractBodyText(source: Buffer): Promise<string> {
  const parsed = await simpleParser(source);
  const plain = (parsed.text ?? "").trim();
  if (plain) return plain;
  return parsed.html ? stripHtml(parsed.html) : "";
}

/** Devuelve el bloque de cabeceras de un RFC822 (todo antes del primer renglón
 *  en blanco). Las cabeceras de reenvío (Delivered-To, X-Forwarded-For/To) viven
 *  aquí, no en el envelope de IMAP. */
function headerBlock(source: Buffer): string {
  const raw = source.toString("utf8");
  const sep = raw.search(/\r?\n\r?\n/);
  return sep >= 0 ? raw.slice(0, sep) : raw;
}

/** Quita etiquetas HTML y colapsa espacios (fallback cuando no hay text/plain). */
function stripHtml(html: string): string {
  return html
    .replace(/<\s*(br|\/p|\/div|\/tr|\/li)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Crea el cliente IMAP real. Abre INBOX y expone listUnseen/markSeen/close sobre
 * la interfaz testeable. Lanza si faltan credenciales (el route comprueba antes
 * con isEmailIngestConfigured y se omite con gracia).
 */
export async function createImapClient(): Promise<ImapClient> {
  const env = getServerEnv();
  if (!env.GMAIL_IMAP_USER || !env.GMAIL_IMAP_APP_PASSWORD) {
    throw new AppError("INTERNAL", undefined, "IMAP de ingesta no configurado");
  }

  const flow = new ImapFlow({
    host: env.GMAIL_IMAP_HOST,
    port: 993,
    secure: true,
    auth: { user: env.GMAIL_IMAP_USER, pass: env.GMAIL_IMAP_APP_PASSWORD },
    logger: false,
  });

  await flow.connect();
  await flow.mailboxOpen("INBOX");

  return {
    async listUnseen(): Promise<RawImapMessage[]> {
      const out: RawImapMessage[] = [];
      // El destinatario original no está en el envelope: viaja en cabeceras del
      // reenvío (Delivered-To, X-Forwarded-For/To). Se extraen del header block del
      // source completo (más robusto que el campo `headers` de imapflow) y se
      // combinan con el To del envelope.
      for await (const msg of flow.fetch(
        { seen: false },
        { uid: true, envelope: true, source: true },
      )) {
        const to = (msg.envelope?.to ?? [])
          .map((a) => a.address?.toLowerCase())
          .filter((a): a is string => Boolean(a));
        const fromHeaders = msg.source ? extractRecipientCandidates(headerBlock(msg.source)) : [];
        const recipients = [...new Set([...to, ...fromHeaders])]; // dedup, ya en minúsculas
        out.push({
          uid: msg.uid,
          messageId: msg.envelope?.messageId ?? null,
          from: msg.envelope?.from?.[0]?.address ?? null,
          recipients,
          subject: msg.envelope?.subject ?? null,
          text: msg.source ? await extractBodyText(msg.source) : "",
        });
      }
      return out;
    },
    async markSeen(uid: number): Promise<void> {
      await flow.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
    },
    async close(): Promise<void> {
      await flow.logout();
    },
  };
}

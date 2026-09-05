import "server-only";

/**
 * Adaptador IMAP real (imapflow) detrás de una factory. Es el ÚNICO punto que
 * importa imapflow; la lógica de ingesta (imap-poller.ts) opera sobre la interfaz
 * `ImapClient` y se prueba con un fake. Sin sesión de usuario: lo dispara el cron.
 */
import { ImapFlow } from "imapflow";
import { decodeMail } from "@/lib/ingestion/email/mime";
import { getServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import {
  extractEnvelopeCandidates,
  extractRecipientCandidates,
  fromIsAuthenticated,
  type ImapClient,
  type RawImapMessage,
} from "@/lib/ingestion/email/imap-poller";

/** ¿Están las credenciales del buzón de ingesta? Si no, el poller se omite. */
export function isEmailIngestConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.GMAIL_IMAP_USER && env.GMAIL_IMAP_APP_PASSWORD);
}

/** Devuelve el bloque de cabeceras de un RFC822 (todo antes del primer renglón
 *  en blanco). Las cabeceras de reenvío (Delivered-To, X-Forwarded-For/To) viven
 *  aquí, no en el envelope de IMAP. */
function headerBlock(source: Buffer): string {
  const raw = source.toString("utf8");
  const sep = raw.search(/\r?\n\r?\n/);
  return sep >= 0 ? raw.slice(0, sep) : raw;
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

  // Google muestra los App Passwords en grupos con espacios ("abcd efgh ijkl mnop") y la gente los
  // pega tal cual; con espacios el LOGIN da AUTHENTICATIONFAILED. Stripeamos TODO whitespace para
  // ser robustos con o sin espacios.
  const pass = env.GMAIL_IMAP_APP_PASSWORD.replace(/\s/g, "");

  const flow = new ImapFlow({
    host: env.GMAIL_IMAP_HOST,
    port: 993,
    secure: true,
    auth: { user: env.GMAIL_IMAP_USER, pass },
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
        const headers = msg.source ? headerBlock(msg.source) : "";
        const fromHeaders = headers ? extractRecipientCandidates(headers) : [];
        const recipients = [...new Set([...to, ...fromHeaders])]; // dedup, ya en minúsculas
        const from = msg.envelope?.from?.[0]?.address ?? null;
        // Lo que estampó el receptor al entregar: con el catch-all del
        // subdominio, aquí viaja la dirección de ingesta única de la cuenta.
        const envelopeTo = headers ? extractEnvelopeCandidates(headers) : [];
        // ¿Nuestro buzón validó DKIM/SPF para ese From? Sin esto, el remitente
        // es una afirmación del que manda y no puede valer como identidad.
        const fromAuthenticated = Boolean(from) && fromIsAuthenticated(headers, from!);
        const decoded = msg.source ? await decodeMail(msg.source) : null;
        const receivedAt = msg.envelope?.date
          ? new Date(msg.envelope.date).toISOString()
          : (decoded?.date ?? null);

        // «Reenviar como archivo adjunto»: cada .eml adentro es un aviso del banco
        // con vida propia (su Message-ID, su fecha, su cuerpo). El dueño es el del
        // correo exterior (llegó a la dirección de ingesta), por eso heredan
        // recipients/envelopeTo. Comparten el uid: markSeen es idempotente.
        if (decoded && decoded.attached.length > 0) {
          decoded.attached.forEach((inner, i) => {
            out.push({
              uid: msg.uid,
              messageId: inner.messageId ?? `${msg.envelope?.messageId ?? `uid:${msg.uid}`}#${i}`,
              from: inner.from ?? from,
              recipients,
              envelopeTo,
              fromAuthenticated: false, // el interior no lo autenticó nadie
              subject: inner.subject,
              text: inner.text,
              // La fecha del aviso original, no la del reenvío: es la que fecha el gasto.
              receivedAt: inner.date ?? receivedAt,
            });
          });
          continue;
        }

        out.push({
          uid: msg.uid,
          messageId: msg.envelope?.messageId ?? null,
          from,
          recipients,
          envelopeTo,
          fromAuthenticated,
          subject: msg.envelope?.subject ?? null,
          text: decoded?.text ?? "",
          // envelope.date (cabecera Date del correo) como instante ISO. Fallback de occurred_on
          // cuando el cuerpo no trae fecha parseable (imapflow lo entrega como Date).
          receivedAt,
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

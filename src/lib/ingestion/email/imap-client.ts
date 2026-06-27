import "server-only";

/**
 * Adaptador IMAP real (imapflow) detrás de una factory. Es el ÚNICO punto que
 * importa imapflow; la lógica de ingesta (imap-poller.ts) opera sobre la interfaz
 * `ImapClient` y se prueba con un fake. Sin sesión de usuario: lo dispara el cron.
 */
import { ImapFlow } from "imapflow";
import { getServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { ImapClient, RawImapMessage } from "@/lib/ingestion/email/imap-poller";

/** ¿Están las credenciales del buzón de ingesta? Si no, el poller se omite. */
export function isEmailIngestConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.GMAIL_IMAP_USER && env.GMAIL_IMAP_APP_PASSWORD);
}

/**
 * Decodificación best-effort de un correo MIME a texto plano. Suficiente para las
 * notificaciones de banco reenviadas (el parser BAC usa anclas tolerantes). Sin
 * dependencias extra; Delta 2 puede cambiar a `mailparser` si hace falta robustez.
 */
function mimeToText(source: Buffer): string {
  const raw = source.toString("utf8");
  // Separa cabeceras del cuerpo (primer renglón en blanco).
  const sep = raw.search(/\r?\n\r?\n/);
  const headers = sep >= 0 ? raw.slice(0, sep) : "";
  let body = sep >= 0 ? raw.slice(sep).replace(/^\r?\n\r?\n/, "") : raw;

  const boundary = headers.match(/boundary="?([^";\r\n]+)"?/i)?.[1];
  if (boundary) {
    // Multipart: prefiere la parte text/plain; si no hay, cae a text/html.
    const parts = body.split(`--${boundary}`);
    const plain = parts.find((p) => /content-type:\s*text\/plain/i.test(p));
    const html = parts.find((p) => /content-type:\s*text\/html/i.test(p));
    const chosen = plain ?? html;
    if (chosen) {
      const cut = chosen.search(/\r?\n\r?\n/);
      const partHeaders = cut >= 0 ? chosen.slice(0, cut) : "";
      let partBody = cut >= 0 ? chosen.slice(cut).replace(/^\r?\n\r?\n/, "") : chosen;
      partBody = decodeBody(partBody, partHeaders);
      return plain ? partBody.trim() : stripHtml(partBody);
    }
  }

  body = decodeBody(body, headers);
  return /content-type:\s*text\/html/i.test(headers) ? stripHtml(body) : body.trim();
}

/** Aplica el Content-Transfer-Encoding declarado (quoted-printable / base64). */
function decodeBody(body: string, headers: string): string {
  const cte = headers.match(/content-transfer-encoding:\s*([\w-]+)/i)?.[1]?.toLowerCase();
  if (cte === "base64") {
    try {
      return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
    } catch {
      return body;
    }
  }
  if (cte === "quoted-printable") {
    return body
      .replace(/=\r?\n/g, "") // soft line breaks
      .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }
  return body;
}

// Cabeceras que con auto-forward de Gmail llevan el DESTINATARIO ORIGINAL del
// correo reenviado. Se piden varias porque su presencia exacta varía; se matchea
// contra cualquier candidato. Tras desplegar revisamos un correo real y afinamos.
const RECIPIENT_HEADERS = /^(delivered-to|x-forwarded-for|x-forwarded-to):/i;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/**
 * Extrae todas las direcciones de email de las cabeceras de destinatario original
 * (Delivered-To apiladas, X-Forwarded-For/To). En minúsculas. Maneja líneas
 * plegadas (continuación con espacio inicial) heredando la última cabecera vista.
 */
function parseRecipientCandidates(headers: Buffer): string[] {
  const out: string[] = [];
  let inRecipientHeader = false;
  for (const line of headers.toString("utf8").split(/\r?\n/)) {
    const isContinuation = /^\s/.test(line);
    if (!isContinuation) inRecipientHeader = RECIPIENT_HEADERS.test(line);
    if (!inRecipientHeader) continue;
    const matches = line.match(EMAIL_RE);
    if (matches) for (const m of matches) out.push(m.toLowerCase());
  }
  return out;
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
      // reenvío. Se piden aparte y se combinan con el To para armar candidatos.
      for await (const msg of flow.fetch(
        { seen: false },
        {
          uid: true,
          envelope: true,
          source: true,
          headers: ["delivered-to", "x-forwarded-for", "x-forwarded-to"],
        },
      )) {
        const to = (msg.envelope?.to ?? [])
          .map((a) => a.address?.toLowerCase())
          .filter((a): a is string => Boolean(a));
        const fromHeaders = msg.headers ? parseRecipientCandidates(msg.headers) : [];
        const recipients = [...new Set([...to, ...fromHeaders])]; // dedup, ya en minúsculas
        out.push({
          uid: msg.uid,
          messageId: msg.envelope?.messageId ?? null,
          from: msg.envelope?.from?.[0]?.address ?? null,
          recipients,
          subject: msg.envelope?.subject ?? null,
          text: msg.source ? mimeToText(msg.source) : "",
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

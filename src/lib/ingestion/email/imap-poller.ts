/**
 * Poller de ingesta por correo (IMAP), PURO y testeable.
 *
 * El cliente IMAP real (imapflow) vive detrás de una factory en `imap-client.ts`;
 * aquí no se importa imapflow. Esto permite probar `fetchUnseen` y
 * `processInboundEmails` con un cliente y dependencias falsas, sin red ni BD.
 *
 * Este delta NO entrega nada al usuario: solo identifica al remitente, deduplica,
 * parsea y deja la propuesta en cola (ingest_proposals, status 'pending'). La
 * entrega/confirmación es el Delta 2. Nada se confirma solo.
 */
import type { RawMovement } from "@/lib/ingestion/types";

/** Correo crudo tal como lo entrega el cliente IMAP (antes de normalizar). */
export interface RawImapMessage {
  uid: number;
  messageId: string | null; // header Message-ID; clave de idempotencia preferida
  from: string | null; // dirección del remitente (puede venir con nombre)
  recipients: string[]; // candidatos de destinatario original (To + cabeceras de reenvío)
  subject: string | null;
  text: string; // cuerpo en texto plano (el adaptador real lo extrae del MIME)
}

/**
 * Cliente IMAP mínimo sobre el que opera el poller. El adaptador real (imapflow)
 * lo implementa; los tests pasan un fake. `markSeen`/`close` los usa el route.
 */
export interface ImapClient {
  listUnseen(): Promise<RawImapMessage[]>;
  markSeen(uid: number): Promise<void>;
  close(): Promise<void>;
}

/** Correo normalizado que consume la lógica de ingesta. */
export interface ImapMessage {
  id: string; // messageId, o `uid:<n>` si el correo no trae Message-ID
  from: string; // remitente en minúsculas, solo la dirección
  recipients: string[]; // candidatos de destinatario original, en minúsculas, sin duplicados
  subject: string;
  text: string;
  uid: number; // se conserva para que el route marque \Seen tras procesar
}

/** Extrae "user@dom.com" de una dirección tipo `Nombre <user@dom.com>` o cruda. */
function extractAddress(addr: string | null): string {
  if (!addr) return "";
  const angle = addr.match(/<([^>]+)>/);
  return (angle ? angle[1]! : addr).trim().toLowerCase();
}

// Cabeceras que pueden cargar el DESTINATARIO ORIGINAL de un correo reenviado por
// Gmail. Se barren varias porque su presencia exacta varía según el reenvío; se
// matchea contra cualquier candidato. Regex estático (sin ReDoS).
const RECIPIENT_HEADER_RE =
  /^(to|cc|delivered-to|x-forwarded-for|x-forwarded-to|x-original-to|x-gm-original-to)$/i;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/**
 * Extrae las direcciones de email de las cabeceras de destinatario de un bloque de
 * cabeceras crudo (el header block de un RFC822). Despliega líneas plegadas
 * (continuación con espacio/tab inicial). Devuelve direcciones en minúsculas, sin
 * duplicados. Puro: testeable sin red.
 */
export function extractRecipientCandidates(rawHeaders: string): string[] {
  // Unfolding: una línea que empieza con espacio/tab continúa la cabecera anterior.
  const unfolded: string[] = [];
  for (const line of rawHeaders.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && unfolded.length) {
      unfolded[unfolded.length - 1] += " " + line.trim();
    } else {
      unfolded.push(line);
    }
  }
  const out = new Set<string>();
  for (const line of unfolded) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    if (!RECIPIENT_HEADER_RE.test(line.slice(0, colon).trim())) continue;
    const matches = line.slice(colon + 1).match(EMAIL_RE);
    if (matches) for (const m of matches) out.add(m.toLowerCase());
  }
  return [...out];
}

/**
 * Trae los correos no leídos del buzón y los normaliza a `ImapMessage`. NO marca
 * nada como leído: eso queda para el route, tras procesar con éxito. Descarta
 * correos sin remitente o sin cuerpo (no hay nada que parsear).
 *
 * Los candidatos de identificación incluyen los destinatarios (To + cabeceras de
 * reenvío) Y el remitente (From): en un reenvío MANUAL el usuario queda en From,
 * así que sumarlo permite identificarlo igual. `from` se sigue exponiendo aparte.
 */
export async function fetchUnseen(client: ImapClient): Promise<ImapMessage[]> {
  const raw = await client.listUnseen();
  const out: ImapMessage[] = [];
  for (const m of raw) {
    const from = extractAddress(m.from);
    const text = m.text ?? "";
    if (!from || !text.trim()) continue;
    const recipients = (m.recipients ?? []).map(extractAddress).filter(Boolean);
    out.push({
      id: m.messageId ?? `uid:${m.uid}`,
      from,
      recipients: [...new Set([...recipients, from])], // + From para reenvío manual
      subject: m.subject ?? "",
      text,
      uid: m.uid,
    });
  }
  return out;
}

// ------------------------------------------------------------
// Orquestación (pura sobre dependencias inyectadas)
// ------------------------------------------------------------

/** Dueño resuelto de un correo (vía allowlist email_ingest_links). */
export interface EmailOwner {
  userId: string;
  householdId: string | null;
}

/**
 * Puertos que el route implementa con service-role + IMAP. Inyectarlos mantiene
 * la orquestación pura y testeable sin BD.
 */
export interface EmailIngestDeps {
  /** Resuelve el dueño por destinatario original: el primer candidato cuyo
   *  forwarder_email esté en la allowlist. null => ningún candidato conocido. */
  lookupOwner(candidates: string[]): Promise<EmailOwner | null>;
  /** ¿Este correo (por id) ya se procesó? (processed_events). */
  isProcessed(eventId: string): Promise<boolean>;
  /** Registra el correo como procesado (processed_events). */
  markProcessed(eventId: string): Promise<void>;
  /** Inserta las propuestas en cola. Devuelve cuántas se insertaron y cuántas
   *  chocaron con el único (cuenta, external_ref) — la misma compra en 2 correos. */
  saveProposals(
    movements: RawMovement[],
    owner: EmailOwner,
  ): Promise<{ inserted: number; duplicated: number }>;
  /** Marca el correo como leído en el buzón (best-effort). */
  markSeen(message: ImapMessage): Promise<void>;
}

/** Resumen de una corrida del poller. */
export interface IngestSummary {
  procesados: number; // forwarder conocido y consumido (parseado + marcado)
  propuestos: number; // propuestas insertadas en ingest_proposals
  ignorados: number; // ningún candidato de destinatario está en la allowlist
  duplicados: number; // correo ya procesado (por id) o propuesta repetida (cuenta, ref)
}

/**
 * Procesa los correos no leídos ya normalizados. Por cada correo:
 *  a) identifica al dueño por el DESTINATARIO ORIGINAL: alguno de los candidatos
 *     (To + cabeceras de reenvío) debe coincidir con un forwarder_email de la
 *     allowlist; si ninguno coincide, lo ignora.
 *  b) dedup: si su id ya está en processed_events, lo salta.
 *  c) parsea con parseNotification (inyectado); si no hay movimiento, lo marca
 *     procesado igual y sigue (no es una notificación de banco).
 *  d) inserta las propuestas en 'pending' (idempotente por external_ref).
 *  e) registra processed_events(id) y marca el correo como leído.
 * No confirma ni crea transacciones: solo deja propuestas en cola.
 */
export async function processInboundEmails(
  messages: ImapMessage[],
  parse: (text: string) => RawMovement[],
  deps: EmailIngestDeps,
): Promise<IngestSummary> {
  const summary: IngestSummary = { procesados: 0, propuestos: 0, ignorados: 0, duplicados: 0 };

  for (const message of messages) {
    // a) Identificación por destinatario original (con auto-forward el From es del
    //    banco). Sin candidato conocido => ignorar (sin marcar leído ni procesado,
    //    por si luego se agrega su forwarder a la allowlist y reenvía de nuevo).
    const owner = await deps.lookupOwner(message.recipients);
    if (!owner) {
      summary.ignorados += 1;
      continue;
    }

    // b) Dedup por id de correo.
    if (await deps.isProcessed(message.id)) {
      summary.duplicados += 1;
      continue;
    }

    // c) Parseo. Sin movimiento => no es notificación: se marca procesado y leído.
    const movements = parse(message.text);
    if (movements.length > 0) {
      // d) Encolar propuestas. Los choques (cuenta, external_ref) — la misma compra
      //    llegada a 2 correos — cuentan como duplicados, no como propuestas.
      const { inserted, duplicated } = await deps.saveProposals(movements, owner);
      summary.propuestos += inserted;
      summary.duplicados += duplicated;
    }

    // e) Cerrar el correo: procesado + leído.
    await deps.markProcessed(message.id);
    await deps.markSeen(message);
    summary.procesados += 1;
  }

  return summary;
}

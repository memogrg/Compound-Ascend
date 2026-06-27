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
  recipients: string[]; // direcciones de To + Delivered-To (pueden venir con nombre)
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
  recipients: string[]; // destinatarios (To + Delivered-To) en minúsculas
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

/**
 * Con auto-forward de Gmail el From es del banco, así que se identifica por el
 * DESTINATARIO via plus-addressing. Deriva base+dominio de GMAIL_IMAP_USER
 * (p. ej. "communications" y "aitechumbrella.com") y devuelve, de los
 * destinatarios, la dirección completa que matchee `base+<token>@dominio`
 * (en minúsculas). null si ninguno calza.
 */
export function matchIngestAlias(recipients: string[], imapUser: string): string | null {
  const at = imapUser.indexOf("@");
  if (at <= 0) return null;
  const base = imapUser.slice(0, at).toLowerCase();
  const domain = imapUser.slice(at + 1).toLowerCase();
  const prefix = `${base}+`;
  // Parsing de strings (sin RegExp dinámico) para evitar ReDoS: localpart debe
  // ser `base+<token>` con token no vacío y el dominio debe coincidir exacto.
  for (const raw of recipients) {
    const addr = extractAddress(raw);
    const a = addr.indexOf("@");
    if (a <= 0) continue;
    const local = addr.slice(0, a);
    const dom = addr.slice(a + 1);
    if (dom === domain && local.startsWith(prefix) && local.length > prefix.length) {
      return addr;
    }
  }
  return null;
}

/**
 * Trae los correos no leídos del buzón y los normaliza a `ImapMessage`. NO marca
 * nada como leído: eso queda para el route, tras procesar con éxito. Descarta
 * correos sin remitente o sin cuerpo (no hay nada que parsear).
 */
export async function fetchUnseen(client: ImapClient): Promise<ImapMessage[]> {
  const raw = await client.listUnseen();
  const out: ImapMessage[] = [];
  for (const m of raw) {
    const from = extractAddress(m.from);
    const text = m.text ?? "";
    if (!from || !text.trim()) continue;
    out.push({
      id: m.messageId ?? `uid:${m.uid}`,
      from,
      recipients: (m.recipients ?? []).map(extractAddress).filter(Boolean),
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
  /** Resuelve el dueño por alias de ingesta (allowlist). null => alias desconocido. */
  lookupOwner(ingestAlias: string): Promise<EmailOwner | null>;
  /** ¿Este correo (por id) ya se procesó? (processed_events). */
  isProcessed(eventId: string): Promise<boolean>;
  /** Registra el correo como procesado (processed_events). */
  markProcessed(eventId: string): Promise<void>;
  /** Inserta las propuestas en cola; devuelve cuántas se insertaron de verdad
   *  (las que chocan con el único (household_id, external_ref) no cuentan). */
  saveProposals(movements: RawMovement[], owner: EmailOwner): Promise<number>;
  /** Marca el correo como leído en el buzón (best-effort). */
  markSeen(message: ImapMessage): Promise<void>;
}

/** Resumen de una corrida del poller. Cada correo cae en una sola categoría. */
export interface IngestSummary {
  procesados: number; // alias conocido y consumido (parseado + marcado)
  propuestos: number; // propuestas insertadas en ingest_proposals
  ignorados: number; // sin alias de ingesta o alias no en la allowlist
  duplicados: number; // correo ya procesado antes (dedup por id)
}

/**
 * Procesa los correos no leídos ya normalizados. Por cada correo:
 *  a) identifica al dueño por el alias de DESTINATARIO (plus-addressing derivado
 *     de imapUser); si no hay alias o no está en la allowlist, lo ignora.
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
  imapUser: string,
  deps: EmailIngestDeps,
): Promise<IngestSummary> {
  const summary: IngestSummary = { procesados: 0, propuestos: 0, ignorados: 0, duplicados: 0 };

  for (const message of messages) {
    // a) Identificación por destinatario (con auto-forward el From es del banco).
    //    Sin alias o alias desconocido => ignorar (sin marcar leído ni procesado,
    //    por si luego se agrega a la allowlist y se reenvía).
    const alias = matchIngestAlias(message.recipients, imapUser);
    const owner = alias ? await deps.lookupOwner(alias) : null;
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
      // d) Encolar propuestas (idempotente por external_ref a nivel de BD).
      summary.propuestos += await deps.saveProposals(movements, owner);
    }

    // e) Cerrar el correo: procesado + leído.
    await deps.markProcessed(message.id);
    await deps.markSeen(message);
    summary.procesados += 1;
  }

  return summary;
}

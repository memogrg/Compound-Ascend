/**
 * Poller de ingesta por correo (IMAP), PURO y testeable.
 *
 * El cliente IMAP real (imapflow) vive detrás de una factory en `imap-client.ts`;
 * aquí no se importa imapflow. Esto permite probar `fetchUnseen` y
 * `processInboundEmails` con un cliente y dependencias falsas, sin red ni BD.
 *
 * Nada se confirma solo: el poller identifica al dueño, deduplica, parsea y deja
 * la propuesta en cola (ingest_proposals, 'pending'). La confirmación es del usuario.
 *
 * IDENTIFICAR AL DUEÑO ES LA PARTE DELICADA. Un correo lo escribe quien lo manda,
 * así que sus cabeceras son afirmaciones, no pruebas. Por eso hay dos niveles:
 *
 *   1. Destinatarios (To/Cc + cabeceras de reenvío). Es lo que funciona con el
 *      auto-forward, donde el From es del banco.
 *   2. El remitente, PERO solo si el correo viene autenticado (DKIM o SPF
 *      alineados con esa dirección). Cubre el reenvío manual —donde el usuario
 *      queda en el From— sin aceptar un From falsificado: quien manda un correo
 *      diciendo `From: victima@gmail.com` desde su propio servidor no pasa DKIM
 *      de gmail.com y no se le acepta la identidad.
 *
 * Y ante duda, no se adivina: si los candidatos apuntan a DOS cuentas distintas,
 * el correo se deja sin procesar (`ambiguos`) en vez de caer en una al azar.
 * La solución definitiva es la dirección de ingesta única por usuario (el
 * destinatario pasa a SER la identidad); esto es el blindaje del camino actual.
 */
import type { RawMovement } from "@/lib/ingestion/types";
import { todayISOInTz } from "@/lib/time/user-time-core";

/** Zona por defecto cuando el correo no trae fecha parseable y el dueño no tiene tz guardada.
 *  Los bancos que reenvían aquí son de Costa Rica → su fecha local es la sensata. */
const DEFAULT_INGEST_TZ = "America/Costa_Rica";

/** Correo crudo tal como lo entrega el cliente IMAP (antes de normalizar). */
export interface RawImapMessage {
  uid: number;
  messageId: string | null; // header Message-ID; clave de idempotencia preferida
  from: string | null; // dirección del remitente (puede venir con nombre)
  recipients: string[]; // candidatos de destinatario original (To + cabeceras de reenvío)
  subject: string | null;
  text: string; // cuerpo en texto plano (el adaptador real lo extrae del MIME)
  receivedAt: string | null; // fecha del correo (envelope.date) en ISO; fallback de occurred_on
  fromAuthenticated: boolean; // DKIM/SPF del buzón receptor respaldan ese From
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
  recipients: string[]; // candidatos de destinatario, en minúsculas, sin duplicados
  senderCandidates: string[]; // el From, SOLO si vino autenticado; si no, vacío
  subject: string;
  text: string;
  uid: number; // se conserva para que el route marque \Seen tras procesar
  receivedAt: string | null; // fecha del correo (envelope.date) en ISO; fallback de occurred_on
}

/** Extrae "user@dom.com" de una dirección tipo `Nombre <user@dom.com>` o cruda. */
function extractAddress(addr: string | null): string {
  if (!addr) return "";
  const angle = addr.match(/<([^>]+)>/);
  return (angle ? angle[1]! : addr).trim().toLowerCase();
}

// Cabeceras que pueden cargar el DESTINATARIO ORIGINAL de un correo reenviado.
// Se barren varias porque su presencia exacta varía según el proveedor y el modo
// de reenvío. Regex estático (sin ReDoS).
const RECIPIENT_HEADER_RE =
  /^(to|cc|delivered-to|x-forwarded-for|x-forwarded-to|x-original-to|x-gm-original-to)$/i;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/** Despliega las líneas plegadas de un bloque de cabeceras (RFC 5322 unfolding). */
function unfold(rawHeaders: string): string[] {
  const out: string[] = [];
  for (const line of rawHeaders.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && out.length) {
      out[out.length - 1] += " " + line.trim();
    } else {
      out.push(line);
    }
  }
  return out;
}

/**
 * Extrae las direcciones de email de las cabeceras de destinatario de un bloque de
 * cabeceras crudo. Devuelve direcciones en minúsculas, sin duplicados.
 * Puro: testeable sin red.
 */
export function extractRecipientCandidates(rawHeaders: string): string[] {
  const out = new Set<string>();
  for (const line of unfold(rawHeaders)) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    if (!RECIPIENT_HEADER_RE.test(line.slice(0, colon).trim())) continue;
    const matches = line.slice(colon + 1).match(EMAIL_RE);
    if (matches) for (const m of matches) out.add(m.toLowerCase());
  }
  return [...out];
}

/**
 * ¿El buzón receptor respalda que este correo lo mandó de verdad esa dirección?
 *
 * Lee la cabecera `Authentication-Results` que estampa NUESTRO servidor de correo
 * al recibir (no la del emisor, y NUNCA `ARC-Authentication-Results`, que es la
 * afirmación de un tercero) y acepta el From si:
 *   · `dkim=pass` con `header.d`/`header.i` del mismo dominio del From, o
 *   · `spf=pass` con `smtp.mailfrom` igual a la dirección del From.
 *
 * Un correo falsificado (`From: victima@gmail.com` mandado desde otro servidor) no
 * consigue ninguna de las dos. Puro: testeable sin red.
 */
export function fromIsAuthenticated(rawHeaders: string, from: string): boolean {
  const addr = extractAddress(from);
  const domain = addr.split("@")[1];
  if (!addr || !domain) return false;

  for (const line of unfold(rawHeaders)) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    if (line.slice(0, colon).trim().toLowerCase() !== "authentication-results") continue;
    const value = line.slice(colon + 1).toLowerCase();

    if (/\bdkim=pass\b/.test(value)) {
      const d = value.match(/header\.d=([a-z0-9.-]+)/);
      const i = value.match(/header\.i=@?([a-z0-9.-]+)/);
      const signer = d?.[1] ?? i?.[1];
      if (signer && (signer === domain || domain.endsWith("." + signer))) return true;
    }
    if (/\bspf=pass\b/.test(value)) {
      const mailfrom = value.match(/smtp\.mailfrom=([^\s;()]+)/);
      if (mailfrom?.[1] && mailfrom[1].replace(/^<|>$/g, "") === addr) return true;
    }
  }
  return false;
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
    const recipients = [...new Set((m.recipients ?? []).map(extractAddress).filter(Boolean))];
    out.push({
      id: m.messageId ?? `uid:${m.uid}`,
      from,
      recipients,
      // El From solo cuenta como identidad si el correo vino autenticado.
      senderCandidates: m.fromAuthenticated ? [from] : [],
      subject: m.subject ?? "",
      text,
      uid: m.uid,
      receivedAt: m.receivedAt,
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
  timezone: string | null; // tz del usuario (user_settings); fecha la propuesta en su zona (#90)
}

/**
 * Resultado de resolver al dueño. `ambiguous` NO es un detalle: es la diferencia
 * entre no hacer nada y meterle el gasto de alguien a otra persona.
 */
export type OwnerLookup =
  | { status: "found"; owner: EmailOwner }
  | { status: "none" }
  | { status: "ambiguous"; cuentas: number };

/**
 * Puertos que el route implementa con service-role + IMAP. Inyectarlos mantiene
 * la orquestación pura y testeable sin BD.
 */
export interface EmailIngestDeps {
  /** Resuelve el dueño por candidatos. Devuelve `ambiguous` si apuntan a más de
   *  una cuenta: el poller entonces no procesa, no adivina. */
  lookupOwner(candidates: string[]): Promise<OwnerLookup>;
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
  procesados: number; // dueño resuelto y correo consumido (parseado + marcado)
  propuestos: number; // propuestas insertadas en ingest_proposals
  ignorados: number; // ningún candidato está en la allowlist
  duplicados: number; // correo ya procesado (por id) o propuesta repetida (cuenta, ref)
  ambiguos: number; // candidatos de DOS cuentas distintas: no se procesa, se alerta
  sinParsear: number; // dueño conocido pero ningún parser supo leer el correo
}

/**
 * Fecha una propuesta cuyo parser NO extrajo fecha del correo (occurredOn ""): usa la fecha de
 * RECEPCIÓN del email (receivedAt, de envelope.date) en la zona del usuario —consistente con #90—.
 * Sin receivedAt (raro: correo sin cabecera Date), último recurso hoy en esa zona. Nunca devuelve
 * "" → no rompe el insert (occurred_on es NOT NULL). La propuesta se REVISA antes de aplicarse.
 */
function fecharConReceivedAt(receivedAt: string | null, tz: string | null): string {
  const zona = tz ?? DEFAULT_INGEST_TZ;
  return todayISOInTz(zona, receivedAt ? new Date(receivedAt) : new Date());
}

/**
 * Resuelve al dueño en dos niveles: primero por destinatario (auto-forward),
 * y solo si ahí no hay nada, por el remitente autenticado (reenvío manual).
 * Una ambigüedad en el primer nivel corta: no se baja al segundo a buscar suerte.
 */
async function resolverDueno(message: ImapMessage, deps: EmailIngestDeps): Promise<OwnerLookup> {
  const porDestinatario = await deps.lookupOwner(message.recipients);
  if (porDestinatario.status !== "none") return porDestinatario;
  if (message.senderCandidates.length === 0) return { status: "none" };
  return deps.lookupOwner(message.senderCandidates);
}

/**
 * Procesa los correos no leídos ya normalizados. Por cada correo:
 *  a) resuelve al dueño (destinatario → remitente autenticado); si es ambiguo o
 *     desconocido, NO lo procesa ni lo marca leído.
 *  b) dedup: si su id ya está en processed_events, lo salta.
 *  c) parsea con parseNotification (inyectado); si no hay movimiento, lo cuenta
 *     como `sinParsear` (banco que todavía no sabemos leer) y lo cierra igual.
 *  d) inserta las propuestas en 'pending' (idempotente por external_ref).
 *  e) registra processed_events(id) y marca el correo como leído.
 */
export async function processInboundEmails(
  messages: ImapMessage[],
  parse: (text: string) => RawMovement[],
  deps: EmailIngestDeps,
): Promise<IngestSummary> {
  const summary: IngestSummary = {
    procesados: 0,
    propuestos: 0,
    ignorados: 0,
    duplicados: 0,
    ambiguos: 0,
    sinParsear: 0,
  };

  for (const message of messages) {
    // a) Identificación. Sin dueño claro no se toca el correo: se deja sin leer
    //    por si luego se agrega su reenviador a la allowlist y hay que releerlo.
    const lookup = await resolverDueno(message, deps);
    if (lookup.status === "ambiguous") {
      summary.ambiguos += 1;
      continue;
    }
    if (lookup.status === "none") {
      summary.ignorados += 1;
      continue;
    }
    const owner = lookup.owner;

    // b) Dedup por id de correo.
    if (await deps.isProcessed(message.id)) {
      summary.duplicados += 1;
      continue;
    }

    // c) Parseo.
    const movements = parse(message.text);
    if (movements.length > 0) {
      // Fecha faltante: si el parser no extrajo fecha (occurredOn ""), la propuesta moría en el
      // insert (occurred_on es NOT NULL). Fallback central a la fecha de recepción del correo en
      // la zona del usuario (no UTC-today → no reintroduce #90). Cubre todos los parsers.
      const conFecha = movements.map((m) =>
        m.occurredOn
          ? m
          : { ...m, occurredOn: fecharConReceivedAt(message.receivedAt, owner.timezone) },
      );
      // d) Encolar propuestas. Los choques (cuenta, external_ref) — la misma compra
      //    llegada a 2 correos — cuentan como duplicados, no como propuestas.
      const { inserted, duplicated } = await deps.saveProposals(conFecha, owner);
      summary.propuestos += inserted;
      summary.duplicados += duplicated;
    } else {
      // El dueño reenvió algo que ningún parser reconoce: hoy es un banco sin
      // plantilla. Se cuenta para que deje de ser una pérdida invisible.
      summary.sinParsear += 1;
    }

    // e) Cerrar el correo: procesado + leído.
    await deps.markProcessed(message.id);
    await deps.markSeen(message);
    summary.procesados += 1;
  }

  return summary;
}

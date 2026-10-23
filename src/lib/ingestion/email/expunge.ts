/**
 * Expurgo del buzón IMAP de ingesta: borra del buzón los correos con más de INGEST_RETENTION_DAYS,
 * leídos o no. Es la otra mitad de la retención de 30 días que promete la Política de privacidad
 * (§6/§8): la purga de `ingest_proposals`/`ingest_notices` (retention-service) cubre lo que
 * guardamos en la base; esto cubre el correo original, que el poller solo marca \Seen.
 *
 * PURO (sin imapflow ni "server-only"): opera sobre `ExpungeImap`, que el adaptador real
 * (imap-client.ts) implementa y los tests simulan.
 *
 * Por qué a la papelera y no \Deleted en INBOX: en Gmail, \Deleted + EXPUNGE en INBOX solo le
 * quita la etiqueta «Recibidos» y el correo sigue en «Todos los correos» para siempre. Así que:
 *
 *   1. La papelera se localiza por el atributo special-use `\Trash` del LIST — nunca por nombre:
 *      "[Gmail]/Papelera" o "[Gmail]/Trash" depende del idioma de la cuenta. Sin `\Trash` se
 *      ABORTA antes de tocar nada.
 *   2. Se eligen los vencidos con SEARCH BEFORE (INTERNALDATE) y se vuelve a filtrar cada uno por
 *      su INTERNALDATE exacto: BEFORE solo mira el día, y nada con menos de 30 días se toca.
 *   3. MOVE a la papelera (el adaptador cae a COPY + \Deleted + EXPUNGE sin MOVE) y, en la
 *      papelera, \Deleted + UID EXPUNGE de ESOS mismos mensajes, por el mapa de UIDs del MOVE.
 *      Sin mapa (servidor sin UIDPLUS) no se adivina qué borrar: quedan en la papelera.
 */
import { INGEST_RETENTION_DAYS, ingestRetentionCutoffISO } from "@/lib/ingestion/retention";

/** Carpetas que lee el poller (imap-client abre solo INBOX), y por tanto las que se expurgan. */
export const EXPUNGE_FOLDERS = ["INBOX"] as const;

/** UIDs por operación de MOVE: acota el tamaño del comando la primera vez, con meses de correo. */
export const EXPUNGE_BATCH = 500;

const TRASH = "\\Trash";

/** Lo mínimo del IMAP que necesita el expurgo. Todas las operaciones son por UID. */
export interface ExpungeImap {
  listMailboxes(): Promise<{ path: string; specialUse?: string | null }[]>;
  openMailbox(path: string): Promise<void>;
  /** UIDs de la carpeta abierta con INTERNALDATE anterior al DÍA dado (SEARCH BEFORE). */
  searchBefore(day: Date): Promise<number[]>;
  /** INTERNALDATE (ISO) de cada UID de la carpeta abierta; el que no venga, falta en el mapa. */
  internalDates(uids: number[]): Promise<Map<number, string>>;
  /** MOVE a `dest`. Devuelve el mapa UID origen → UID destino, o null si el servidor no lo da. */
  moveTo(uids: number[], dest: string): Promise<Map<number, number> | null>;
  /** \Deleted + UID EXPUNGE de esos UIDs en la carpeta abierta. */
  deleteForever(uids: number[]): Promise<void>;
}

export interface ExpungeFolderResult {
  folder: string;
  candidates: number;
  moved: number;
  expunged: number;
  dryRun: boolean;
  /** Solo en dry-run: lo que se borraría, para revisarlo a mano antes de activar. */
  muestras?: { uid: number; internalDate: string }[];
}

export type ExpungeReport =
  | { ok: true; dryRun: boolean; trash: string; folders: ExpungeFolderResult[] }
  | { ok: false; dryRun: boolean; error: string };

export interface ExpungeLogger {
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

/**
 * ¿Dry-run? Se borra de verdad SOLO con `INGEST_IMAP_EXPUNGE_ENABLED === "true"` y sin `dryRun`
 * en la petición. Cualquier otro valor de la env (ausente, vacía, "false", "1") es dry-run, y el
 * parámetro solo puede encenderlo: no hay parámetro que fuerce el borrado.
 */
export function resolveExpungeDryRun(
  enabledEnv: string | undefined,
  dryRunParam: string | null,
): boolean {
  if (enabledEnv !== "true") return true;
  return dryRunParam !== null;
}

function enLotes<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

export async function expungeExpiredMail(
  imap: ExpungeImap,
  opts: { dryRun: boolean; log: ExpungeLogger; nowMs?: number },
): Promise<ExpungeReport> {
  const { dryRun, log } = opts;
  const nowMs = opts.nowMs ?? Date.now();
  const cutoffISO = ingestRetentionCutoffISO(nowMs);
  const cutoffMs = Date.parse(cutoffISO);

  const trash = (await imap.listMailboxes()).find((m) => m.specialUse === TRASH);
  if (!trash) {
    const error = "no hay carpeta con special-use \\Trash: no se toca nada";
    log.error("ingest.imap.expunge abortado", { error, dryRun });
    return { ok: false, dryRun, error };
  }

  // BEFORE compara solo la fecha: el día UTC del corte deja afuera todo lo de ese día, y el filtro
  // por INTERNALDATE exacto de abajo es el que garantiza que nada con menos de 30 días entre.
  const dia = new Date(`${cutoffISO.slice(0, 10)}T00:00:00.000Z`);

  const folders: ExpungeFolderResult[] = [];
  for (const folder of EXPUNGE_FOLDERS) {
    if (folder === trash.path) continue;
    await imap.openMailbox(folder);
    const encontrados = await imap.searchBefore(dia);
    const fechas = encontrados.length ? await imap.internalDates(encontrados) : new Map();
    const vencidos = encontrados.filter((uid) => {
      const f = fechas.get(uid);
      return f !== undefined && Date.parse(f) < cutoffMs;
    });

    const r: ExpungeFolderResult = {
      folder,
      candidates: vencidos.length,
      moved: 0,
      expunged: 0,
      dryRun,
    };

    if (dryRun) {
      r.muestras = vencidos.map((uid) => ({ uid, internalDate: fechas.get(uid)! }));
    } else if (vencidos.length) {
      const destino: number[] = [];
      let sinMapa = false;
      for (const lote of enLotes(vencidos, EXPUNGE_BATCH)) {
        const mapa = await imap.moveTo(lote, trash.path);
        r.moved += lote.length;
        if (!mapa) {
          sinMapa = true;
          continue;
        }
        for (const uid of lote) {
          const d = mapa.get(uid);
          if (d !== undefined) destino.push(d);
        }
      }
      if (sinMapa) {
        log.warn("ingest.imap.expunge: el servidor no devolvió UIDs de destino", {
          folder,
          trash: trash.path,
          detalle: "los movidos sin mapa quedan en la papelera hasta que el servidor la vacíe",
        });
      }
      if (destino.length) {
        await imap.openMailbox(trash.path);
        for (const lote of enLotes(destino, EXPUNGE_BATCH)) await imap.deleteForever(lote);
        r.expunged = destino.length;
      }
    }

    log.info("ingest.imap.expunge", {
      folder: r.folder,
      candidates: r.candidates,
      moved: r.moved,
      expunged: r.expunged,
      dryRun: r.dryRun,
      ...(r.muestras ? { muestras: r.muestras } : {}),
      cutoff: cutoffISO,
      days: INGEST_RETENTION_DAYS,
    });
    folders.push(r);
  }

  return { ok: true, dryRun, trash: trash.path, folders };
}

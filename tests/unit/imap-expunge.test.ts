/**
 * Expurgo de retención del buzón IMAP (30 días, Política de privacidad §6/§8), contra un IMAP
 * simulado:
 *  1. Selección por INTERNALDATE: solo lo estrictamente más viejo que el corte, leído o no. Nada
 *     con menos de 30 días se toca aunque el SEARCH devuelva de más.
 *  2. Dry-run no mueve ni borra: cuenta y lista UIDs y fechas.
 *  3. Modo real: MOVE a la carpeta special-use \Trash (no por nombre) y \Deleted + EXPUNGE ahí de
 *     esos mismos mensajes, por el mapa de UIDs; lo demás de la papelera queda.
 *  4. Sin \Trash: aborta sin tocar nada.
 *  5. El flag: borra solo con INGEST_IMAP_EXPUNGE_ENABLED === "true" y sin dryRun.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect, vi } from "vitest";
import {
  expungeExpiredMail,
  resolveExpungeDryRun,
  type ExpungeImap,
} from "@/lib/ingestion/email/expunge";

const AHORA = Date.parse("2026-10-17T12:00:00.000Z"); // corte: 2026-09-17T12:00:00Z
const PAPELERA = "[Gmail]/Papelera";

type Correo = { internalDate: string; seen: boolean };

function imapSimulado(
  opts: {
    inbox?: Record<number, Correo>;
    papelera?: Record<number, Correo>;
    sinTrash?: boolean;
    sinUidPlus?: boolean;
    /** El SEARCH devuelve TODO, como un servidor que interpreta mal BEFORE. */
    searchMiente?: boolean;
  } = {},
) {
  const carpetas = new Map<string, Map<number, Correo>>([
    ["INBOX", new Map(Object.entries(opts.inbox ?? {}).map(([k, v]) => [Number(k), v]))],
    [PAPELERA, new Map(Object.entries(opts.papelera ?? {}).map(([k, v]) => [Number(k), v]))],
  ]);
  let abierta = "INBOX";
  let proximoUid = 9000;
  const ops: { op: string; folder: string; uids?: number[] }[] = [];

  const imap: ExpungeImap = {
    async listMailboxes() {
      return [
        { path: "INBOX", specialUse: null },
        { path: "[Gmail]/Enviados", specialUse: "\\Sent" },
        { path: PAPELERA, specialUse: opts.sinTrash ? null : "\\Trash" },
      ];
    },
    async openMailbox(p) {
      ops.push({ op: "open", folder: p });
      abierta = p;
    },
    async searchBefore(day) {
      const c = carpetas.get(abierta)!;
      return [...c.entries()]
        .filter(([, m]) => opts.searchMiente || Date.parse(m.internalDate) < day.getTime())
        .map(([uid]) => uid);
    },
    async internalDates(uids) {
      const c = carpetas.get(abierta)!;
      return new Map(uids.map((u) => [u, c.get(u)!.internalDate]));
    },
    async moveTo(uids, dest) {
      ops.push({ op: "move", folder: abierta, uids });
      const origen = carpetas.get(abierta)!;
      const destino = carpetas.get(dest)!;
      const mapa = new Map<number, number>();
      for (const u of uids) {
        const nuevo = proximoUid++;
        destino.set(nuevo, origen.get(u)!);
        origen.delete(u);
        mapa.set(u, nuevo);
      }
      return opts.sinUidPlus ? null : mapa;
    },
    async deleteForever(uids) {
      ops.push({ op: "delete", folder: abierta, uids });
      for (const u of uids) carpetas.get(abierta)!.delete(u);
    },
  };
  return { imap, ops, carpetas };
}

function logSimulado() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

// uid 1-2: vencidos (uno leído, otro no). uid 3: más viejo que el corte pero del MISMO día (BEFORE
// lo deja para mañana). uid 4-5: con menos de 30 días, uno ya procesado/leído.
const BUZON: Record<number, Correo> = {
  1: { internalDate: "2026-08-01T10:00:00.000Z", seen: true },
  2: { internalDate: "2026-09-16T23:00:00.000Z", seen: false },
  3: { internalDate: "2026-09-17T11:00:00.000Z", seen: true },
  4: { internalDate: "2026-09-20T08:00:00.000Z", seen: false },
  5: { internalDate: "2026-10-16T08:00:00.000Z", seen: true },
};

describe("expungeExpiredMail · selección", () => {
  it("elige por INTERNALDATE los vencidos, leídos o no", async () => {
    const { imap } = imapSimulado({ inbox: BUZON });
    const r = await expungeExpiredMail(imap, { dryRun: true, log: logSimulado(), nowMs: AHORA });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.folders[0]!.muestras!.map((m) => m.uid)).toEqual([1, 2]);
  });

  it("nunca toca algo con menos de 30 días, aunque el SEARCH devuelva de más", async () => {
    const { imap, ops, carpetas } = imapSimulado({ inbox: BUZON, searchMiente: true });
    const r = await expungeExpiredMail(imap, { dryRun: false, log: logSimulado(), nowMs: AHORA });
    // uid 3 es más viejo que el corte exacto: sale por el filtro fino, no por BEFORE.
    expect(ops.filter((o) => o.op === "move").flatMap((o) => o.uids)).toEqual([1, 2, 3]);
    expect([...carpetas.get("INBOX")!.keys()]).toEqual([4, 5]);
    expect(r.ok && r.folders[0]!.candidates).toBe(3);
  });
});

describe("expungeExpiredMail · dry-run", () => {
  it("cuenta y lista UIDs y fechas, sin mover ni borrar", async () => {
    const { imap, ops, carpetas } = imapSimulado({ inbox: BUZON });
    const log = logSimulado();
    const r = await expungeExpiredMail(imap, { dryRun: true, log, nowMs: AHORA });

    expect(ops.some((o) => o.op === "move" || o.op === "delete")).toBe(false);
    expect(carpetas.get("INBOX")!.size).toBe(5);
    expect(r).toEqual({
      ok: true,
      dryRun: true,
      trash: PAPELERA,
      folders: [
        {
          folder: "INBOX",
          candidates: 2,
          moved: 0,
          expunged: 0,
          dryRun: true,
          muestras: [
            { uid: 1, internalDate: "2026-08-01T10:00:00.000Z" },
            { uid: 2, internalDate: "2026-09-16T23:00:00.000Z" },
          ],
        },
      ],
    });
    expect(log.info).toHaveBeenCalledWith(
      "ingest.imap.expunge",
      expect.objectContaining({
        folder: "INBOX",
        candidates: 2,
        moved: 0,
        expunged: 0,
        dryRun: true,
      }),
    );
  });
});

describe("expungeExpiredMail · borrado real", () => {
  it("mueve a la \\Trash (por special-use) y expurga ahí solo esos mensajes", async () => {
    const { imap, ops, carpetas } = imapSimulado({
      inbox: BUZON,
      papelera: { 77: { internalDate: "2026-10-01T00:00:00.000Z", seen: true } },
    });
    const log = logSimulado();
    const r = await expungeExpiredMail(imap, { dryRun: false, log, nowMs: AHORA });

    expect(ops).toEqual([
      { op: "open", folder: "INBOX" },
      { op: "move", folder: "INBOX", uids: [1, 2] },
      { op: "open", folder: PAPELERA },
      { op: "delete", folder: PAPELERA, uids: [9000, 9001] },
    ]);
    expect([...carpetas.get("INBOX")!.keys()]).toEqual([3, 4, 5]);
    // Lo que ya estaba en la papelera no es nuestro: queda.
    expect([...carpetas.get(PAPELERA)!.keys()]).toEqual([77]);
    expect(r.ok && r.folders[0]).toMatchObject({ candidates: 2, moved: 2, expunged: 2 });
    expect(log.info).toHaveBeenCalledWith(
      "ingest.imap.expunge",
      expect.objectContaining({ folder: "INBOX", moved: 2, expunged: 2, dryRun: false }),
    );
  });

  it("sin mapa de UIDs (sin UIDPLUS) mueve pero no adivina qué borrar en la papelera", async () => {
    const { imap, ops } = imapSimulado({ inbox: BUZON, sinUidPlus: true });
    const log = logSimulado();
    const r = await expungeExpiredMail(imap, { dryRun: false, log, nowMs: AHORA });
    expect(ops.some((o) => o.op === "delete")).toBe(false);
    expect(r.ok && r.folders[0]).toMatchObject({ moved: 2, expunged: 0 });
    expect(log.warn).toHaveBeenCalled();
  });

  it("sin vencidos no mueve ni abre la papelera", async () => {
    const { imap, ops } = imapSimulado({ inbox: { 5: BUZON[5]! } });
    await expungeExpiredMail(imap, { dryRun: false, log: logSimulado(), nowMs: AHORA });
    expect(ops).toEqual([{ op: "open", folder: "INBOX" }]);
  });
});

describe("expungeExpiredMail · aborto", () => {
  it("sin carpeta \\Trash aborta con error logueado y no toca nada", async () => {
    const { imap, ops, carpetas } = imapSimulado({ inbox: BUZON, sinTrash: true });
    const log = logSimulado();
    const r = await expungeExpiredMail(imap, { dryRun: false, log, nowMs: AHORA });
    expect(r.ok).toBe(false);
    expect(ops).toEqual([]);
    expect(carpetas.get("INBOX")!.size).toBe(5);
    expect(log.error).toHaveBeenCalled();
  });
});

describe("resolveExpungeDryRun", () => {
  it('borra de verdad solo con "true" y sin dryRun', () => {
    expect(resolveExpungeDryRun("true", null)).toBe(false);
  });

  it.each([undefined, "", "false", "1", "TRUE", "yes"])("env %j → dry-run", (env) => {
    expect(resolveExpungeDryRun(env, null)).toBe(true);
  });

  it.each(["1", "0", "false", ""])("dryRun=%j fuerza dry-run aunque la env diga true", (p) => {
    expect(resolveExpungeDryRun("true", p)).toBe(true);
  });
});

describe("workflow del poll", () => {
  const yml = readFileSync(
    path.join(process.cwd(), ".github/workflows/email-ingest-poll.yml"),
    "utf8",
  );

  it("expurga solo en el tick diario o a mano, y el dry-run manual viene encendido", () => {
    expect(yml).toContain('- cron: "*/5 * * * *"');
    expect(yml).toContain('- cron: "20 5 * * *"');
    expect(yml).toMatch(/\[ "\$SCHEDULE" = "20 5 \* \* \*" \]; then\s+QS="\?expunge=1"/);
    expect(yml).toMatch(/expunge_dry_run:[\s\S]*?default: true/);
    // El Action no tiene forma de pedir el borrado: no existe ningún parámetro para eso.
    expect(yml).not.toMatch(/dryRun=0|INGEST_IMAP_EXPUNGE_ENABLED=/);
  });
});

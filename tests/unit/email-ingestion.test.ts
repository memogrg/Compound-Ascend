import { describe, it, expect } from "vitest";
import {
  fetchUnseen,
  matchIngestAlias,
  processInboundEmails,
  type EmailIngestDeps,
  type EmailOwner,
  type ImapClient,
  type ImapMessage,
  type RawImapMessage,
} from "@/lib/ingestion/email/imap-poller";
import { parseNotification } from "@/lib/ingestion/sources";

// Muestra real de notificación de compra con tarjeta de BAC (la usa el parser).
const BAC_CARD = `Hola GUILLERMO, BAC Credomatic le informa.
A continuación le detallamos la transacción realizada:
Comercio: AUTO MERCADO SANTA ANA  Ciudad y país: SAN JOSE, Costa Rica
Fecha: Jun 11, 2026, 20:31  MASTER ***2062  Autorización: 425613
Referencia: 35689751  Tipo de Transacción: COMPRA  Monto: CRC 11,490.00`;

const IMAP_USER = "communications@aitechumbrella.com";
const ALIAS = "communications+memo@aitechumbrella.com";
const BANK_FROM = "notificacion@notificacionesbaccr.com"; // con auto-forward, el From es del banco

/** Cliente IMAP falso: devuelve los correos dados, registra los marcados leídos. */
function fakeClient(raw: RawImapMessage[]): ImapClient & { seen: number[] } {
  const seen: number[] = [];
  return {
    seen,
    listUnseen: async () => raw,
    markSeen: async (uid: number) => {
      seen.push(uid);
    },
    close: async () => {},
  };
}

/** Deps en memoria: allowlist por alias, dedup por id, propuestas acumuladas. */
function fakeDeps(allowlist: Record<string, EmailOwner>, processed = new Set<string>()) {
  const proposals: { movements: number; owner: EmailOwner }[] = [];
  const markedSeen: number[] = [];
  const deps: EmailIngestDeps = {
    lookupOwner: async (alias) => allowlist[alias] ?? null,
    isProcessed: async (id) => processed.has(id),
    markProcessed: async (id) => {
      processed.add(id);
    },
    saveProposals: async (movements, owner) => {
      proposals.push({ movements: movements.length, owner });
      return movements.length; // sin choque de external_ref en estos tests
    },
    markSeen: async (m) => {
      markedSeen.push(m.uid);
    },
  };
  return { deps, proposals, markedSeen, processed };
}

describe("email ingestion · matchIngestAlias", () => {
  it("toma el destinatario base+token@dominio (ignora el banco)", () => {
    const got = matchIngestAlias(["BAC <notificacion@bac.com>", `Memo <${ALIAS}>`], IMAP_USER);
    expect(got).toBe(ALIAS);
  });
  it("sin plus-address válido -> null", () => {
    expect(matchIngestAlias([IMAP_USER, "otro@aitechumbrella.com"], IMAP_USER)).toBeNull();
    expect(matchIngestAlias(["communications+@aitechumbrella.com"], IMAP_USER)).toBeNull();
  });
});

describe("email ingestion · fetchUnseen", () => {
  it("normaliza remitente, destinatarios y usa messageId como id", async () => {
    const client = fakeClient([
      {
        uid: 7,
        messageId: "<abc@mail>",
        from: "BAC Credomatic <notificacion@notificacionesbaccr.com>",
        recipients: [`Memo <${ALIAS}>`, "Comms <communications@aitechumbrella.com>"],
        subject: "Compra",
        text: "cuerpo",
      },
    ]);
    const [m] = await fetchUnseen(client);
    expect(m).toBeDefined();
    expect(m!.id).toBe("<abc@mail>");
    expect(m!.from).toBe(BANK_FROM);
    expect(m!.recipients).toEqual([ALIAS, "communications@aitechumbrella.com"]);
    expect(m!.uid).toBe(7);
  });

  it("usa uid:<n> si no hay messageId y descarta correos sin remitente o cuerpo", async () => {
    const client = fakeClient([
      { uid: 9, messageId: null, from: "x@y.com", recipients: [ALIAS], subject: "s", text: "hola" },
      { uid: 10, messageId: null, from: null, recipients: [ALIAS], subject: "s", text: "hola" }, // sin from
      { uid: 11, messageId: null, from: "z@y.com", recipients: [ALIAS], subject: "s", text: "  " }, // sin cuerpo
    ]);
    const out = await fetchUnseen(client);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("uid:9");
  });
});

describe("email ingestion · processInboundEmails", () => {
  const owner: EmailOwner = { userId: "u1", householdId: "h1" };
  const msg = (over: Partial<ImapMessage>): ImapMessage => ({
    id: "<m1@bac>",
    from: BANK_FROM,
    recipients: [ALIAS],
    subject: "Compra",
    text: BAC_CARD,
    uid: 1,
    ...over,
  });

  it("alias de destinatario conocido + notificación BAC -> 1 propuesta", async () => {
    const { deps, proposals, markedSeen, processed } = fakeDeps({ [ALIAS]: owner });
    const summary = await processInboundEmails([msg({})], parseNotification, IMAP_USER, deps);
    expect(summary).toEqual({ procesados: 1, propuestos: 1, ignorados: 0, duplicados: 0 });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.movements).toBe(1);
    expect(markedSeen).toEqual([1]);
    expect(processed.has("<m1@bac>")).toBe(true);
  });

  it("alias desconocido -> ignorado (no propone, no marca procesado)", async () => {
    const { deps, proposals, markedSeen, processed } = fakeDeps({ [ALIAS]: owner });
    const summary = await processInboundEmails(
      [msg({ recipients: ["communications+otro@aitechumbrella.com"], id: "<m2@bac>" })],
      parseNotification,
      IMAP_USER,
      deps,
    );
    expect(summary).toEqual({ procesados: 0, propuestos: 0, ignorados: 1, duplicados: 0 });
    expect(proposals).toHaveLength(0);
    expect(markedSeen).toEqual([]);
    expect(processed.has("<m2@bac>")).toBe(false);
  });

  it("id ya procesado -> duplicado (dedup por messageId)", async () => {
    const { deps, proposals } = fakeDeps({ [ALIAS]: owner }, new Set(["<m1@bac>"]));
    const summary = await processInboundEmails([msg({})], parseNotification, IMAP_USER, deps);
    expect(summary).toEqual({ procesados: 0, propuestos: 0, ignorados: 0, duplicados: 1 });
    expect(proposals).toHaveLength(0);
  });

  it("correo conocido sin notificación -> procesado sin propuesta", async () => {
    const { deps, proposals, markedSeen, processed } = fakeDeps({ [ALIAS]: owner });
    const summary = await processInboundEmails(
      [msg({ id: "<m3@x>", text: "Hola, ¿almorzamos el viernes?", uid: 3 })],
      parseNotification,
      IMAP_USER,
      deps,
    );
    expect(summary).toEqual({ procesados: 1, propuestos: 0, ignorados: 0, duplicados: 0 });
    expect(proposals).toHaveLength(0);
    expect(markedSeen).toEqual([3]); // se marca leído igual
    expect(processed.has("<m3@x>")).toBe(true);
  });
});

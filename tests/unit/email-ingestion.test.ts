import { describe, it, expect } from "vitest";
import {
  extractRecipientCandidates,
  fetchUnseen,
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

const BANK_FROM = "notificacion@notificacionesbaccr.com"; // con auto-forward, el From es del banco
const FLAT_INBOX = "communications@aitechumbrella.com"; // dirección plana del buzón
const FORWARDER = "memogrg@gmail.com"; // destinatario original (forwarder conocido)

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

/** Deps en memoria: allowlist por forwarder, dedup por id, propuestas acumuladas.
 *  saveProposals simula el único (cuenta, external_ref): la misma compra en 2
 *  correos se inserta una vez; la repetición cuenta como duplicado. */
function fakeDeps(allowlist: Record<string, EmailOwner>, processed = new Set<string>()) {
  const proposals: { movements: number; owner: EmailOwner }[] = [];
  const markedSeen: number[] = [];
  const seenRefs = new Set<string>(); // claves (cuenta, external_ref) ya insertadas
  const deps: EmailIngestDeps = {
    lookupOwner: async (candidates) => {
      for (const c of candidates) {
        const owner = allowlist[c];
        if (owner) return owner;
      }
      return null;
    },
    isProcessed: async (id) => processed.has(id),
    markProcessed: async (id) => {
      processed.add(id);
    },
    saveProposals: async (movements, owner) => {
      const account = owner.householdId ?? owner.userId;
      let inserted = 0;
      let duplicated = 0;
      for (const m of movements) {
        const key = m.externalRef ? `${account}:${m.externalRef}` : null;
        if (key && seenRefs.has(key)) {
          duplicated += 1;
          continue;
        }
        if (key) seenRefs.add(key);
        proposals.push({ movements: 1, owner });
        inserted += 1;
      }
      return { inserted, duplicated };
    },
    markSeen: async (m) => {
      markedSeen.push(m.uid);
    },
  };
  return { deps, proposals, markedSeen, processed };
}

describe("email ingestion · extractRecipientCandidates", () => {
  it("saca el destinatario original de cabeceras de reenvío de Gmail (To por BCC vacío)", () => {
    // Caso típico: el banco envía por BCC (To genérico), Gmail reenvía y agrega
    // X-Forwarded-For/To + Delivered-To con la dirección original.
    const headers = [
      "Delivered-To: communications@aitechumbrella.com",
      "X-Forwarded-To: communications@aitechumbrella.com",
      "X-Forwarded-For: memogrg@gmail.com communications@aitechumbrella.com",
      "Delivered-To: memogrg@gmail.com",
      "From: BAC Credomatic <notificacion@notificacionesbaccr.com>",
      "To: clientes@notificacionesbaccr.com",
      "Subject: Compra",
    ].join("\r\n");
    const got = extractRecipientCandidates(headers);
    expect(got).toContain("memogrg@gmail.com");
    expect(got).toContain("communications@aitechumbrella.com");
  });

  it("despliega líneas plegadas y normaliza a minúsculas sin duplicados", () => {
    const headers = "To: Memo\r\n <MEMOGRG@gmail.com>,\r\n memogrg@gmail.com";
    expect(extractRecipientCandidates(headers)).toEqual(["memogrg@gmail.com"]);
  });

  it("ignora cabeceras que no son de destinatario", () => {
    const headers = "From: banco@bac.com\r\nReply-To: noreply@bac.com\r\nSubject: x@y.com";
    expect(extractRecipientCandidates(headers)).toEqual([]);
  });
});

describe("email ingestion · fetchUnseen", () => {
  it("normaliza remitente y destinatarios (minúsculas, sin duplicados)", async () => {
    const client = fakeClient([
      {
        uid: 7,
        messageId: "<abc@mail>",
        from: "BAC Credomatic <notificacion@notificacionesbaccr.com>",
        recipients: [`Comms <${FLAT_INBOX}>`, "MEMOGRG@gmail.com", FLAT_INBOX],
        subject: "Compra",
        text: "cuerpo",
      },
    ]);
    const [m] = await fetchUnseen(client);
    expect(m).toBeDefined();
    expect(m!.id).toBe("<abc@mail>");
    expect(m!.from).toBe(BANK_FROM);
    // candidatos = destinatarios + From (este último para reenvío manual)
    expect(m!.recipients).toEqual([FLAT_INBOX, FORWARDER, BANK_FROM]);
    expect(m!.uid).toBe(7);
  });

  it("reenvío manual: el From entra como candidato de identificación", async () => {
    const client = fakeClient([
      {
        uid: 21,
        messageId: "<manual@gmail>",
        from: `Memo <${FORWARDER}>`, // en reenvío manual, el usuario queda en From
        recipients: [FLAT_INBOX], // el To es solo el buzón de ingesta
        subject: "Fwd: Compra BAC",
        text: BAC_CARD,
      },
    ]);
    const [m] = await fetchUnseen(client);
    expect(m!.recipients).toContain(FORWARDER); // el From se sumó a los candidatos
  });

  it("usa uid:<n> si no hay messageId y descarta correos sin remitente o cuerpo", async () => {
    const client = fakeClient([
      { uid: 9, messageId: null, from: "x@y.com", recipients: [FORWARDER], subject: "s", text: "hola" },
      { uid: 10, messageId: null, from: null, recipients: [FORWARDER], subject: "s", text: "hola" }, // sin from
      { uid: 11, messageId: null, from: "z@y.com", recipients: [FORWARDER], subject: "s", text: "  " }, // sin cuerpo
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
    recipients: [FLAT_INBOX, FORWARDER], // el forwarder viaja entre los candidatos
    subject: "Compra",
    text: BAC_CARD,
    uid: 1,
    ...over,
  });

  it("reenvío manual (From = forwarder, To solo el buzón) -> 1 propuesta", async () => {
    const { deps, proposals } = fakeDeps({ [FORWARDER]: owner });
    // Pasa por fetchUnseen para que el From se sume a los candidatos (ruta real).
    const client = fakeClient([
      {
        uid: 22,
        messageId: "<manual2@gmail>",
        from: FORWARDER,
        recipients: [FLAT_INBOX],
        subject: "Fwd: Compra BAC",
        text: BAC_CARD,
      },
    ]);
    const messages = await fetchUnseen(client);
    const summary = await processInboundEmails(messages, parseNotification, deps);
    expect(summary).toEqual({ procesados: 1, propuestos: 1, ignorados: 0, duplicados: 0 });
    expect(proposals).toHaveLength(1);
  });

  it("misma compra (cuenta, referencia) en 2 correos -> 1 propuesta + 1 duplicado", async () => {
    const { deps, proposals } = fakeDeps({ [FORWARDER]: owner });
    // Dos correos distintos (Message-ID distinto, así no choca el dedup por id) con
    // la MISMA notificación BAC → misma (cuenta, external_ref).
    const messages = [
      msg({ id: "<copia-A@bac>", uid: 1 }),
      msg({ id: "<copia-B@bac>", uid: 2 }),
    ];
    const summary = await processInboundEmails(messages, parseNotification, deps);
    expect(summary).toEqual({ procesados: 2, propuestos: 1, ignorados: 0, duplicados: 1 });
    expect(proposals).toHaveLength(1); // la compra entró una sola vez
  });

  it("forwarder conocido entre los candidatos + notificación BAC -> 1 propuesta", async () => {
    const { deps, proposals, markedSeen, processed } = fakeDeps({ [FORWARDER]: owner });
    const summary = await processInboundEmails([msg({})], parseNotification, deps);
    expect(summary).toEqual({ procesados: 1, propuestos: 1, ignorados: 0, duplicados: 0 });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.movements).toBe(1);
    expect(markedSeen).toEqual([1]);
    expect(processed.has("<m1@bac>")).toBe(true);
  });

  it("forwarder desconocido -> ignorado (no propone, no marca procesado)", async () => {
    const { deps, proposals, markedSeen, processed } = fakeDeps({ [FORWARDER]: owner });
    const summary = await processInboundEmails(
      [msg({ recipients: [FLAT_INBOX, "otro@gmail.com"], id: "<m2@bac>" })],
      parseNotification,
      deps,
    );
    expect(summary).toEqual({ procesados: 0, propuestos: 0, ignorados: 1, duplicados: 0 });
    expect(proposals).toHaveLength(0);
    expect(markedSeen).toEqual([]);
    expect(processed.has("<m2@bac>")).toBe(false);
  });

  it("id ya procesado -> duplicado (dedup por messageId)", async () => {
    const { deps, proposals } = fakeDeps({ [FORWARDER]: owner }, new Set(["<m1@bac>"]));
    const summary = await processInboundEmails([msg({})], parseNotification, deps);
    expect(summary).toEqual({ procesados: 0, propuestos: 0, ignorados: 0, duplicados: 1 });
    expect(proposals).toHaveLength(0);
  });

  it("correo conocido sin notificación -> procesado sin propuesta", async () => {
    const { deps, proposals, markedSeen, processed } = fakeDeps({ [FORWARDER]: owner });
    const summary = await processInboundEmails(
      [msg({ id: "<m3@x>", text: "Hola, ¿almorzamos el viernes?", uid: 3 })],
      parseNotification,
      deps,
    );
    expect(summary).toEqual({ procesados: 1, propuestos: 0, ignorados: 0, duplicados: 0 });
    expect(proposals).toHaveLength(0);
    expect(markedSeen).toEqual([3]); // se marca leído igual
    expect(processed.has("<m3@x>")).toBe(true);
  });
});

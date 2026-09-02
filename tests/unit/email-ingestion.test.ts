import { describe, it, expect } from "vitest";
import {
  extractRecipientCandidates,
  fetchUnseen,
  fromIsAuthenticated,
  processInboundEmails,
  type EmailIngestDeps,
  type EmailOwner,
  type ImapClient,
  type ImapMessage,
  type OwnerLookup,
  type RawImapMessage,
} from "@/lib/ingestion/email/imap-poller";
import { parseNotification } from "@/lib/ingestion/sources";
import type { RawMovement } from "@/lib/ingestion/types";

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
        if (owner) return { status: "found", owner } as const;
      }
      return { status: "none" } as const;
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
        fromAuthenticated: false,
        from: "BAC Credomatic <notificacion@notificacionesbaccr.com>",
        recipients: [`Comms <${FLAT_INBOX}>`, "MEMOGRG@gmail.com", FLAT_INBOX],
        subject: "Compra",
        text: "cuerpo",
        receivedAt: "2026-06-11T20:31:00.000Z",
      },
    ]);
    const [m] = await fetchUnseen(client);
    expect(m).toBeDefined();
    expect(m!.id).toBe("<abc@mail>");
    expect(m!.from).toBe(BANK_FROM);
    // El From YA NO se cuela entre los destinatarios: es un nivel aparte y solo
    // cuenta si vino autenticado (aquí no lo estaba).
    expect(m!.recipients).toEqual([FLAT_INBOX, FORWARDER]);
    expect(m!.senderCandidates).toEqual([]);
    expect(m!.uid).toBe(7);
    expect(m!.receivedAt).toBe("2026-06-11T20:31:00.000Z"); // envelope.date llega hasta el mensaje
  });

  it("reenvío manual AUTENTICADO: el From vale como candidato, aparte de los destinatarios", async () => {
    const client = fakeClient([
      {
        uid: 21,
        messageId: "<manual@gmail>",
        fromAuthenticated: true, // el buzón validó DKIM/SPF de gmail.com
        from: `Memo <${FORWARDER}>`, // en reenvío manual, el usuario queda en From
        recipients: [FLAT_INBOX], // el To es solo el buzón de ingesta
        subject: "Fwd: Compra BAC",
        text: BAC_CARD,
        receivedAt: null,
      },
    ]);
    const [m] = await fetchUnseen(client);
    expect(m!.senderCandidates).toEqual([FORWARDER]);
    expect(m!.recipients).not.toContain(FORWARDER); // no se mezcla con los destinatarios
  });

  it("From SIN autenticar no vale como identidad (correo falsificado)", async () => {
    const client = fakeClient([
      {
        uid: 23,
        messageId: "<spoof@atacante>",
        fromAuthenticated: false, // ni DKIM ni SPF respaldan ese From
        from: `Memo <${FORWARDER}>`, // se hace pasar por la víctima
        recipients: [FLAT_INBOX],
        subject: "Fwd: Compra BAC",
        text: BAC_CARD,
        receivedAt: null,
      },
    ]);
    const [m] = await fetchUnseen(client);
    expect(m!.senderCandidates).toEqual([]);
  });

  it("usa uid:<n> si no hay messageId y descarta correos sin remitente o cuerpo", async () => {
    const client = fakeClient([
      {
        uid: 9,
        messageId: null,
        fromAuthenticated: false,
        from: "x@y.com",
        recipients: [FORWARDER],
        subject: "s",
        text: "hola",
        receivedAt: null,
      },
      {
        uid: 10,
        messageId: null,
        fromAuthenticated: false,
        from: null,
        recipients: [FORWARDER],
        subject: "s",
        text: "hola",
        receivedAt: null,
      }, // sin from
      {
        uid: 11,
        messageId: null,
        fromAuthenticated: false,
        from: "z@y.com",
        recipients: [FORWARDER],
        subject: "s",
        text: "  ",
        receivedAt: null,
      }, // sin cuerpo
    ]);
    const out = await fetchUnseen(client);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("uid:9");
  });
});

describe("email ingestion · processInboundEmails", () => {
  const owner: EmailOwner = { userId: "u1", householdId: "h1", timezone: null };
  const msg = (over: Partial<ImapMessage>): ImapMessage => ({
    id: "<m1@bac>",
    from: BANK_FROM,
    recipients: [FLAT_INBOX, FORWARDER], // el forwarder viaja entre los candidatos
    subject: "Compra",
    text: BAC_CARD,
    uid: 1,
    receivedAt: null,
    senderCandidates: [],
    ...over,
  });

  it("reenvío manual (From = forwarder, To solo el buzón) -> 1 propuesta", async () => {
    const { deps, proposals } = fakeDeps({ [FORWARDER]: owner });
    // Pasa por fetchUnseen para que el From se sume a los candidatos (ruta real).
    const client = fakeClient([
      {
        uid: 22,
        messageId: "<manual2@gmail>",
        fromAuthenticated: true,
        from: FORWARDER,
        recipients: [FLAT_INBOX],
        subject: "Fwd: Compra BAC",
        text: BAC_CARD,
        receivedAt: null,
      },
    ]);
    const messages = await fetchUnseen(client);
    const summary = await processInboundEmails(messages, parseNotification, deps);
    expect(summary).toEqual({
      procesados: 1,
      propuestos: 1,
      ignorados: 0,
      duplicados: 0,
      ambiguos: 0,
      sinParsear: 0,
    });
    expect(proposals).toHaveLength(1);
  });

  it("misma compra (cuenta, referencia) en 2 correos -> 1 propuesta + 1 duplicado", async () => {
    const { deps, proposals } = fakeDeps({ [FORWARDER]: owner });
    // Dos correos distintos (Message-ID distinto, así no choca el dedup por id) con
    // la MISMA notificación BAC → misma (cuenta, external_ref).
    const messages = [msg({ id: "<copia-A@bac>", uid: 1 }), msg({ id: "<copia-B@bac>", uid: 2 })];
    const summary = await processInboundEmails(messages, parseNotification, deps);
    expect(summary).toEqual({
      procesados: 2,
      propuestos: 1,
      ignorados: 0,
      duplicados: 1,
      ambiguos: 0,
      sinParsear: 0,
    });
    expect(proposals).toHaveLength(1); // la compra entró una sola vez
  });

  it("forwarder conocido entre los candidatos + notificación BAC -> 1 propuesta", async () => {
    const { deps, proposals, markedSeen, processed } = fakeDeps({ [FORWARDER]: owner });
    const summary = await processInboundEmails([msg({})], parseNotification, deps);
    expect(summary).toEqual({
      procesados: 1,
      propuestos: 1,
      ignorados: 0,
      duplicados: 0,
      ambiguos: 0,
      sinParsear: 0,
    });
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
    expect(summary).toEqual({
      procesados: 0,
      propuestos: 0,
      ignorados: 1,
      duplicados: 0,
      ambiguos: 0,
      sinParsear: 0,
    });
    expect(proposals).toHaveLength(0);
    expect(markedSeen).toEqual([]);
    expect(processed.has("<m2@bac>")).toBe(false);
  });

  it("id ya procesado -> duplicado (dedup por messageId)", async () => {
    const { deps, proposals } = fakeDeps({ [FORWARDER]: owner }, new Set(["<m1@bac>"]));
    const summary = await processInboundEmails([msg({})], parseNotification, deps);
    expect(summary).toEqual({
      procesados: 0,
      propuestos: 0,
      ignorados: 0,
      duplicados: 1,
      ambiguos: 0,
      sinParsear: 0,
    });
    expect(proposals).toHaveLength(0);
  });

  it("correo conocido sin notificación -> procesado sin propuesta", async () => {
    const { deps, proposals, markedSeen, processed } = fakeDeps({ [FORWARDER]: owner });
    const summary = await processInboundEmails(
      [msg({ id: "<m3@x>", text: "Hola, ¿almorzamos el viernes?", uid: 3 })],
      parseNotification,
      deps,
    );
    // Cuenta como `sinParsear`: hay dueño pero ningún parser supo leerlo. Antes
    // desaparecía sin dejar rastro; ahora es una métrica (cola de parsers).
    expect(summary).toEqual({
      procesados: 1,
      propuestos: 0,
      ignorados: 0,
      duplicados: 0,
      ambiguos: 0,
      sinParsear: 1,
    });
    expect(proposals).toHaveLength(0);
    expect(markedSeen).toEqual([3]); // se marca leído igual
    expect(processed.has("<m3@x>")).toBe(true);
  });
});

describe("email ingestion · fecha faltante (fallback a la fecha de recepción)", () => {
  // Movimiento reconocido por el parser pero SIN fecha (occurredOn ""): antes moría en el insert
  // porque ingest_proposals.occurred_on es NOT NULL (bug: "invalid input syntax for type date").
  const movimientoSinFecha: RawMovement = {
    kind: "gasto",
    amount: 11490,
    currency: "CRC",
    occurredOn: "",
    merchant: "AUTO MERCADO",
    description: "Compra",
    sourceKind: "email_notification",
    bankCode: "BAC",
    confidence: 0.9,
    externalRef: "ref-sin-fecha",
    rawText: "cuerpo sin fecha",
  };

  /** Deps mínimas que CAPTURAN los movimientos entregados a saveProposals para inspeccionarlos. */
  function capturingDeps(owner: EmailOwner) {
    const capturado: RawMovement[] = [];
    const deps: EmailIngestDeps = {
      lookupOwner: async () => ({ status: "found", owner }) as const,
      isProcessed: async () => false,
      markProcessed: async () => {},
      saveProposals: async (movements) => {
        capturado.push(...movements);
        return { inserted: movements.length, duplicated: 0 };
      },
      markSeen: async () => {},
    };
    return { deps, capturado };
  }

  const msgSinFecha = (over: Partial<ImapMessage>): ImapMessage => ({
    id: "<sinfecha@bac>",
    from: BANK_FROM,
    recipients: [FLAT_INBOX, FORWARDER],
    subject: "Compra",
    text: "cuerpo sin fecha",
    uid: 99,
    receivedAt: null,
    senderCandidates: [],
    ...over,
  });

  it("email sin fecha parseable -> usa la fecha de RECEPCIÓN en la tz del usuario (no rompe el insert)", async () => {
    // receivedAt = 25 ago 02:00Z. En Asia/Tokyo (UTC+9) es el 25; en UTC/CR sería el 24 → que dé
    // "2026-08-25" prueba que se usa la tz DEL DUEÑO (no UTC ni la default), consistente con #90.
    const { deps, capturado } = capturingDeps({
      userId: "u1",
      householdId: "h1",
      timezone: "Asia/Tokyo",
    });
    const parseSinFecha = (): RawMovement[] => [movimientoSinFecha];
    const summary = await processInboundEmails(
      [msgSinFecha({ receivedAt: "2026-08-25T02:00:00.000Z" })],
      parseSinFecha,
      deps,
    );
    expect(summary.propuestos).toBe(1);
    expect(capturado).toHaveLength(1);
    expect(capturado[0]!.occurredOn).toBe("2026-08-25"); // fecha del email en Tokyo, NUNCA ""
  });

  it("sin tz guardada -> fecha del email en la zona por defecto (CR), tampoco vacía", async () => {
    const { deps, capturado } = capturingDeps({ userId: "u1", householdId: "h1", timezone: null });
    const parseSinFecha = (): RawMovement[] => [movimientoSinFecha];
    await processInboundEmails(
      [msgSinFecha({ receivedAt: "2026-08-25T02:00:00.000Z" })],
      parseSinFecha,
      deps,
    );
    // 02:00Z en America/Costa_Rica (UTC-6) = 20:00 del día anterior → 2026-08-24.
    expect(capturado[0]!.occurredOn).toBe("2026-08-24");
  });

  it("si el parser SÍ trae fecha, no se pisa con la de recepción", async () => {
    const { deps, capturado } = capturingDeps({
      userId: "u1",
      householdId: "h1",
      timezone: "Asia/Tokyo",
    });
    const conFecha: RawMovement = {
      ...movimientoSinFecha,
      occurredOn: "2026-06-11",
      externalRef: "ref-con-fecha",
    };
    await processInboundEmails(
      [msgSinFecha({ receivedAt: "2026-08-25T02:00:00.000Z" })],
      (): RawMovement[] => [conFecha],
      deps,
    );
    expect(capturado[0]!.occurredOn).toBe("2026-06-11"); // la fecha extraída manda
  });
});

// ---------------------------------------------------------------------------
// Aislamiento entre cuentas: lo que impide que el gasto de alguien caiga en la
// cuenta de otro. Son los tests de regresión de los P0 del 2 sep 2026.
// ---------------------------------------------------------------------------
describe("email ingestion · aislamiento entre cuentas", () => {
  const ownerA: EmailOwner = { userId: "uA", householdId: null, timezone: null };

  /** Deps cuyo lookupOwner responde lo que se le indique (found/none/ambiguous). */
  function depsCon(lookup: OwnerLookup) {
    const proposals: RawMovement[] = [];
    const markedSeen: number[] = [];
    const processed = new Set<string>();
    const deps: EmailIngestDeps = {
      lookupOwner: async () => lookup,
      isProcessed: async (id) => processed.has(id),
      markProcessed: async (id) => {
        processed.add(id);
      },
      saveProposals: async (movements) => {
        proposals.push(...movements);
        return { inserted: movements.length, duplicated: 0 };
      },
      markSeen: async (m) => {
        markedSeen.push(m.uid);
      },
    };
    return { deps, proposals, markedSeen, processed };
  }

  const correo: ImapMessage = {
    id: "<ambiguo@bac>",
    from: BANK_FROM,
    recipients: [FLAT_INBOX, FORWARDER, "otra@persona.com"],
    senderCandidates: [],
    subject: "Compra",
    text: BAC_CARD,
    uid: 42,
    receivedAt: null,
  };

  it("candidatos de DOS cuentas -> no se procesa, no se adivina", async () => {
    const { deps, proposals, markedSeen, processed } = depsCon({ status: "ambiguous", cuentas: 2 });
    const summary = await processInboundEmails([correo], parseNotification, deps);
    expect(summary.ambiguos).toBe(1);
    expect(summary.procesados).toBe(0);
    expect(proposals).toHaveLength(0);
    // Ni leído ni procesado: el correo queda ahí para resolverlo a mano.
    expect(markedSeen).toEqual([]);
    expect(processed.has(correo.id)).toBe(false);
  });

  it("una sola cuenta -> se procesa normal (la ambigüedad no bloquea el caso sano)", async () => {
    const { deps, proposals } = depsCon({ status: "found", owner: ownerA });
    const summary = await processInboundEmails([correo], parseNotification, deps);
    expect(summary.ambiguos).toBe(0);
    expect(summary.propuestos).toBe(1);
    expect(proposals).toHaveLength(1);
  });
});

describe("email ingestion · fromIsAuthenticated", () => {
  const AR = (v: string) =>
    `Delivered-To: ${FLAT_INBOX}\r\nAuthentication-Results: ${v}\r\nSubject: x`;

  it("acepta DKIM del mismo dominio del From", () => {
    const h = AR("mx.google.com; dkim=pass header.i=@gmail.com header.s=20230601; dmarc=pass");
    expect(fromIsAuthenticated(h, FORWARDER)).toBe(true);
  });

  it("acepta SPF cuyo smtp.mailfrom es exactamente el From", () => {
    const h = AR(
      `mx.google.com; spf=pass (google.com: domain of ${FORWARDER} designates 1.2.3.4) smtp.mailfrom=${FORWARDER}`,
    );
    expect(fromIsAuthenticated(h, FORWARDER)).toBe(true);
  });

  it("rechaza DKIM de OTRO dominio (firmado por el atacante)", () => {
    const h = AR("mx.google.com; dkim=pass header.d=atacante.com; spf=fail");
    expect(fromIsAuthenticated(h, FORWARDER)).toBe(false);
  });

  it("rechaza cuando todo falla (correo falsificado)", () => {
    const h = AR("mx.google.com; dkim=none; spf=fail; dmarc=fail");
    expect(fromIsAuthenticated(h, FORWARDER)).toBe(false);
  });

  it("NO confía en ARC-Authentication-Results (es la afirmación de un tercero)", () => {
    const h = `ARC-Authentication-Results: i=1; mx.google.com; dkim=pass header.i=@gmail.com\r\nSubject: x`;
    expect(fromIsAuthenticated(h, FORWARDER)).toBe(false);
  });

  it("sin cabecera de autenticación -> no autenticado", () => {
    expect(fromIsAuthenticated("Subject: x\r\nTo: alguien@x.com", FORWARDER)).toBe(false);
  });
});

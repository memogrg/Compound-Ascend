import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Onboarding de la ingesta por correo + resolución del dueño.
 *
 * Estos tests son el arnés de regresión del blindaje del 2 sep 2026: la
 * verificación de propiedad y el aislamiento entre cuentas. Si alguno se cae,
 * lo que se rompió es la garantía de que el gasto de alguien no termina en la
 * cuenta de otro — no un detalle de implementación.
 */

// ---------------------------------------------------------------------------
// Fake Supabase: store en memoria; soporta el subset usado por el servicio
// (select+eq+maybeSingle / insert / update+eq / delete+eq+in) y por el lookup
// (select+eq+in, awaitable).
// ---------------------------------------------------------------------------
type Row = Record<string, unknown> & { id: string; forwarder_email: string };
const store = new Map<string, Row>();
let autoId = 0;

function matches(
  r: Row,
  filters: Record<string, unknown>,
  ins: Record<string, unknown[]>,
): boolean {
  const eqOk = Object.entries(filters).every(([k, v]) => r[k] === v);
  const inOk = Object.entries(ins).every(([k, vs]) => vs.includes(r[k]));
  return eqOk && inOk;
}

function findRow(filters: Record<string, unknown>): Row | null {
  return [...store.values()].find((r) => matches(r, filters, {})) ?? null;
}

function makeDb() {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const ins: Record<string, unknown[]> = {};
      let op = "select";
      let patch: Record<string, unknown> = {};
      const rows = () => [...store.values()].filter((r) => matches(r, filters, ins));
      const b = {
        select() {
          return b;
        },
        eq(col: string, val: unknown) {
          filters[col] = val;
          return b;
        },
        in(col: string, vals: unknown[]) {
          ins[col] = vals;
          return b;
        },
        order() {
          return b;
        },
        limit() {
          return b;
        },
        async maybeSingle() {
          if (table === "user_settings") return { data: null, error: null };
          return { data: rows()[0] ?? null, error: null };
        },
        async insert(row: Record<string, unknown>) {
          const id = `row${++autoId}`;
          store.set(id, { id, created_at: "2026-09-02", ...row } as unknown as Row);
          return { error: null };
        },
        update(p: Record<string, unknown>) {
          op = "update";
          patch = p;
          return b;
        },
        delete() {
          op = "delete";
          return b;
        },
        then(resolve: (v: { data: Row[]; error: null }) => void) {
          const hit = rows();
          if (op === "update") for (const r of hit) Object.assign(r, patch);
          else if (op === "delete") for (const r of hit) store.delete(r.id);
          resolve({ data: hit, error: null });
        },
      };
      return b;
    },
  };
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => makeDb() }));
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => makeDb() }));
vi.mock("@/lib/household/active", () => ({ getActiveHouseholdId: async () => "h1" }));

const rateOk = { ok: true, remaining: 1, limit: 3, resetAt: 0 };
const rateLimit = vi.fn(async (..._a: unknown[]) => rateOk);
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...a: unknown[]) => rateLimit(...a),
  RATE_LIMITS: {
    ingestEmailAddress: { limit: 3, windowMs: 1 },
    ingestEmailUser: { limit: 10, windowMs: 1 },
    ingestEmailConfirm: { limit: 8, windowMs: 1 },
  },
}));

const sendEmail = vi.fn(async (..._a: unknown[]) => ({ ok: true }));
const isEmailConfigured = vi.fn(() => true);
vi.mock("@/lib/email/send", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
  isEmailConfigured: () => isEmailConfigured(),
}));

import {
  requestIngestEmailVerification,
  confirmIngestEmail,
} from "@/modules/account/services/ingest-email-service";

const EMAIL = "memo@gmail.com";

/** Extrae el código de 6 dígitos del HTML enviado. */
function codeFromEmail(call = 0): string {
  const html = (sendEmail.mock.calls[call]![0] as { html: string }).html;
  return html.match(/\b(\d{6})\b/)![1]!;
}

beforeEach(() => {
  store.clear();
  autoId = 0;
  vi.clearAllMocks();
  isEmailConfigured.mockReturnValue(true);
  rateLimit.mockResolvedValue(rateOk);
});

describe("requestIngestEmailVerification", () => {
  it("crea fila pending (verified=false, hash) y envía el código al correo", async () => {
    const res = await requestIngestEmailVerification(EMAIL);
    expect(res.ok).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect((sendEmail.mock.calls[0]![0] as { to: string }).to).toBe(EMAIL);
    const row = findRow({ forwarder_email: EMAIL })!;
    expect(row.verified).toBe(false);
    expect(typeof row.verify_code_hash).toBe("string");
    expect(row.user_id).toBe("u1");
  });

  it("el código NUNCA vuelve al llamador: solo viaja por correo", async () => {
    const res = await requestIngestEmailVerification(EMAIL);
    expect(JSON.stringify(res)).not.toMatch(/\d{6}/);
  });

  it("correo inválido → error sin enviar", async () => {
    const res = await requestIngestEmailVerification("no-es-correo");
    expect(res.ok).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sin email configurado → error claro", async () => {
    isEmailConfigured.mockReturnValue(false);
    const res = await requestIngestEmailVerification(EMAIL);
    expect(res.ok).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("dirección ya registrada por OTRA cuenta → se rechaza sin tocarla ni enviar código", async () => {
    store.set("ajena", {
      id: "ajena",
      user_id: "otro",
      forwarder_email: EMAIL,
      verified: true,
    } as unknown as Row);
    const res = await requestIngestEmailVerification(EMAIL);
    expect(res.ok).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
    const row = findRow({ forwarder_email: EMAIL })!;
    expect(row.user_id).toBe("otro"); // intacta: no se secuestra
    expect(row.verified).toBe(true);
  });

  it("rate limit excedido → no envía correo (no se puede bombardear una dirección ajena)", async () => {
    rateLimit.mockResolvedValue({ ...rateOk, ok: false });
    const res = await requestIngestEmailVerification(EMAIL);
    expect(res.ok).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("confirmIngestEmail", () => {
  it("código correcto → verified=true, sella verified_at y limpia el código", async () => {
    await requestIngestEmailVerification(EMAIL);
    const res = await confirmIngestEmail(EMAIL, codeFromEmail());
    expect(res.ok).toBe(true);
    const row = findRow({ forwarder_email: EMAIL })!;
    expect(row.verified).toBe(true);
    expect(row.verify_code_hash).toBeNull();
    expect(typeof row.verified_at).toBe("string");
  });

  it("código incorrecto → error y sigue sin verificar", async () => {
    await requestIngestEmailVerification(EMAIL);
    const res = await confirmIngestEmail(EMAIL, "000000");
    expect(res.ok).toBe(false);
    expect(findRow({ forwarder_email: EMAIL })!.verified).toBe(false);
  });

  it("código vencido → error", async () => {
    await requestIngestEmailVerification(EMAIL);
    const code = codeFromEmail();
    findRow({ forwarder_email: EMAIL })!.verify_expires_at = "2020-01-01T00:00:00.000Z";
    const res = await confirmIngestEmail(EMAIL, code);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/venci/i);
  });

  it("no se puede verificar la fila de OTRA cuenta ni conociendo su código", async () => {
    store.set("ajena", {
      id: "ajena",
      user_id: "otro",
      forwarder_email: EMAIL,
      verified: false,
      verify_code_hash: "da4b9237bacccdf19c0760cab7aec4a8359010b0", // sha1 de "2", da igual: no llega a compararse
      verify_expires_at: "2099-01-01T00:00:00.000Z",
    } as unknown as Row);
    const res = await confirmIngestEmail(EMAIL, "123456");
    expect(res.ok).toBe(false);
    expect(findRow({ forwarder_email: EMAIL })!.verified).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// lookupOwnerByForwarder: solo verificados, y ante dos cuentas NO adivina.
// ---------------------------------------------------------------------------
import { lookupOwnerByForwarder } from "@/lib/ingestion/email/forwarder-lookup";

type EqCall = [string, unknown];
/** Fake del cliente service-role: la tabla de links responde una lista; user_settings, una tz. */
function lookupFake(
  links: { user_id: string; household_id: string | null }[],
  settings: { timezone: string | null } | null = null,
) {
  const eqCalls: EqCall[] = [];
  const make = (list: unknown[], single: unknown) => {
    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => {
        eqCalls.push([c, v]);
        return b;
      },
      in: () => b,
      limit: () => b,
      maybeSingle: async () => ({ data: single, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
        resolve({ data: list, error: null }),
    };
    return b;
  };
  const client = {
    from: (table: string) =>
      table === "user_settings" ? make([], settings) : make(links, links[0] ?? null),
  };
  return { client, eqCalls };
}

const asClient = (c: unknown) => c as Parameters<typeof lookupOwnerByForwarder>[0];

describe("lookupOwnerByForwarder · solo verificados y sin adivinar", () => {
  it("filtra verified=true y devuelve el dueño (tz null si no hay user_settings)", async () => {
    const { client, eqCalls } = lookupFake([{ user_id: "u1", household_id: "h1" }]);
    const out = await lookupOwnerByForwarder(asClient(client), ["memo@gmail.com"]);
    expect(out).toEqual({
      status: "found",
      owner: { userId: "u1", householdId: "h1", timezone: null },
    });
    expect(eqCalls).toContainEqual(["verified", true]);
  });

  it("adjunta la tz guardada del usuario (para fechar la propuesta en su zona, #90)", async () => {
    const { client } = lookupFake([{ user_id: "u1", household_id: "h1" }], {
      timezone: "America/Costa_Rica",
    });
    const out = await lookupOwnerByForwarder(asClient(client), ["memo@gmail.com"]);
    expect(out).toEqual({
      status: "found",
      owner: { userId: "u1", householdId: "h1", timezone: "America/Costa_Rica" },
    });
  });

  it("DOS cuentas distintas entre los candidatos → ambiguous, nunca una al azar", async () => {
    const { client } = lookupFake([
      { user_id: "u1", household_id: "h1" },
      { user_id: "u2", household_id: "h2" },
    ]);
    const out = await lookupOwnerByForwarder(asClient(client), ["memo@gmail.com", "ana@gmail.com"]);
    expect(out).toEqual({ status: "ambiguous", cuentas: 2 });
  });

  it("dos correos del MISMO hogar no son ambigüedad", async () => {
    const { client } = lookupFake([
      { user_id: "u1", household_id: "h1" },
      { user_id: "u2", household_id: "h1" },
    ]);
    const out = await lookupOwnerByForwarder(asClient(client), [
      "memo@gmail.com",
      "caro@gmail.com",
    ]);
    expect(out).toEqual({
      status: "found",
      owner: { userId: "u1", householdId: "h1", timezone: null },
    });
  });

  it("sin match → none", async () => {
    const { client } = lookupFake([]);
    const out = await lookupOwnerByForwarder(asClient(client), ["desconocido@gmail.com"]);
    expect(out).toEqual({ status: "none" });
  });

  it("candidatos vacíos → none sin query", async () => {
    const { client, eqCalls } = lookupFake([]);
    const out = await lookupOwnerByForwarder(asClient(client), []);
    expect(out).toEqual({ status: "none" });
    expect(eqCalls).toHaveLength(0);
  });
});

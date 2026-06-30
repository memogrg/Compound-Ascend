import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Fake Supabase (cliente de sesión): store en memoria por id; soporta el subset
// usado por el servicio (upsert / select+maybeSingle / update+eq).
// ---------------------------------------------------------------------------
type Row = Record<string, unknown> & { id: string; forwarder_email: string };
const store = new Map<string, Row>();

interface FakeBuilder {
  select(cols?: string): FakeBuilder;
  eq(col: string, val: unknown): FakeBuilder;
  order(...a: unknown[]): FakeBuilder;
  maybeSingle(): Promise<{ data: Row | null; error: null }>;
  upsert(row: Record<string, unknown>): Promise<{ error: null }>;
  update(patch: Record<string, unknown>): FakeBuilder;
  delete(): FakeBuilder;
  then(resolve: (v: { data: Row[]; error: null }) => void): void;
}

function findRow(filters: Record<string, unknown>): Row | null {
  return [...store.values()].find((r) => Object.entries(filters).every(([k, v]) => r[k] === v)) ?? null;
}

function makeDb() {
  return {
    from(): FakeBuilder {
      const filters: Record<string, unknown> = {};
      let op = "select";
      let patch: Record<string, unknown> = {};
      const b: FakeBuilder = {
        select() {
          return b;
        },
        eq(col, val) {
          filters[col] = val;
          return b;
        },
        order() {
          return b;
        },
        async maybeSingle() {
          return { data: findRow(filters), error: null };
        },
        async upsert(row) {
          const id = (row.id as string) ?? "row1";
          store.set(id, { id, created_at: "2026-06-29", ...row } as unknown as Row);
          return { error: null };
        },
        update(p) {
          op = "update";
          patch = p;
          return b;
        },
        delete() {
          op = "delete";
          return b;
        },
        then(resolve) {
          if (op === "update") {
            const row = findRow(filters);
            if (row) Object.assign(row, patch);
          } else if (op === "delete") {
            const row = findRow(filters);
            if (row) store.delete(row.id);
          }
          resolve({ data: [...store.values()], error: null });
        },
      };
      return b;
    },
  };
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: "u1" }) }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => makeDb() }));
vi.mock("@/lib/household/active", () => ({ getActiveHouseholdId: async () => "h1" }));

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
function codeFromEmail(): string {
  const html = (sendEmail.mock.calls[0]![0] as { html: string }).html;
  return html.match(/\b(\d{6})\b/)![1]!;
}

beforeEach(() => {
  store.clear();
  vi.clearAllMocks();
  isEmailConfigured.mockReturnValue(true);
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
});

describe("confirmIngestEmail", () => {
  it("código correcto → verified=true y limpia el código", async () => {
    await requestIngestEmailVerification(EMAIL);
    const code = codeFromEmail();
    const res = await confirmIngestEmail(EMAIL, code);
    expect(res.ok).toBe(true);
    const row = findRow({ forwarder_email: EMAIL })!;
    expect(row.verified).toBe(true);
    expect(row.verify_code_hash).toBeNull();
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
});

// ---------------------------------------------------------------------------
// lookupOwnerByForwarder: SOLO procesa filas verified=true.
// ---------------------------------------------------------------------------
import { lookupOwnerByForwarder } from "@/lib/ingestion/email/forwarder-lookup";

type EqCall = [string, unknown];
function lookupFake(row: { user_id: string; household_id: string | null } | null) {
  const eqCalls: EqCall[] = [];
  const b = {
    select: () => b,
    eq: (c: string, v: unknown) => {
      eqCalls.push([c, v]);
      return b;
    },
    in: () => b,
    limit: () => b,
    maybeSingle: async () => ({ data: row, error: null }),
  };
  return { client: { from: () => b }, eqCalls };
}

describe("lookupOwnerByForwarder · solo verificados", () => {
  it("filtra verified=true y devuelve el dueño", async () => {
    const { client, eqCalls } = lookupFake({ user_id: "u1", household_id: "h1" });
    const owner = await lookupOwnerByForwarder(
      client as unknown as Parameters<typeof lookupOwnerByForwarder>[0],
      ["memo@gmail.com"],
    );
    expect(owner).toEqual({ userId: "u1", householdId: "h1" });
    expect(eqCalls).toContainEqual(["verified", true]);
  });

  it("candidatos vacíos → null sin query", async () => {
    const { client } = lookupFake(null);
    const owner = await lookupOwnerByForwarder(
      client as unknown as Parameters<typeof lookupOwnerByForwarder>[0],
      [],
    );
    expect(owner).toBeNull();
  });
});

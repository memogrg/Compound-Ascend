/**
 * Atribución de referidos: las reglas y, sobre todo, las garantías.
 *
 * La garantía que más importa no es "el referido se cuenta", es "el alta NUNCA
 * falla por esto". Un código inexistente, una base caída o un auto-referido son
 * casos normales del mundo real; ninguno puede impedir que alguien cree su
 * cuenta.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const REFERRER = "user-referrer";
const NEW_USER = "user-nuevo";

let cookieValue: string | undefined;
let currentUser: { id: string } | null = { id: NEW_USER };
/** Fila existente en `referrals` para el usuario nuevo (o null). */
let existingReferral: { id: string } | null = null;
/** Código → id de usuario, como lo resuelve la RPC SECURITY DEFINER. */
let resolvedId: string | null = REFERRER;
let rpcError: unknown = null;
let insertError: { code?: string } | null = null;
const inserted: Record<string, unknown>[] = [];

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: (n: string) => (n === "ca_ref" && cookieValue ? { value: cookieValue } : undefined) })),
}));

vi.mock("@/lib/auth/session", () => ({
  getUser: vi.fn(async () => currentUser),
  isSupabaseConfigured: () => true,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({})),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: existingReferral, error: null }) }),
      }),
      insert: async (payload: Record<string, unknown>) => {
        if (insertError) return { error: insertError };
        inserted.push({ table, ...payload });
        return { error: null };
      },
    }),
    rpc: async (_fn: string, _args: unknown) => ({ data: resolvedId, error: rpcError }),
  })),
}));

const { attributeReferralFromCookie } = await import("@/lib/referrals/service");

beforeEach(() => {
  cookieValue = "ABCD2345";
  currentUser = { id: NEW_USER };
  existingReferral = null;
  resolvedId = REFERRER;
  rpcError = null;
  insertError = null;
  inserted.length = 0;
});

describe("camino feliz", () => {
  it("crea la fila con referrer y referido", async () => {
    expect(await attributeReferralFromCookie()).toBe("atribuido");
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      table: "referrals",
      referrer_user_id: REFERRER,
      referred_user_id: NEW_USER,
    });
  });

  it("el código llega normalizado (minúsculas en el link no rompen nada)", async () => {
    cookieValue = "abcd2345";
    expect(await attributeReferralFromCookie()).toBe("atribuido");
    expect(inserted).toHaveLength(1);
  });
});

describe("el ?ref sobrevive el viaje del OAuth", () => {
  it("la cookie es lo que se lee, no un estado en memoria del signup", async () => {
    // Reproduce el roundtrip: la página de signup ya no existe (se fue a Google
    // y volvió a /auth/callback); lo único que queda es la cookie.
    expect(await attributeReferralFromCookie()).toBe("atribuido");
    expect(inserted[0]).toMatchObject({ referrer_user_id: REFERRER });
  });

  it("sin cookie no hay atribución, pero tampoco error", async () => {
    cookieValue = undefined;
    expect(await attributeReferralFromCookie()).toBe("sin_codigo");
    expect(inserted).toHaveLength(0);
  });
});

describe("reglas", () => {
  it("auto-referido bloqueado: el código resuelve al propio usuario", async () => {
    resolvedId = NEW_USER;
    expect(await attributeReferralFromCookie()).toBe("auto_referido");
    expect(inserted).toHaveLength(0);
  });

  it("código inexistente se ignora en silencio", async () => {
    resolvedId = null;
    expect(await attributeReferralFromCookie()).toBe("codigo_invalido");
    expect(inserted).toHaveLength(0);
  });

  it("código con forma inválida ni siquiera consulta la base", async () => {
    cookieValue = "no-es-un-codigo";
    expect(await attributeReferralFromCookie()).toBe("codigo_invalido");
    expect(inserted).toHaveLength(0);
  });

  it("si ya tiene referrer, NO se sobreescribe", async () => {
    // El primero que lo trajo se lo queda; un segundo link no puede robarlo.
    existingReferral = { id: "fila-previa" };
    expect(await attributeReferralFromCookie()).toBe("ya_referido");
    expect(inserted).toHaveLength(0);
  });
});

describe("idempotencia", () => {
  it("dos llamadas seguidas (callback + bienvenida) insertan UNA sola vez", async () => {
    expect(await attributeReferralFromCookie()).toBe("atribuido");
    // La segunda ve la fila que dejó la primera.
    existingReferral = { id: "fila-recien-creada" };
    expect(await attributeReferralFromCookie()).toBe("ya_referido");
    expect(inserted).toHaveLength(1);
  });

  it("una carrera perdida contra el UNIQUE no es un fallo", async () => {
    // 23505 = unique_violation. Es el resultado ESPERADO del diseño: dos
    // llamadas concurrentes, una gana, la otra se resigna sin ruido.
    insertError = { code: "23505" };
    expect(await attributeReferralFromCookie()).toBe("ya_referido");
  });
});

describe("el alta nunca falla por el referido", () => {
  it("un error de la RPC no lanza: devuelve 'error' y sigue", async () => {
    rpcError = new Error("db caída");
    await expect(attributeReferralFromCookie()).resolves.toBe("error");
  });

  it("un error inesperado del insert no lanza", async () => {
    insertError = { code: "42501" }; // permiso denegado
    await expect(attributeReferralFromCookie()).resolves.toBe("error");
  });

  it("sin sesión no lanza", async () => {
    currentUser = null;
    await expect(attributeReferralFromCookie()).resolves.toBe("sin_codigo");
  });

  it("NINGÚN caso lanza hacia afuera", async () => {
    // La garantía completa, en un solo lugar: se recorren todos los escenarios
    // y ninguno propaga una excepción al alta.
    const escenarios: (() => void)[] = [
      () => { cookieValue = undefined; },
      () => { cookieValue = "basura"; },
      () => { resolvedId = null; },
      () => { resolvedId = NEW_USER; },
      () => { existingReferral = { id: "x" }; },
      () => { rpcError = new Error("boom"); },
      () => { insertError = { code: "42501" }; },
      () => { currentUser = null; },
    ];
    for (const preparar of escenarios) {
      cookieValue = "ABCD2345";
      currentUser = { id: NEW_USER };
      existingReferral = null;
      resolvedId = REFERRER;
      rpcError = null;
      insertError = null;
      preparar();
      await expect(attributeReferralFromCookie()).resolves.toBeTypeOf("string");
    }
  });
});

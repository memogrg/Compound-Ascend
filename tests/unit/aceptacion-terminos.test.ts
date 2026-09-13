/**
 * Aceptación de Términos y Privacidad.
 *
 * Lo que estos casos protegen no es un campo de formulario: es poder demostrar QUÉ
 * texto aceptó cada persona y cuándo. Por eso se guarda la versión y no un booleano —
 * un «aceptó = true» no dice nada el día que el texto cambie.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const avisos = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { warn: (...a: unknown[]) => avisos(...a), error: vi.fn(), info: vi.fn() },
}));

import { signUpSchema, empezarSchema, aceptaTerminosSchema } from "@/lib/auth/schemas";
import { LEGAL_VERSION } from "@/lib/legal/version";

const ALTA_OK = {
  displayName: "Memo",
  email: "memo@ejemplo.com",
  password: "unaclavelarga",
  confirm: "unaclavelarga",
  acepta_terminos: "on",
};

describe("el schema exige la casilla", () => {
  it("con la casilla marcada, pasa", () => {
    expect(signUpSchema.safeParse(ALTA_OK).success).toBe(true);
  });

  it("sin la casilla, falla", () => {
    // Un checkbox sin marcar NO viaja en el FormData: llega null, no "off".
    const r = signUpSchema.safeParse({ ...ALTA_OK, acepta_terminos: null });
    expect(r.success).toBe(false);
  });

  it('"off" tampoco alcanza', () => {
    const r = signUpSchema.safeParse({ ...ALTA_OK, acepta_terminos: "off" });
    expect(r.success).toBe(false);
  });

  it("el mensaje dice qué hacer, no «valor inválido»", () => {
    const r = aceptaTerminosSchema.safeParse(null);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0]!.message).toMatch(/acept[áa]r? los T[ée]rminos/i);
    }
  });

  it("el alta de /empezar también la exige", () => {
    const base = { email: "a@b.com", password: "unaclavelarga", plan: "pro" };
    expect(empezarSchema.safeParse({ ...base, acepta_terminos: "on" }).success).toBe(true);
    expect(empezarSchema.safeParse({ ...base, acepta_terminos: null }).success).toBe(false);
  });

  it("el error cae en el campo de la casilla, no en otro", () => {
    const r = signUpSchema.safeParse({ ...ALTA_OK, acepta_terminos: null });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path[0] === "acepta_terminos")).toBe(true);
    }
  });
});

// ── La escritura ────────────────────────────────────────────────────────────

/** Supabase mínimo: solo `from("profiles").update(...).eq(...)`. */
const updates: Record<string, unknown>[] = [];
let errorDeUpdate: { message: string } | null = null;
let errorDeLectura: { message: string } | null = null;
let usuario: { id: string } | null = { id: "u-1" };
let perfil: { terms_version: string | null } | null = { terms_version: null };

function cliente() {
  return {
    from: () => ({
      update: (patch: Record<string, unknown>) => ({
        eq: async () => {
          updates.push(patch);
          return { error: errorDeUpdate };
        },
      }),
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: errorDeLectura ? null : perfil,
            error: errorDeLectura,
          }),
        }),
      }),
    }),
  };
}

vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => cliente() }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => cliente() }));
vi.mock("@/lib/auth/session", () => ({
  requireUser: async () => {
    if (!usuario) throw new Error("sin sesión");
    return usuario;
  },
}));

import {
  registrarAceptacionConServicio,
  registrarAceptacionDelUsuario,
  aceptacionPendiente,
} from "@/lib/legal/aceptacion";

beforeEach(() => {
  updates.length = 0;
  avisos.mockClear();
  errorDeUpdate = null;
  errorDeLectura = null;
  usuario = { id: "u-1" };
  perfil = { terms_version: null };
});

describe("registrarAceptacionDelUsuario", () => {
  it("guarda la versión vigente y la fecha", async () => {
    const r = await registrarAceptacionDelUsuario();

    expect(r.ok).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.terms_version).toBe(LEGAL_VERSION);
    expect(typeof updates[0]!.terms_accepted_at).toBe("string");
  });

  it("guarda la VERSIÓN, no un booleano — sin ella no se sabe qué se aceptó", () => {
    expect(LEGAL_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("si el update falla, lo dice en vez de fingir que guardó", async () => {
    errorDeUpdate = { message: "boom" };
    const r = await registrarAceptacionDelUsuario();
    expect(r.ok).toBe(false);
  });

  it("sin sesión no escribe nada", async () => {
    usuario = null;
    await expect(registrarAceptacionDelUsuario()).rejects.toThrow();
    expect(updates).toHaveLength(0);
  });
});

describe("registrarAceptacionConServicio", () => {
  it("escribe la marca del alta", async () => {
    await registrarAceptacionConServicio("u-9");
    expect(updates[0]!.terms_version).toBe(LEGAL_VERSION);
  });

  it("un fallo NO tumba el alta: dejar a alguien sin cuenta sería peor", async () => {
    errorDeUpdate = { message: "boom" };
    await expect(registrarAceptacionConServicio("u-9")).resolves.toBeUndefined();
  });

  it("pero deja RASTRO: un alta sin registro no puede pasar en silencio", async () => {
    errorDeUpdate = { message: 'column "terms_version" does not exist' };

    await registrarAceptacionConServicio("u-9");

    expect(avisos).toHaveBeenCalledTimes(1);
    // El aviso tiene que servir para actuar: a quién le pasó y qué falló.
    const meta = avisos.mock.calls[0]![1] as Record<string, unknown>;
    expect(meta.userId).toBe("u-9");
    expect(String(meta.message)).toContain("terms_version");
  });
});

describe("aceptacionPendiente", () => {
  it("perfil sin versión → pendiente", async () => {
    perfil = { terms_version: null };
    expect(await aceptacionPendiente("u-1")).toBe(true);
  });

  it("perfil con la versión vigente → no molesta", async () => {
    perfil = { terms_version: LEGAL_VERSION };
    expect(await aceptacionPendiente("u-1")).toBe(false);
  });

  it("versión vieja → vuelve a pedirla (así reaparece el banner al subir LEGAL_VERSION)", async () => {
    perfil = { terms_version: "2020-01-01" };
    expect(await aceptacionPendiente("u-1")).toBe(true);
  });

  it("sin fila de perfil todavía no molesta a nadie", async () => {
    perfil = null;
    expect(await aceptacionPendiente("u-1")).toBe(false);
  });

  it("si la lectura falla no molesta, pero lo LOGUEA (columna sin migrar)", async () => {
    errorDeLectura = { message: 'column "terms_version" does not exist' };

    expect(await aceptacionPendiente("u-1")).toBe(false);
    expect(avisos).toHaveBeenCalledTimes(1);
  });
});

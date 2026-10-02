/**
 * El nombre que manda Apple nunca pisa el que puso la persona.
 *
 * Apple entrega nombre y apellido UNA SOLA VEZ, en el primer login de cada Apple ID. Eso
 * empuja a guardarlo apenas llega — y ahí está el riesgo: si alguien ya se puso un nombre,
 * un "apenas llega" sin condición se lo borraría con lo que Apple diga, sin aviso y sin
 * vuelta atrás, porque Apple no lo vuelve a mandar.
 *
 * La condición es que solo se escribe sobre el RELLENO del trigger `handle_new_user`
 * (`split_part(email, '@', 1)`) o sobre nada. Con "Ocultar mi correo" ese relleno es basura
 * tipo `k7x2m9q`, que es justo lo que este nombre viene a arreglar.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

let usuario = { id: "user-1", email: "memo@ejemplo.com" };
vi.mock("@/lib/auth/session", () => ({
  isSupabaseConfigured: () => true,
  getUser: vi.fn(async () => usuario),
  requireUser: vi.fn(async () => usuario),
}));
vi.mock("@/lib/revalidation/rutas-espejo", () => ({
  revalidarRuta: vi.fn(),
  revalidarRutas: vi.fn(),
}));

let nombreEnBase: string | null = null;
const escrituras: Record<string, unknown>[] = [];
const metadatos: Record<string, unknown>[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { display_name: nombreEnBase }, error: null }),
        }),
      }),
      update: (payload: Record<string, unknown>) => ({
        eq: async () => {
          escrituras.push(payload);
          return { error: null };
        },
      }),
    }),
    auth: {
      updateUser: async (payload: Record<string, unknown>) => {
        metadatos.push(payload);
        return { error: null };
      },
    },
  })),
}));

import { setDisplayNameFromProviderAction } from "@/modules/account/api/actions";

beforeEach(() => {
  escrituras.length = 0;
  metadatos.length = 0;
  nombreEnBase = null;
  usuario = { id: "user-1", email: "memo@ejemplo.com" };
});

describe("setDisplayNameFromProviderAction", () => {
  it("sobre el relleno del trigger, escribe", async () => {
    nombreEnBase = "memo"; // split_part("memo@ejemplo.com", "@", 1)
    const r = await setDisplayNameFromProviderAction({
      givenName: "Guillermo",
      familyName: "Rivera",
    });
    expect(r.ok).toBe(true);
    expect(escrituras).toEqual([{ display_name: "Guillermo Rivera" }]);
    // También al metadato de auth, que es lo que lee getAccountInfo.
    expect(metadatos).toEqual([{ data: { display_name: "Guillermo Rivera" } }]);
  });

  it("sin nombre previo, también escribe", async () => {
    nombreEnBase = null;
    await setDisplayNameFromProviderAction({ givenName: "Guillermo", familyName: "" });
    expect(escrituras).toEqual([{ display_name: "Guillermo" }]);
  });

  it("con «Ocultar mi correo», el relleno es basura y se reemplaza", async () => {
    usuario = { id: "user-1", email: "k7x2m9q@privaterelay.appleid.com" };
    nombreEnBase = "k7x2m9q";
    await setDisplayNameFromProviderAction({ givenName: "Guillermo", familyName: "Rivera" });
    expect(escrituras).toEqual([{ display_name: "Guillermo Rivera" }]);
  });

  it("un nombre puesto por la persona NO se toca", async () => {
    nombreEnBase = "Memo R.";
    const r = await setDisplayNameFromProviderAction({
      givenName: "Guillermo",
      familyName: "Rivera",
    });
    expect(r.ok).toBe(true);
    expect(escrituras).toEqual([]);
    expect(metadatos).toEqual([]);
  });

  it("sin nombre del proveedor no hace nada, ni siquiera lee", async () => {
    nombreEnBase = "memo";
    const r = await setDisplayNameFromProviderAction({ givenName: "", familyName: "" });
    expect(r.ok).toBe(true);
    expect(escrituras).toEqual([]);
  });

  it("recorta y rechaza lo que no cabe", async () => {
    nombreEnBase = "memo";
    await setDisplayNameFromProviderAction({ givenName: "  Guillermo  ", familyName: " Rivera " });
    expect(escrituras).toEqual([{ display_name: "Guillermo Rivera" }]);

    escrituras.length = 0;
    const largo = await setDisplayNameFromProviderAction({ givenName: "G".repeat(81) });
    expect(largo.ok).toBe(false);
    expect(escrituras).toEqual([]);
  });
});

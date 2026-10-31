/**
 * registrarCambioDiferido: la app anota el cambio DEFERRED que RevenueCat no le avisa al webhook.
 *
 *  1. Valida todo antes de escribir: sesión, que pague por la tienda, que el producto sea nuestro
 *     y que el cambio sea diferido. Si algo falla, no toca la cuenta y deja un warn.
 *  2. Bajada: programa el plan menor para cuando vence lo pagado y anota el pendiente.
 *  3. Mismo plan con otro período: solo el pendiente; el plan no se toca.
 *  4. Idempotente.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const log = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: log }));

const USER = "11111111-2222-4333-8444-555555555555";
const FIN = "2026-11-12T00:00:00.000Z";

const sesion = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("@/lib/auth/session", () => ({ getUser: vi.fn(async () => sesion.user) }));

type Perfil = Record<string, unknown>;
let perfil: Perfil;

const sus = vi.hoisted(() => ({
  getEstadoSuscripcion: vi.fn(),
  programarBajada: vi.fn(),
}));
vi.mock("@/modules/account/services/subscription-service", () => sus);

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { ...perfil }, error: null }) }),
      }),
      update: (patch: Perfil) => ({
        eq: async () => {
          Object.assign(perfil, patch);
          return { error: null };
        },
      }),
    }),
  }),
}));

import { registrarCambioDiferido } from "@/modules/account/api/cambio-diferido-actions";

/** Quien paga Pro+ mensual en Google Play, con el período en curso hasta FIN. */
function pagaProMensual(extra: Perfil = {}) {
  perfil = {
    plan: "pro",
    plan_pending: null,
    store_subscription_active: true,
    store_product_id: "cartera_proplus_mensual:mensual",
    store_product_pending: null,
    store_period_end: FIN,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sesion.user = { id: USER };
  pagaProMensual();
  sus.getEstadoSuscripcion.mockImplementation(async () => ({
    plan: perfil.plan,
    origen: perfil.store_subscription_active ? "store" : "ninguna",
    tienda: perfil.store_subscription_active
      ? { plataforma: "android", finDePeriodo: perfil.store_period_end }
      : null,
  }));
  sus.programarBajada.mockImplementation(async (_u: string, destino: string, cuando: string) => {
    perfil.plan_pending = destino;
    return { ok: true, cambiaEl: cuando };
  });
});

describe("registrarCambioDiferido", () => {
  it("bajada: programa el plan menor al fin del período y anota el pendiente", async () => {
    const r = await registrarCambioDiferido("cartera_esencial_mensual:mensual");
    expect(r).toEqual({ ok: true });
    expect(sus.programarBajada).toHaveBeenCalledWith(USER, "esencial", FIN);
    expect(perfil).toMatchObject({
      store_product_id: "cartera_proplus_mensual:mensual",
      store_product_pending: "cartera_esencial_mensual:mensual",
      plan_pending: "esencial",
    });
  });

  it("mismo plan con otro período: solo el pendiente, el plan no se toca", async () => {
    const r = await registrarCambioDiferido("cartera_proplus_mensual:anual");
    expect(r).toEqual({ ok: true });
    expect(perfil.store_product_pending).toBe("cartera_proplus_mensual:anual");
    expect(sus.programarBajada).not.toHaveBeenCalled();
  });

  it("es idempotente: repetirla deja la cuenta igual", async () => {
    await registrarCambioDiferido("cartera_esencial_mensual:mensual");
    const despues = { ...perfil };
    expect(await registrarCambioDiferido("cartera_esencial_mensual:mensual")).toEqual({ ok: true });
    expect(perfil).toEqual(despues);
  });

  it("sin sesión no escribe nada", async () => {
    sesion.user = null;
    expect(await registrarCambioDiferido("cartera_proplus_mensual:anual")).toEqual({ ok: false });
    expect(perfil.store_product_pending).toBeNull();
    expect(log.warn).toHaveBeenCalled();
  });

  it("si no paga por la tienda no escribe nada", async () => {
    pagaProMensual({ store_subscription_active: false });
    expect(await registrarCambioDiferido("cartera_proplus_mensual:anual")).toEqual({ ok: false });
    expect(perfil.store_product_pending).toBeNull();
    expect(log.warn).toHaveBeenCalled();
  });

  it("un producto que no es nuestro no escribe nada", async () => {
    expect(await registrarCambioDiferido("otro_producto")).toEqual({ ok: false });
    expect(perfil.store_product_pending).toBeNull();
    expect(log.warn).toHaveBeenCalled();
  });

  it("una subida no es diferida: no escribe nada (la aplica el webhook)", async () => {
    expect(await registrarCambioDiferido("cartera_maxplus_mensual:mensual")).toEqual({
      ok: false,
    });
    expect(perfil.store_product_pending).toBeNull();
    expect(sus.programarBajada).not.toHaveBeenCalled();
  });

  it("el mismo producto que ya paga no es un cambio: no escribe nada", async () => {
    expect(await registrarCambioDiferido("cartera_proplus_mensual:mensual")).toEqual({
      ok: false,
    });
    expect(perfil.store_product_pending).toBeNull();
  });

  it("bajada sin fin de período de la tienda: no programa ni anota (nunca fechas de Stripe)", async () => {
    pagaProMensual({ store_period_end: null });
    expect(await registrarCambioDiferido("cartera_esencial_mensual:mensual")).toEqual({
      ok: false,
    });
    expect(sus.programarBajada).not.toHaveBeenCalled();
    expect(perfil.store_product_pending).toBeNull();
    expect(perfil.plan_pending).toBeNull();
    expect(log.warn).toHaveBeenCalledWith(
      "cambio diferido: bajada sin fin de período de la tienda",
      expect.anything(),
    );
  });

  it("si la bajada no se puede programar, tampoco anota el pendiente", async () => {
    sus.programarBajada.mockResolvedValueOnce({ ok: false, message: "sin fecha" });
    expect(await registrarCambioDiferido("cartera_esencial_mensual:mensual")).toEqual({
      ok: false,
    });
    expect(perfil.store_product_pending).toBeNull();
  });
});

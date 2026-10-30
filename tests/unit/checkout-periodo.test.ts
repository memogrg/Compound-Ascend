/**
 * El checkout con período contra el `precioDe` REAL (solo se finge el cliente de Stripe):
 * quien eligió el anual paga el anual o no paga. Si el precio anual no existe, el checkout
 * no se abre y NUNCA se pide la key mensual para «salvar» la venta. Y /empezar/pagar lleva
 * ese fallo de vuelta a /empezar con `error=precio`, sin perder plan ni período.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const list = vi.hoisted(() =>
  vi.fn(async (_p: { lookup_keys: string[] }) => ({ data: [] as { id: string }[] })),
);
const sessionsCreate = vi.hoisted(() => vi.fn(async (_p: unknown) => ({ url: "https://pago" })));
vi.mock("stripe", () => ({
  default: class {
    prices = { list };
    checkout = { sessions: { create: sessionsCreate } };
    customers = { create: async () => ({ id: "cus_nuevo" }) };
  },
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => {
      const q = {
        select: () => q,
        update: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: { stripe_customer_id: "cus_1" } }),
      };
      return q;
    },
  }),
}));

// /empezar/pagar: sesión sin plan; `redirect` lanza como el de Next.
const redirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/session", () => ({
  getUser: async () => ({ id: "u1", email: "vos@correo.com" }),
}));
vi.mock("@/lib/env", () => ({ getClientEnv: () => ({ NEXT_PUBLIC_APP_URL: "https://app.test" }) }));
vi.mock("@/modules/account/services/subscription-service", () => ({
  getEstadoSuscripcion: async () => ({ plan: "ninguno", origen: null, finDePrueba: null }),
}));

import {
  crearCheckout,
  MENSAJE_PRECIO_NO_DISPONIBLE,
} from "@/modules/account/services/checkout-service";
import PagarPage from "@/app/empezar/pagar/page";

/** Solo existen los precios de estas keys. */
function preciosActivos(...keys: string[]) {
  list.mockImplementation(async ({ lookup_keys }) => ({
    data: lookup_keys.filter((k) => keys.includes(k)).map((k) => ({ id: `price_${k}` })),
  }));
}

const BASE = {
  userId: "u1",
  email: "vos@correo.com",
  yaUsoPrueba: false,
  baseUrl: "https://app.test",
  origen: "empezar" as const,
};

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_falsa");
  list.mockReset();
  sessionsCreate.mockClear();
  redirect.mockClear();
});

describe("crearCheckout · período", () => {
  it("anual sin precio anual: no abre el pago y NUNCA pide la key mensual", async () => {
    // El mensual SÍ existe: la tentación de caer a él es real, y no se cae.
    preciosActivos("carteraplus_pro_mensual");
    const r = await crearCheckout({ ...BASE, plan: "pro", periodo: "anual" });

    expect(r).toEqual({
      ok: false,
      motivo: "precio_no_disponible",
      message: MENSAJE_PRECIO_NO_DISPONIBLE.anual,
    });
    const pedidas = list.mock.calls.flatMap(([p]) => p.lookup_keys);
    expect(pedidas).toEqual(["carteraplus_pro_anual"]);
    expect(pedidas).not.toContain("carteraplus_pro_mensual");
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("anual con precio anual: el checkout lleva ese precio, y solo esa key se pidió", async () => {
    preciosActivos("carteraplus_max_anual", "carteraplus_max_mensual");
    const r = await crearCheckout({ ...BASE, plan: "max", periodo: "anual" });

    expect(r).toEqual({ ok: true, url: "https://pago" });
    expect(list.mock.calls.flatMap(([p]) => p.lookup_keys)).toEqual(["carteraplus_max_anual"]);
    const params = sessionsCreate.mock.calls[0]![0] as { line_items: unknown };
    expect(params.line_items).toEqual([{ price: "price_carteraplus_max_anual", quantity: 1 }]);
  });

  it("mensual sin precio mensual: tampoco cae al anual", async () => {
    preciosActivos("carteraplus_esencial_anual");
    const r = await crearCheckout({ ...BASE, plan: "esencial", periodo: "mensual" });

    expect(r.motivo).toBe("precio_no_disponible");
    expect(list.mock.calls.flatMap(([p]) => p.lookup_keys)).toEqual([
      "carteraplus_esencial_mensual",
    ]);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("otro error de Stripe no se confunde con precio no disponible", async () => {
    list.mockRejectedValue(new Error("red"));
    const r = await crearCheckout({ ...BASE, plan: "pro", periodo: "anual" });
    expect(r).toEqual({ ok: false, message: "No pudimos abrir el pago. Intentá de nuevo." });
  });
});

describe("/empezar/pagar · período", () => {
  async function pagar(searchParams: { plan?: string; periodo?: string }) {
    try {
      await PagarPage({ searchParams: Promise.resolve(searchParams) });
    } catch {
      // redirect lanza
    }
    return redirect.mock.calls.at(-1)?.[0];
  }

  it("el período elegido llega al checkout", async () => {
    preciosActivos("carteraplus_pro_anual");
    expect(await pagar({ plan: "pro", periodo: "anual" })).toBe("https://pago");
    expect(list.mock.calls.flatMap(([p]) => p.lookup_keys)).toEqual(["carteraplus_pro_anual"]);
  });

  it("sin precio anual: vuelve a /empezar con plan, período y error=precio", async () => {
    preciosActivos("carteraplus_pro_mensual");
    expect(await pagar({ plan: "pro", periodo: "anual" })).toBe(
      "/empezar?plan=pro&periodo=anual&error=precio",
    );
  });

  it("sin período (enlaces viejos): mensual", async () => {
    preciosActivos("carteraplus_pro_mensual");
    expect(await pagar({ plan: "pro" })).toBe("https://pago");
    expect(list.mock.calls.flatMap(([p]) => p.lookup_keys)).toEqual(["carteraplus_pro_mensual"]);
  });

  it("un período inventado cae a mensual, no a un error", async () => {
    preciosActivos("carteraplus_pro_mensual");
    expect(await pagar({ plan: "pro", periodo: "semanal" })).toBe("https://pago");
  });
});

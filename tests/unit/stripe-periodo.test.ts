/**
 * Stripe con período: las seis lookup_keys dan plan (si faltara una, el webhook dejaría a la
 * persona pagando sin plan), el período sale del intervalo del precio, y pedir un precio que no
 * existe falla con `PrecioNoDisponible` sin caer a otro período.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const list = vi.hoisted(() =>
  vi.fn(async (_p: { lookup_keys: string[] }) => ({ data: [] as { id: string }[] })),
);
vi.mock("stripe", () => ({
  default: class {
    prices = { list };
  },
}));

import {
  LOOKUP_KEY,
  PrecioNoDisponible,
  periodoDeSuscripcion,
  planDeSuscripcion,
  precioDe,
} from "@/lib/billing/stripe";

function sub(price: Record<string, unknown>) {
  return { items: { data: [{ price }] } } as never;
}

beforeEach(() => {
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_falsa");
  list.mockReset();
  list.mockResolvedValue({ data: [] });
});

describe("planDeSuscripcion · las seis lookup_keys", () => {
  it.each([
    ["carteraplus_esencial_mensual", "esencial"],
    ["carteraplus_pro_mensual", "pro"],
    ["carteraplus_max_mensual", "max"],
    ["carteraplus_esencial_anual", "esencial"],
    ["carteraplus_pro_anual", "pro"],
    ["carteraplus_max_anual", "max"],
  ])("%s → %s", (key, plan) => {
    expect(planDeSuscripcion(sub({ lookup_key: key }))).toBe(plan);
  });

  it("una key desconocida sin metadata → null", () => {
    expect(planDeSuscripcion(sub({ lookup_key: "otra" }))).toBeNull();
  });
});

describe("periodoDeSuscripcion", () => {
  it("manda el intervalo del precio", () => {
    expect(periodoDeSuscripcion(sub({ recurring: { interval: "year" } }))).toBe("anual");
    expect(periodoDeSuscripcion(sub({ recurring: { interval: "month" } }))).toBe("mensual");
  });

  it("el intervalo gana aunque el lookup_key diga otra cosa", () => {
    expect(
      periodoDeSuscripcion(
        sub({ lookup_key: "carteraplus_pro_mensual", recurring: { interval: "year" } }),
      ),
    ).toBe("anual");
  });

  it("sin intervalo, por lookup_key", () => {
    expect(periodoDeSuscripcion(sub({ lookup_key: "carteraplus_max_anual" }))).toBe("anual");
    expect(periodoDeSuscripcion(sub({ lookup_key: "carteraplus_max_mensual" }))).toBe("mensual");
  });

  it("sin nada reconocible → null", () => {
    expect(periodoDeSuscripcion(sub({ lookup_key: "otra" }))).toBeNull();
    expect(periodoDeSuscripcion({ items: { data: [] } } as never)).toBeNull();
  });
});

describe("precioDe", () => {
  it("pide solo la key del plan y período elegidos", async () => {
    list.mockResolvedValue({ data: [{ id: "price_pro_anual" }] });
    await expect(precioDe("pro", "anual")).resolves.toBe("price_pro_anual");
    expect(list).toHaveBeenCalledTimes(1);
    expect(list.mock.calls[0]![0].lookup_keys).toEqual([LOOKUP_KEY.pro.anual]);
  });

  it("si el anual no existe: PrecioNoDisponible y nunca pide la key mensual", async () => {
    const err = await precioDe("max", "anual").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PrecioNoDisponible);
    expect(err).toMatchObject({ plan: "max", periodo: "anual" });
    const pedidas = list.mock.calls.flatMap((c) => c[0].lookup_keys);
    expect(pedidas).toEqual(["carteraplus_max_anual"]);
    expect(pedidas).not.toContain(LOOKUP_KEY.max.mensual);
  });
});

/**
 * Paywall nativo: qué plan y qué período es cada paquete de la tienda, en qué orden se
 * muestran, cuánto ahorra el anual y cuándo un rechazo de la compra es solo que la persona
 * cerró la hoja de pago.
 */
import { describe, it, expect } from "vitest";
import {
  agruparPorPlan,
  ahorroAnual,
  esCambioRechazado,
  esCompraCancelada,
  tarjetasDelPeriodo,
} from "@/lib/billing/store-offerings";

const pkg = (id: string, productId: string, price = 9.99, priceString = `$${price}`) => ({
  identifier: id,
  product: { identifier: productId, price, priceString },
});

/** La oferta de Google Play como la da RevenueCat: un producto por plan, dos base plans. */
const OFERTA_PLAY = [
  pkg("max_anual", "cartera_maxplus_mensual:anual", 450),
  pkg("esencial", "cartera_esencial_mensual:mensual", 17),
  pkg("pro_anual", "cartera_proplus_mensual:anual", 320),
  pkg("pro", "cartera_proplus_mensual:mensual", 34),
  pkg("esencial_anual", "cartera_esencial_mensual:anual", 160),
  pkg("max", "cartera_maxplus_mensual:mensual", 47),
];

describe("agruparPorPlan", () => {
  it("Play: junta mensual y anual de cada plan y ordena Esencial+ → Pro+ → Max+", () => {
    const r = agruparPorPlan(OFERTA_PLAY);
    expect(r.map((g) => [g.plan, g.mensual?.identifier, g.anual?.identifier])).toEqual([
      ["esencial", "esencial", "esencial_anual"],
      ["pro", "pro", "pro_anual"],
      ["max", "max", "max_anual"],
    ]);
  });

  it("Apple: el anual es otro producto", () => {
    const r = agruparPorPlan([
      pkg("pro_anual", "cartera_proplus_anual"),
      pkg("pro", "cartera_proplus_mensual"),
    ]);
    expect(r).toEqual([
      {
        plan: "pro",
        mensual: expect.objectContaining({ identifier: "pro" }),
        anual: expect.objectContaining({ identifier: "pro_anual" }),
      },
    ]);
  });

  it("sin anuales en la oferta: cada plan con anual null", () => {
    const r = agruparPorPlan([
      pkg("e", "cartera_esencial_mensual"),
      pkg("p", "cartera_proplus_mensual"),
    ]);
    expect(r.map((g) => [g.plan, g.anual])).toEqual([
      ["esencial", null],
      ["pro", null],
    ]);
  });

  it("descarta productos que no son nuestros", () => {
    const r = agruparPorPlan([pkg("x", "otro_producto"), pkg("e", "cartera_esencial_mensual")]);
    expect(r.map((g) => g.plan)).toEqual(["esencial"]);
  });

  it("con dos paquetes del mismo plan y período queda el primero", () => {
    const r = agruparPorPlan([
      pkg("pro-a", "cartera_proplus_mensual"),
      pkg("pro-b", "cartera_proplus_mensual:mensual"),
    ]);
    expect(r[0]?.mensual?.identifier).toBe("pro-a");
  });

  it("no toca el precio: el paquete sale tal cual lo dio la tienda", () => {
    const original = pkg("e", "cartera_esencial_mensual", 5990, "₡5.990,00");
    expect(agruparPorPlan([original])[0]?.mensual).toBe(original);
  });

  it("oferta vacía → lista vacía", () => {
    expect(agruparPorPlan([])).toEqual([]);
  });
});

describe("ahorroAnual", () => {
  const p = (price: number) => ({ product: { price } });

  it("redondea hacia abajo: nunca promete más de lo real", () => {
    // 160 / (17 × 12 = 204) → 21,57 % → 21
    expect(ahorroAnual(p(17), p(160))).toBe(21);
    // 320 / 408 → 21,57 % → 21; 450 / 564 → 20,21 % → 20
    expect(ahorroAnual(p(34), p(320))).toBe(21);
    expect(ahorroAnual(p(47), p(450))).toBe(20);
  });

  it("si el anual no ahorra al menos 1 %, nada", () => {
    expect(ahorroAnual(p(10), p(120))).toBeNull();
    expect(ahorroAnual(p(10), p(119))).toBeNull(); // 0,83 %
    expect(ahorroAnual(p(10), p(130))).toBeNull();
  });

  it("falta un precio o no es válido → nada", () => {
    expect(ahorroAnual(null, p(160))).toBeNull();
    expect(ahorroAnual(p(17), null)).toBeNull();
    expect(ahorroAnual(p(0), p(160))).toBeNull();
    expect(ahorroAnual(p(17), p(Number.NaN))).toBeNull();
  });
});

describe("tarjetasDelPeriodo", () => {
  const grupos = agruparPorPlan(OFERTA_PLAY);

  it("mensual: el paquete mensual de cada plan, sin ahorro", () => {
    expect(
      tarjetasDelPeriodo(grupos, "mensual").map((t) => [t.plan, t.paquete.identifier, t.ahorro]),
    ).toEqual([
      ["esencial", "esencial", null],
      ["pro", "pro", null],
      ["max", "max", null],
    ]);
  });

  it("anual: el paquete anual de cada plan, con su ahorro", () => {
    expect(
      tarjetasDelPeriodo(grupos, "anual").map((t) => [t.plan, t.paquete.identifier, t.ahorro]),
    ).toEqual([
      ["esencial", "esencial_anual", 21],
      ["pro", "pro_anual", 21],
      ["max", "max_anual", 20],
    ]);
  });

  it("un plan sin paquete de ese período no tiene tarjeta", () => {
    const r = agruparPorPlan([
      pkg("e", "cartera_esencial_mensual"),
      pkg("p", "cartera_proplus_mensual"),
      pkg("p_anual", "cartera_proplus_anual", 99),
    ]);
    expect(tarjetasDelPeriodo(r, "anual").map((t) => t.plan)).toEqual(["pro"]);
  });

  it("el anual sin mensual se ofrece, pero sin ahorro", () => {
    const r = agruparPorPlan([pkg("p_anual", "cartera_proplus_anual", 320)]);
    expect(tarjetasDelPeriodo(r, "anual")).toEqual([
      expect.objectContaining({ plan: "pro", ahorro: null }),
    ]);
  });
});

describe("esCompraCancelada", () => {
  it('code "1" (PURCHASE_CANCELLED_ERROR) es cancelación', () => {
    expect(esCompraCancelada({ code: "1", message: "Purchase was cancelled." })).toBe(true);
  });

  it("userCancelled en data (Android) es cancelación", () => {
    expect(esCompraCancelada({ code: "x", data: { userCancelled: true } })).toBe(true);
  });

  it("otro código es un error de verdad", () => {
    expect(esCompraCancelada({ code: "2", message: "Store problem" })).toBe(false);
    expect(esCompraCancelada(new Error("boom"))).toBe(false);
    expect(esCompraCancelada(null)).toBe(false);
  });
});

describe("esCambioRechazado", () => {
  it('code "4" (PURCHASE_INVALID_ERROR: el DEVELOPER_ERROR de Play) es un rechazo del cambio', () => {
    expect(esCambioRechazado({ code: "4", message: "The purchase is invalid." })).toBe(true);
    expect(esCambioRechazado({ code: 4 })).toBe(true);
  });

  it("red, tienda caída o cancelación no son un rechazo del cambio", () => {
    expect(esCambioRechazado({ code: "10", message: "Network error" })).toBe(false);
    expect(esCambioRechazado({ code: "35", message: "Offline" })).toBe(false);
    expect(esCambioRechazado({ code: "2", message: "Store problem" })).toBe(false);
    expect(esCambioRechazado({ code: "1" })).toBe(false);
    expect(esCambioRechazado(new Error("boom"))).toBe(false);
    expect(esCambioRechazado(null)).toBe(false);
  });
});

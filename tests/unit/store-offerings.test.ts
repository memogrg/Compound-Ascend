/**
 * Paywall nativo: qué plan es cada paquete de la tienda, en qué orden se muestran y cuándo un
 * rechazo de la compra es solo que la persona cerró la hoja de pago.
 */
import { describe, it, expect } from "vitest";
import { esCompraCancelada, ordenarOfertas } from "@/lib/billing/store-offerings";

const pkg = (id: string, productId: string, priceString = "$9.99") => ({
  identifier: id,
  product: { identifier: productId, priceString },
});

describe("ordenarOfertas", () => {
  it("ordena Esencial+ → Pro+ → Max+ venga como venga la oferta", () => {
    const r = ordenarOfertas([
      pkg("max", "cartera_max_mensual"),
      pkg("esencial", "cartera_esencial_mensual"),
      pkg("pro", "cartera_pro_mensual"),
    ]);
    expect(r.map((o) => o.plan)).toEqual(["esencial", "pro", "max"]);
    expect(r.map((o) => o.paquete.identifier)).toEqual(["esencial", "pro", "max"]);
  });

  it("mapea el producto de Google Play con el base plan pegado", () => {
    const r = ordenarOfertas([pkg("p", "cartera_pro_mensual:mensual")]);
    expect(r).toEqual([{ paquete: expect.objectContaining({ identifier: "p" }), plan: "pro" }]);
  });

  it("descarta productos que no son nuestros", () => {
    const r = ordenarOfertas([pkg("x", "otro_producto"), pkg("e", "cartera_esencial_mensual")]);
    expect(r.map((o) => o.plan)).toEqual(["esencial"]);
  });

  it("con dos paquetes del mismo plan queda el primero", () => {
    const r = ordenarOfertas([
      pkg("pro-a", "cartera_pro_mensual"),
      pkg("pro-b", "cartera_pro_mensual:mensual"),
    ]);
    expect(r.map((o) => o.paquete.identifier)).toEqual(["pro-a"]);
  });

  it("no toca el precio: el paquete sale tal cual lo dio la tienda", () => {
    const original = pkg("e", "cartera_esencial_mensual", "₡5.990,00");
    expect(ordenarOfertas([original])[0]?.paquete).toBe(original);
  });

  it("oferta vacía → lista vacía", () => {
    expect(ordenarOfertas([])).toEqual([]);
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

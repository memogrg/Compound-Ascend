/**
 * Productos de tienda → plan: los ids reales de Google Play (permanentes, no se pueden
 * renombrar) y que los ids viejos ya no den plan.
 */
import { describe, it, expect } from "vitest";
import { planDeProducto } from "@/lib/billing/store-products";

describe("planDeProducto", () => {
  it("Pro+ con el base plan de Play pegado", () => {
    expect(planDeProducto("cartera_proplus_mensual:mensual")).toBe("pro");
  });

  it("Max+ sin base plan", () => {
    expect(planDeProducto("cartera_maxplus_mensual")).toBe("max");
  });

  it("Esencial", () => {
    expect(planDeProducto("cartera_esencial_mensual")).toBe("esencial");
  });

  it("los ids viejos ya no son nuestros", () => {
    expect(planDeProducto("cartera_pro_mensual")).toBeNull();
    expect(planDeProducto("cartera_max_mensual")).toBeNull();
  });
});

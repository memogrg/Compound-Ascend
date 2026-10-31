/**
 * Productos de tienda → plan y período: los ids reales de Google Play (permanentes, no se
 * pueden renombrar), los anuales de Apple, y que los ids viejos ya no den plan.
 */
import { describe, it, expect } from "vitest";
import { cambioDiferido, planDeProducto, productoDeTienda } from "@/lib/billing/store-products";

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

  it("los anuales dan el mismo plan (Play por base plan, Apple por id)", () => {
    expect(planDeProducto("cartera_esencial_mensual:anual")).toBe("esencial");
    expect(planDeProducto("cartera_proplus_mensual:anual")).toBe("pro");
    expect(planDeProducto("cartera_maxplus_mensual:anual")).toBe("max");
    expect(planDeProducto("cartera_esencial_anual")).toBe("esencial");
    expect(planDeProducto("cartera_proplus_anual")).toBe("pro");
    expect(planDeProducto("cartera_maxplus_anual")).toBe("max");
  });

  it("los ids viejos ya no son nuestros", () => {
    expect(planDeProducto("cartera_pro_mensual")).toBeNull();
    expect(planDeProducto("cartera_max_mensual")).toBeNull();
  });
});

describe("productoDeTienda", () => {
  it("Play: el período sale del base plan", () => {
    expect(productoDeTienda("cartera_proplus_mensual:mensual")).toEqual({
      plan: "pro",
      periodo: "mensual",
    });
    expect(productoDeTienda("cartera_proplus_mensual:anual")).toEqual({
      plan: "pro",
      periodo: "anual",
    });
  });

  it("Apple: el período sale del id", () => {
    expect(productoDeTienda("cartera_maxplus_mensual")).toEqual({
      plan: "max",
      periodo: "mensual",
    });
    expect(productoDeTienda("cartera_maxplus_anual")).toEqual({ plan: "max", periodo: "anual" });
  });

  it("lo que no es nuestro → null", () => {
    expect(productoDeTienda(null)).toBeNull();
    expect(productoDeTienda("")).toBeNull();
    expect(productoDeTienda("otra_cosa:anual")).toBeNull();
  });
});

describe("cambioDiferido", () => {
  it("bajar de plan es diferido, en cualquier período y tienda", () => {
    expect(
      cambioDiferido("cartera_proplus_mensual:mensual", "cartera_esencial_mensual:mensual"),
    ).toBe(true);
    expect(cambioDiferido("cartera_maxplus_anual", "cartera_proplus_mensual")).toBe(true);
  });
  it("el mismo plan con otro período es diferido", () => {
    expect(cambioDiferido("cartera_proplus_mensual:mensual", "cartera_proplus_mensual:anual")).toBe(
      true,
    );
    expect(cambioDiferido("cartera_proplus_anual", "cartera_proplus_mensual")).toBe(true);
  });
  it("subir de plan entra ya, aunque cambie el período", () => {
    expect(
      cambioDiferido("cartera_esencial_mensual:mensual", "cartera_proplus_mensual:mensual"),
    ).toBe(false);
    expect(cambioDiferido("cartera_proplus_mensual:anual", "cartera_maxplus_mensual:mensual")).toBe(
      false,
    );
  });
  it("el mismo producto no es un cambio", () => {
    expect(cambioDiferido("cartera_proplus_mensual:anual", "cartera_proplus_mensual:anual")).toBe(
      false,
    );
  });
  it("si alguno de los dos no es nuestro, no se puede saber: false", () => {
    expect(cambioDiferido(null, "cartera_esencial_mensual")).toBe(false);
    expect(cambioDiferido("otro_producto", "cartera_esencial_mensual")).toBe(false);
    expect(cambioDiferido("cartera_proplus_mensual", "otro_producto")).toBe(false);
  });
});

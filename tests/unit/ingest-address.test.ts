import { describe, it, expect } from "vitest";
import { buildIngestAddress, generateIngestToken } from "@/lib/ingestion/email/ingest-address";

/**
 * La dirección de ingesta es la identidad de la cuenta, así que su local-part es
 * un secreto: si fuera adivinable, cualquiera podría inyectarle movimientos a
 * otro. Estos tests cuidan el tamaño del espacio y la legibilidad al dictarla.
 */
describe("dirección de ingesta única", () => {
  it("el token tiene 10 caracteres del alfabeto sin vocales", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateIngestToken()).toMatch(/^[23456789bcdfghjkmnpqrstvwxz]{10}$/);
    }
  });

  it("no incluye caracteres que se confunden al leer o dictar (0/O, 1/l/I) ni vocales", () => {
    const muestra = Array.from({ length: 200 }, generateIngestToken).join("");
    expect(muestra).not.toMatch(/[01loiaeu]/);
  });

  it("no se repite en 500 generaciones (espacio suficientemente grande)", () => {
    const vistos = new Set(Array.from({ length: 500 }, generateIngestToken));
    expect(vistos.size).toBe(500);
  });

  it("arma la dirección en minúsculas con el prefijo u", () => {
    expect(buildIngestAddress("bcdfghjkmn", "IN.AiTechUmbrella.com")).toBe(
      "ubcdfghjkmn@in.aitechumbrella.com",
    );
  });
});

/**
 * Lectura de montos escritos a mano, compartida por web y móvil.
 *
 * El bug: los campos borraban la coma antes de leer el número, así que «1500,50» —la
 * forma normal de escribirlo acá— se guardaba como 150050. Cien veces de más, sin aviso.
 *
 * En `portfolio-view` eso no se quedaba en el formulario: ese campo es la valuación
 * manual de un activo, o sea que el error entra directo al patrimonio neto y a la
 * rentabilidad, donde ya nadie lo relaciona con lo que tecleó.
 */
import { describe, it, expect } from "vitest";
import { parseMonto, normalizarMontoTexto } from "@/lib/parse-monto";

describe("parseMonto", () => {
  it("coma decimal (lo que se escribe acá)", () => {
    expect(parseMonto("1500,50")).toBe(1500.5);
    expect(parseMonto("0,5")).toBe(0.5);
  });

  it("punto de miles + coma decimal", () => {
    expect(parseMonto("1.500,50")).toBe(1500.5);
    expect(parseMonto("1.250.000,75")).toBe(1250000.75);
  });

  it("coma de miles + punto decimal", () => {
    expect(parseMonto("1,500.50")).toBe(1500.5);
  });

  it("sin separadores", () => {
    expect(parseMonto("12")).toBe(12);
  });

  it("separadores repetidos: el último manda", () => {
    expect(parseMonto("1..2")).toBe(1.2);
    expect(parseMonto("1,,2")).toBe(1.2);
  });

  it("vacío o sin números → undefined, NUNCA 0", () => {
    expect(parseMonto("")).toBeUndefined();
    expect(parseMonto("abc")).toBeUndefined();
    expect(parseMonto(",")).toBeUndefined();
  });

  it("descarta símbolos y espacios", () => {
    expect(parseMonto("₡1.500,50")).toBe(1500.5);
    expect(parseMonto("$ 1,500.50")).toBe(1500.5);
  });

  it("tolera el separador a medio escribir", () => {
    expect(parseMonto("1500,")).toBe(1500);
  });

  it("el bug viejo, explícito: borrar la coma multiplicaba por 100", () => {
    const viejo = (s: string) => Number(s.replace(/[^0-9.]/g, ""));
    expect(viejo("1500,50")).toBe(150050);
    expect(parseMonto("1500,50")).toBe(1500.5);
  });
});

describe("normalizarMontoTexto", () => {
  it("devuelve algo que Number entiende", () => {
    expect(normalizarMontoTexto("1.500,50")).toBe("1500.50");
    expect(normalizarMontoTexto("12")).toBe("12");
    expect(normalizarMontoTexto("abc")).toBe("");
  });
});

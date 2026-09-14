/**
 * Lectura de montos escritos a mano.
 *
 * El bug: el campo borraba la coma antes de leer el número, así que «1500,50» —la forma
 * normal de escribirlo en Costa Rica, y lo que ofrece el teclado del teléfono— se
 * guardaba como 150050. Cien veces de más, sin aviso, y visible recién en el saldo.
 *
 * La regla que estos casos fijan: el ÚLTIMO separador es el decimal.
 */
import { describe, it, expect } from "vitest";
import { parseMonto, normalizarMontoTexto } from "@/app/(mobile)/m/lib/parse-monto";

describe("parseMonto", () => {
  it("coma decimal (lo que se escribe acá)", () => {
    expect(parseMonto("1500,50")).toBe(1500.5);
    expect(parseMonto("0,5")).toBe(0.5);
  });

  it("punto de miles + coma decimal", () => {
    expect(parseMonto("1.500,50")).toBe(1500.5);
  });

  it("coma de miles + punto decimal (formato en inglés)", () => {
    expect(parseMonto("1,500.50")).toBe(1500.5);
  });

  it("sin separadores", () => {
    expect(parseMonto("12")).toBe(12);
  });

  it("separadores repetidos: el último manda, el resto es ruido", () => {
    expect(parseMonto("1..2")).toBe(1.2);
    expect(parseMonto("1,,2")).toBe(1.2);
  });

  it("vacío o sin números → undefined, NUNCA 0", () => {
    // 0 significaría "cero colones" y haría ver completo un formulario a medio llenar.
    expect(parseMonto("")).toBeUndefined();
    expect(parseMonto("abc")).toBeUndefined();
    expect(parseMonto("   ")).toBeUndefined();
    expect(parseMonto(",")).toBeUndefined();
  });

  it("descarta símbolos y espacios sin perder el número", () => {
    expect(parseMonto("₡1.500,50")).toBe(1500.5);
    expect(parseMonto("$ 1,500.50")).toBe(1500.5);
    expect(parseMonto("1 500,50")).toBe(1500.5);
  });

  it("tolera el separador a medio escribir: el campo no pelea con el dedo", () => {
    expect(parseMonto("1500,")).toBe(1500);
    expect(parseMonto("1500.")).toBe(1500);
  });

  it("montos grandes con miles, que es donde el error dolía", () => {
    expect(parseMonto("1.250.000,75")).toBe(1250000.75);
    expect(parseMonto("1,250,000.75")).toBe(1250000.75);
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
  });

  it("sin nada aprovechable devuelve cadena vacía", () => {
    expect(normalizarMontoTexto("abc")).toBe("");
    expect(normalizarMontoTexto("")).toBe("");
  });
});

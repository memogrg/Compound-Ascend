/**
 * Parseo del estado de cuenta pegado. Determinista a propósito: si el monto o la fecha los
 * "interpretara" el modelo, el usuario podría terminar registrando plata que no gastó.
 */
import { describe, it, expect } from "vitest";
import {
  parseStatement,
  pareceBloqueDeEstado,
  parseMonto,
  parseFecha,
} from "@/lib/ai/statement-parse";

const BLOQUE = `246276  2026-07-17  SUBWAY LAGUNILLA  3,900.00  COL  D
246277  2026-07-18  FRESH MARKET ESCAZU  24,150.00  COL  D
246281  2026-07-20  OLIVE GARDEN  18,700.00  COL  D
246290  2026-07-25  TRANSFERENCIA SINPE  50,000.00  COL  C`;

describe("parseMonto · separadores de miles vs decimales", () => {
  it("formato con coma de miles y punto decimal", () => {
    expect(parseMonto("3,900.00")).toBe(3900);
    expect(parseMonto("24,150.50")).toBe(24150.5);
  });
  it("formato con punto de miles y coma decimal", () => {
    expect(parseMonto("3.900,00")).toBe(3900);
    expect(parseMonto("1.234.567,89")).toBe(1234567.89);
  });
  it("sin decimales: el separador es de miles", () => {
    expect(parseMonto("3.900")).toBe(3900);
    expect(parseMonto("3,900")).toBe(3900);
    expect(parseMonto("50000")).toBe(50000);
  });
  it("negativos se toman en valor absoluto (el signo lo dice D/C)", () => {
    expect(parseMonto("-3,900.00")).toBe(3900);
  });
  it("cero o basura → null", () => {
    expect(parseMonto("0")).toBeNull();
    expect(parseMonto("abc")).toBeNull();
  });
});

describe("parseFecha", () => {
  it("ISO tal cual", () => {
    expect(parseFecha("2026-07-17")).toBe("2026-07-17");
    expect(parseFecha("2026-7-5")).toBe("2026-07-05");
  });
  it("DD/MM/AAAA local (el día va primero)", () => {
    expect(parseFecha("17/07/2026")).toBe("2026-07-17");
    expect(parseFecha("5-7-26")).toBe("2026-07-05");
  });
  it("mes o día imposibles → null", () => {
    expect(parseFecha("32/07/2026")).toBeNull();
    expect(parseFecha("17/13/2026")).toBeNull();
  });
});

describe("parseStatement · el formato del enunciado", () => {
  const { filas, ignoradas } = parseStatement(BLOQUE);

  it("parsea las cuatro filas", () => {
    expect(filas).toHaveLength(4);
    expect(ignoradas).toHaveLength(0);
  });

  it("la primera fila sale completa y normalizada", () => {
    expect(filas[0]).toEqual({
      ref: "246276",
      fecha: "2026-07-17",
      comercio: "SUBWAY LAGUNILLA",
      monto: 3900,
      moneda: "CRC", // COL → CRC
      tipo: "gasto", // D
    });
  });

  it("C es ingreso (crédito), D es gasto", () => {
    expect(filas[3]?.tipo).toBe("ingreso");
    expect(filas.filter((f) => f.tipo === "gasto")).toHaveLength(3);
  });

  it("el comercio con espacios internos no se corta", () => {
    expect(filas[1]?.comercio).toBe("FRESH MARKET ESCAZU");
  });

  it("sin referencia también parsea", () => {
    const { filas: f } = parseStatement("2026-07-17  SUBWAY  3,900.00  COL  D");
    expect(f[0]?.comercio).toBe("SUBWAY");
    expect(f[0]?.monto).toBe(3900);
    expect(f[0]?.ref).toBeNull();
  });

  it("sin moneda ni tipo asume colones y gasto (lo normal en un estado)", () => {
    const { filas: f } = parseStatement("2026-07-17  SUBWAY  3900\n2026-07-18  POPS  1500");
    expect(f).toHaveLength(2);
    expect(f[0]?.moneda).toBe("CRC");
    expect(f[0]?.tipo).toBe("gasto");
  });

  it("USD se respeta", () => {
    const { filas: f } = parseStatement("2026-07-17  AMAZON  25.99  USD  D");
    expect(f[0]?.moneda).toBe("USD");
    expect(f[0]?.monto).toBe(25.99);
  });

  it("una línea rota se REPORTA, no se traga (si no, se registraría dos veces)", () => {
    const { filas: f, ignoradas: ig } = parseStatement(
      `2026-07-17  SUBWAY  3,900.00  COL  D\n2026-07-99  ROTA`,
    );
    expect(f).toHaveLength(1);
    expect(ig).toHaveLength(1);
  });

  it("encabezados y texto suelto no cuentan como filas rotas", () => {
    const { ignoradas: ig } = parseStatement(`Movimientos de julio\nRef  Fecha  Comercio  Monto`);
    expect(ig).toHaveLength(0);
  });
});

describe("pareceBloqueDeEstado · no secuestrar una conversación normal", () => {
  it("el bloque pegado sí", () => {
    expect(pareceBloqueDeEstado(BLOQUE)).toBe(true);
  });

  it("una frase con dos fechas y dos montos NO", () => {
    expect(pareceBloqueDeEstado("gasté 3.900 el 17/07 y 5.000 el 18/07, ¿los tengo anotados?")).toBe(
      false,
    );
  });

  it("una sola fila no alcanza (puede ser una captura suelta)", () => {
    expect(pareceBloqueDeEstado("2026-07-17  SUBWAY  3,900.00  COL  D")).toBe(false);
  });

  it("un bloque con encabezado y una nota alrededor sigue siendo bloque", () => {
    expect(
      pareceBloqueDeEstado(`estos son mis movimientos:\n${BLOQUE}\n¿cuáles me faltan?`),
    ).toBe(true);
  });

  it("una pregunta normal NO", () => {
    expect(pareceBloqueDeEstado("¿cuánto gasté el mes pasado en restaurantes?")).toBe(false);
  });
});

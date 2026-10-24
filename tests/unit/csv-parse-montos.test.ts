/**
 * Montos y delimitador del CSV bancario.
 *
 * Por qué importa más que el mismo bug en un formulario: acá **nadie ve el número antes
 * de que entre**. En un campo, la persona nota que dice 150050 y lo corrige; en una
 * importación de 200 filas, el error se descubre semanas después, en un saldo que no
 * cuadra y sin rastro de cuál fue la fila.
 *
 * Lo que hacía el parser viejo, verificado antes de tocarlo:
 *   "1500,50"   → 150050    (×100)
 *   "1.500,50"  → 1.5005    (÷1000)
 *   archivo con ; → todas las filas omitidas
 */
import { describe, it, expect } from "vitest";
import {
  parseCsv,
  montoDeCelda,
  detectarDelimitador,
} from "@/modules/financial-base/engine/csv-parse";

describe("montoDeCelda", () => {
  it("coma decimal", () => {
    expect(montoDeCelda("1500,50")).toBe(1500.5);
    expect(montoDeCelda("0,5")).toBe(0.5);
  });

  it("punto de miles + coma decimal", () => {
    expect(montoDeCelda("1.500,50")).toBe(1500.5);
    expect(montoDeCelda("1.250.000,75")).toBe(1250000.75);
  });

  it("coma de miles + punto decimal", () => {
    expect(montoDeCelda("1,500.50")).toBe(1500.5);
  });

  it("punto decimal solo", () => {
    expect(montoDeCelda("1500.50")).toBe(1500.5);
    expect(montoDeCelda("1.5")).toBe(1.5);
  });

  /**
   * Acá la regla se APARTA de la del formulario móvil, a propósito. Quien teclea «1.500»
   * puso un punto decimal y quiere 1,5. Un banco que exporta «1.500» quiere mil
   * quinientos. Tres dígitos detrás de un separador único = miles.
   */
  it("un separador único con 3 dígitos detrás es de MILES, no decimal", () => {
    expect(montoDeCelda("1.500")).toBe(1500);
    expect(montoDeCelda("1,500")).toBe(1500);
    expect(montoDeCelda("1.500.000")).toBe(1500000);
  });

  it("…pero con 1, 2 o 4 dígitos detrás es decimal", () => {
    expect(montoDeCelda("1.5")).toBe(1.5);
    expect(montoDeCelda("1,50")).toBe(1.5);
    expect(montoDeCelda("1,5000")).toBe(1.5);
  });

  it("conserva el signo: de él depende si es ingreso o gasto", () => {
    expect(montoDeCelda("-1500,50")).toBe(-1500.5);
    expect(montoDeCelda("-1.500,50")).toBe(-1500.5);
  });

  it("paréntesis = negativo (notación contable)", () => {
    expect(montoDeCelda("(1500,50)")).toBe(-1500.5);
  });

  it("descarta símbolos y espacios", () => {
    expect(montoDeCelda("₡1.500,50")).toBe(1500.5);
    expect(montoDeCelda("$ 1,500.50")).toBe(1500.5);
    expect(montoDeCelda("CRC 1 500,50")).toBe(1500.5);
  });

  it("sin número → NaN, para que la fila se omita", () => {
    expect(montoDeCelda("")).toBeNaN();
    expect(montoDeCelda("n/d")).toBeNaN();
  });

  it("el parser VIEJO se equivocaba; este no", () => {
    const viejo = (s: string) => Number(s.replace(/[^0-9.\-]/g, ""));
    expect(viejo("1500,50")).toBe(150050);
    expect(viejo("1.500,50")).toBe(1.5005);

    expect(montoDeCelda("1500,50")).toBe(1500.5);
    expect(montoDeCelda("1.500,50")).toBe(1500.5);
  });
});

describe("detectarDelimitador", () => {
  it("punto y coma cuando manda en la cabecera", () => {
    expect(detectarDelimitador("fecha;descripcion;monto")).toBe(";");
  });

  it("coma por defecto", () => {
    expect(detectarDelimitador("fecha,descripcion,monto")).toBe(",");
    expect(detectarDelimitador("fecha")).toBe(",");
  });
});

describe("parseCsv de punta a punta", () => {
  it("archivo con ; y coma decimal: el formato de los bancos de acá", () => {
    const csv = [
      "fecha;descripcion;monto",
      "2026-08-01;Súper;-1.500,50",
      "2026-08-02;Salario;850.000,00",
    ].join("\n");

    const { rows, skipped } = parseCsv(csv, "CRC");

    expect(skipped).toBe(0);
    expect(rows).toEqual([
      {
        kind: "gasto",
        amount: 1500.5,
        occurredOn: "2026-08-01",
        description: "Súper",
        currency: "CRC",
      },
      {
        kind: "ingreso",
        amount: 850000,
        occurredOn: "2026-08-02",
        description: "Salario",
        currency: "CRC",
      },
    ]);
  });

  it("archivo con , y punto decimal: sigue funcionando igual que antes", () => {
    const csv = ["fecha,descripcion,monto", "2026-08-01,Super,-1500.50"].join("\n");

    const { rows } = parseCsv(csv, "USD");

    expect(rows[0]).toMatchObject({ kind: "gasto", amount: 1500.5, currency: "USD" });
  });

  it("LIMITACIÓN conocida: coma decimal sin comillas en archivo de comas pierde los decimales", () => {
    // Esto NO se arregla en el parser de montos: cuando la celda llega, el delimitador ya
    // partió el número en dos columnas. Queda escrito para que nadie lo descubra en un
    // saldo. Las dos salidas correctas de un banco de la región —`;` como delimitador, o
    // el monto entre comillas— sí funcionan, y están cubiertas arriba.
    const csv = ["fecha,descripcion,monto", "2026-08-01,Super,1500,50"].join("\n");

    const { rows } = parseCsv(csv, "CRC");

    expect(rows[0]?.amount).toBe(1500); // se perdió el ",50"
  });
});

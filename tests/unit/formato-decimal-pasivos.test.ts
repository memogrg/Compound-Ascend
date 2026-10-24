/**
 * Dos arreglos de `/mi-rich-life` que se ven a simple vista y nadie había escrito en un test.
 */
import { describe, it, expect } from "vitest";

import { formatDecimal, formatMoney } from "@/lib/format";
import { textoPasivos } from "@/modules/rich-life/engine/pasivos-texto";

describe("formatDecimal", () => {
  it("usa coma decimal, como el resto de la pantalla", () => {
    // El bug: `${r.mesesDeColchon}` daba «1.7» al lado de importes con coma.
    expect(formatDecimal(1.7)).toBe("1,7");
    expect(formatDecimal(0.21, 2)).toBe("0,21");
  });

  it("respeta los dígitos que se le piden", () => {
    expect(formatDecimal(1.25, 0)).toBe("1");
    expect(formatDecimal(1.25, 1)).toBe("1,3");
    expect(formatDecimal(1.25, 2)).toBe("1,25");
  });

  it("redondea, no trunca", () => {
    expect(formatDecimal(0.96)).toBe("1,0");
    expect(formatDecimal(0.94)).toBe("0,9");
  });

  it("el negativo lleva el menos tipográfico, no un guion", () => {
    expect(formatDecimal(-2.5).charCodeAt(0)).toBe(0x2212);
    expect(formatDecimal(-2.5)).toBe("−2,5");
  });

  it("un valor que redondea a cero no lleva signo", () => {
    // «−0,0» es un número que no existe. Misma regla que `formatMoney`.
    expect(formatDecimal(-0.04)).toBe("0,0");
  });

  it("agrupa los miles con punto, por si el número crece", () => {
    expect(formatDecimal(12345.6)).toBe("12.345,6");
  });

  it("un valor no finito no pinta «NaN» en la tarjeta", () => {
    expect(formatDecimal(Number.NaN)).toBe("—");
    expect(formatDecimal(Number.POSITIVE_INFINITY)).toBe("—");
  });

  it("la puntuación es la misma que la de formatMoney", () => {
    // Es el punto de todo: dos puntuaciones distintas en la misma tarjeta se leen como un
    // descuido.
    expect(formatMoney(12345.6, "CRC", 1)).toContain(formatDecimal(12345.6));
  });
});

describe("textoPasivos", () => {
  const sinDeudas = { cantidad: 0, total: 0 };

  it("sin deudas del módulo, cuenta solo los manuales", () => {
    expect(textoPasivos(2, sinDeudas, "CRC").sub).toBe("2 registrados");
    expect(textoPasivos(1, sinDeudas, "CRC").sub).toBe("1 registrado");
    expect(textoPasivos(0, sinDeudas, "CRC").sub).toBe("0 registrados");
  });

  it("sin deudas, no hay aviso y el vacío invita a agregar", () => {
    const t = textoPasivos(0, sinDeudas, "CRC");
    expect(t.deudas).toBeNull();
    expect(t.vacio).toContain("Agrega");
  });

  it("CON deudas y cero pasivos manuales, el conteo NO dice cero", () => {
    // Era el bug: «0 registrado(s)» a alguien cuyas deudas ya restaban en el neto de arriba.
    const t = textoPasivos(0, { cantidad: 4, total: 3_500_000 }, "CRC");
    expect(t.sub).toBe("4 pasivos · 0 manuales");
    expect(t.sub).not.toMatch(/^0 /);
  });

  it("el aviso nombra cuántas son, cuánto suman y a dónde ir", () => {
    const t = textoPasivos(0, { cantidad: 4, total: 3_500_000 }, "CRC");
    expect(t.deudas?.texto).toContain("Tus 4 deudas");
    expect(t.deudas?.texto).toContain(formatMoney(3_500_000, "CRC"));
    expect(t.deudas?.texto).toContain("Planes · Deudas");
    expect(t.deudas?.href).toBe("/deudas");
  });

  it("una sola deuda va en singular", () => {
    const t = textoPasivos(0, { cantidad: 1, total: 900_000 }, "CRC");
    expect(t.deudas?.texto).toContain("Tu 1 deuda");
    expect(t.deudas?.texto).toContain("se gestiona en");
  });

  it("con deudas, el vacío deja de aconsejar lo que ya está hecho", () => {
    // «Agrega hipotecas u otras deudas grandes» es absurdo para quien acaba de leer que
    // tiene cuatro.
    const t = textoPasivos(0, { cantidad: 4, total: 1 }, "CRC");
    expect(t.vacio).not.toContain("Agrega");
    expect(t.vacio).toContain("no son deudas del módulo");
  });

  it("suma los dos orígenes cuando hay de los dos", () => {
    expect(textoPasivos(2, { cantidad: 3, total: 1 }, "CRC").sub).toBe("5 pasivos · 2 manuales");
  });
});

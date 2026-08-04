/**
 * Reglas de la tarjeta de alta en lote. Puras: lo que decide qué se registra y qué se marca en
 * rojo no depende del DOM, así que se prueba entero acá.
 */
import { describe, it, expect } from "vitest";
import {
  normalizarFilas,
  validarFila,
  filaValida,
  resumenValidacion,
  aPayload,
  fechaValida,
  parsearMonto,
  type BatchRowDraft,
} from "@/lib/ai/batch-rows";

const fila = (over: Partial<BatchRowDraft> = {}): BatchRowDraft => ({
  uid: "f0",
  kind: "gasto",
  description: "WALMART",
  amount: 45300,
  amountText: "45300",
  currency: "CRC",
  occurredOn: "2026-07-05",
  categoryId: "11111111-1111-1111-1111-111111111111",
  categoryPath: "Alimentación › Supermercados",
  ...over,
});

describe("normalizarFilas", () => {
  it("convierte la propuesta de acción en filas editables con uid estable", () => {
    const rows = normalizarFilas([
      { kind: "gasto", description: "WALMART", amount: 45300, currency: "CRC", occurredOn: "2026-07-05" },
      { kind: "ingreso", description: "SALARIO", amount: 900000, currency: "CRC", occurredOn: "2026-07-25" },
    ]);
    expect(rows.map((r) => r.uid)).toEqual(["f0", "f1"]);
    expect(rows[1]?.kind).toBe("ingreso");
    expect(rows[0]?.amountText).toBe("45300");
  });

  /**
   * Una fila rota tiene que LLEGAR a la tarjeta marcada, no desaparecer: así se pierden
   * movimientos sin que el usuario se entere.
   */
  it("no descarta una fila incompleta: la deja para que el usuario la corrija", () => {
    const rows = normalizarFilas([{ description: "", amount: 0, occurredOn: "" }]);
    expect(rows).toHaveLength(1);
    expect(validarFila(rows[0]!)).toEqual({
      fecha: "Falta la fecha",
      comercio: "Falta el comercio",
      monto: "Falta el monto",
      sobre: "Elegí un sobre",
    });
  });

  it("tolera basura y cae a valores sanos", () => {
    const rows = normalizarFilas([{ kind: 42, amount: "x", currency: "PESOS", categoryId: 7 }]);
    expect(rows[0]).toMatchObject({ kind: "gasto", amount: 0, currency: "CRC", categoryId: null });
  });

  it("lo que no es un array no explota", () => {
    expect(normalizarFilas(null)).toEqual([]);
    expect(normalizarFilas("[]")).toEqual([]);
  });

  it("un monto negativo del estado entra en positivo (el signo lo da el tipo)", () => {
    expect(normalizarFilas([{ amount: -45300 }])[0]?.amountText).toBe("45300");
  });
});

describe("fechaValida", () => {
  it("acepta una fecha ISO real", () => {
    expect(fechaValida("2026-07-05")).toBe(true);
    expect(fechaValida("2024-02-29")).toBe(true); // bisiesto
  });

  it("rechaza formatos y días que no existen", () => {
    for (const s of ["", "05/07/2026", "2026-7-5", "2026-13-01", "2026-02-31", "2025-02-29"]) {
      expect(fechaValida(s), s).toBe(false);
    }
  });
});

describe("parsearMonto", () => {
  it("acepta la coma decimal y los separadores de miles", () => {
    expect(parsearMonto("3900")).toBe(3900);
    expect(parsearMonto("3.900,50")).toBe(3900.5);
    expect(parsearMonto("3,900.50")).toBe(3900.5);
    expect(parsearMonto("3900,5")).toBe(3900.5);
    expect(parsearMonto("3,900")).toBe(3900); // miles, no decimal
    expect(parsearMonto("₡ 45 300")).toBe(45300);
  });

  it("devuelve null cuando no hay número", () => {
    expect(parsearMonto("")).toBeNull();
    expect(parsearMonto("   ")).toBeNull();
    expect(parsearMonto("abc")).toBeNull();
  });

  /**
   * El signo se conserva a propósito para que la validación lo rechace: convertir un "-100"
   * tecleado en 100 sin avisar es una corrección silenciosa en un campo de plata. El signo de un
   * movimiento lo da su tipo, no el monto. Los negativos que trae el BANCO sí se normalizan, pero
   * eso pasa antes, en `normalizarFilas`.
   */
  it("conserva el signo negativo en vez de corregirlo en silencio", () => {
    expect(parsearMonto("-100")).toBe(-100);
    expect(parsearMonto("-3.900,50")).toBe(-3900.5);
  });
});

describe("validarFila", () => {
  it("una fila completa no tiene errores", () => {
    expect(validarFila(fila())).toEqual({});
    expect(filaValida(fila())).toBe(true);
  });

  it("exige monto mayor que cero", () => {
    expect(validarFila(fila({ amountText: "0" })).monto).toMatch(/mayor que cero/);
    expect(validarFila(fila({ amountText: "-100" })).monto).toMatch(/mayor que cero/);
  });

  it("exige fecha válida y distingue faltante de inválida", () => {
    expect(validarFila(fila({ occurredOn: "" })).fecha).toBe("Falta la fecha");
    expect(validarFila(fila({ occurredOn: "2026-02-31" })).fecha).toBe("Fecha inválida");
  });

  it("exige sobre elegido", () => {
    expect(validarFila(fila({ categoryId: null })).sobre).toBe("Elegí un sobre");
  });

  it("exige comercio y respeta el máximo del servidor", () => {
    expect(validarFila(fila({ description: "   " })).comercio).toBe("Falta el comercio");
    expect(validarFila(fila({ description: "x".repeat(161) })).comercio).toMatch(/160/);
    expect(validarFila(fila({ description: "x".repeat(160) })).comercio).toBeUndefined();
  });
});

describe("resumenValidacion", () => {
  it("cuenta listas y con error", () => {
    const rows = [fila(), fila({ uid: "f1", categoryId: null }), fila({ uid: "f2", amountText: "" })];
    expect(resumenValidacion(rows)).toEqual({ listas: 1, conError: 2 });
  });

  it("una lista vacía no tiene errores (el botón la corta antes)", () => {
    expect(resumenValidacion([])).toEqual({ listas: 0, conError: 0 });
  });
});

describe("aPayload", () => {
  /** El punto del cambio: se registra lo EDITADO, no lo que trajo el parser. */
  it("manda los valores editados, no los originales", () => {
    const editada = fila({
      description: "  Automercado  ", // el usuario le sacó el ruido "OCN00PHEREDIA"
      amountText: "3.900,50", // y corrigió el monto que se había leído como saldo
      currency: "USD",
      occurredOn: "2026-07-06",
    });
    expect(aPayload([editada])).toEqual([
      {
        kind: "gasto",
        description: "Automercado",
        amount: 3900.5,
        currency: "USD",
        occurredOn: "2026-07-06",
        categoryId: "11111111-1111-1111-1111-111111111111",
      },
    ]);
  });

  it("quitar una fila la saca del payload", () => {
    const rows = [fila(), fila({ uid: "f1", description: "MAXIPALI" })];
    const quedan = rows.filter((r) => r.uid !== "f0");
    expect(aPayload(quedan).map((r) => r.description)).toEqual(["MAXIPALI"]);
  });
});

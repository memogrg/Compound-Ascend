/**
 * El presupuesto mes a mes: cada mes trae el suyo, y el fallback se aplica en TODOS.
 */
import { describe, it, expect } from "vitest";

import {
  presupuestoPorMes,
  totalDelRango,
  rotuloDelRango,
} from "@/modules/financial-base/engine/presupuesto-por-mes";

const historia = [
  { label: "jul 26", budgetExpense: 1_900_000 },
  { label: "ago 26", budgetExpense: 1_900_000 },
  { label: "sep 26", budgetExpense: 1_950_000 },
];

describe("presupuestoPorMes", () => {
  it("cada mes lleva el presupuesto de SU mes", () => {
    const m = presupuestoPorMes(historia, [0, 0, 0]);
    expect(m.map((x) => x.total)).toEqual([1_900_000, 1_900_000, 1_950_000]);
  });

  it("el fallback se aplica en CADA mes, no una sola vez", () => {
    // Antes: la suma del rango + el fallback UNA vez. Ahora: el fallback en los tres.
    const m = presupuestoPorMes(historia, [120_000, 120_000, 120_000]);
    expect(m.map((x) => x.total)).toEqual([2_020_000, 2_020_000, 2_070_000]);
    expect(m.map((x) => x.fallback)).toEqual([120_000, 120_000, 120_000]);
  });

  it("un mes sin fallback legible cuenta 0, no repite el anterior", () => {
    const m = presupuestoPorMes(historia, [120_000, Number.NaN, 90_000]);
    expect(m[1]!.fallback).toBe(0);
    expect(m[1]!.total).toBe(1_900_000);
  });

  it("con 1m el resultado es el de siempre: un mes, un fallback", () => {
    const m = presupuestoPorMes([historia[2]!], [120_000]);
    expect(m).toHaveLength(1);
    expect(m[0]!.total).toBe(2_070_000);
    expect(totalDelRango(m)).toBe(2_070_000);
  });

  it("el total del rango es la suma de los meses, no un cálculo aparte", () => {
    const m = presupuestoPorMes(historia, [120_000, 120_000, 120_000]);
    expect(totalDelRango(m)).toBe(2_020_000 + 2_020_000 + 2_070_000);
  });
});

describe("rotuloDelRango", () => {
  it("nombra el rango que se está mirando", () => {
    expect(rotuloDelRango("1m", 1)).toBe("del mes");
    expect(rotuloDelRango("3m", 3)).toBe("de 3 meses");
    expect(rotuloDelRango("6m", 6)).toBe("de 6 meses");
    expect(rotuloDelRango("ytd", 9)).toBe("del año");
    expect(rotuloDelRango("all", 24)).toBe("de 24 meses");
  });

  it("un rango de un solo mes se dice «del mes», venga de donde venga", () => {
    expect(rotuloDelRango("all", 1)).toBe("del mes");
    expect(rotuloDelRango("ytd", 1)).toBe("del mes");
  });
});

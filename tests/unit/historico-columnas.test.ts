/**
 * El histórico de gastos en COLUMNAS: las cuentas que el gráfico no debe improvisar.
 *
 * El dibujo se prueba en `tests/a11y/gastos-historico.spec.ts`, con un navegador de verdad.
 * Acá va lo puro: el % de ejecución, la diferencia, el ancho de la marca de presupuesto y
 * cómo se arman las filas. Todo lo que, si se calcula mal, hace que el gráfico mienta con
 * números en vez de con píxeles.
 */
import { describe, expect, it } from "vitest";

import {
  anchoMarca,
  diferencia,
  filasHistorico,
  porcentajeEjecucion,
} from "@/components/charts/core/historico-columnas";
import { rotuloParcial } from "@/components/charts/core/periodo-en-curso";

describe("porcentajeEjecucion", () => {
  it("es el gasto sobre el presupuesto, redondeado", () => {
    expect(porcentajeEjecucion(500_000, 1_000_000)).toBe(50);
    expect(porcentajeEjecucion(1_726_097, 1_726_097)).toBe(100);
    expect(porcentajeEjecucion(2_000_000, 1_000_000)).toBe(200);
  });

  it("sin presupuesto devuelve null, no 0 ni Infinity", () => {
    // Gastar ₡300.000 sin presupuesto NO es «0 % de ejecución»: es una pregunta sin
    // denominador. Un 0 ahí se lee como «no gastaste nada».
    expect(porcentajeEjecucion(300_000, 0)).toBeNull();
    expect(porcentajeEjecucion(0, 0)).toBeNull();
    expect(porcentajeEjecucion(300_000, -5)).toBeNull();
  });
});

describe("diferencia", () => {
  it("es gasto menos presupuesto: negativa cuando sobra", () => {
    expect(diferencia(800_000, 1_000_000)).toBe(-200_000);
    expect(diferencia(1_200_000, 1_000_000)).toBe(200_000);
    expect(diferencia(1_000_000, 1_000_000)).toBe(0);
  });
});

describe("anchoMarca", () => {
  it("es más ancha que la columna, para que sobresalga a los dos lados", () => {
    expect(anchoMarca(24, 100)).toBeGreaterThan(24);
    expect(anchoMarca(18, 40)).toBeGreaterThan(18);
  });

  it("no se sale de su banda: la marca de un mes no puede invadir la del vecino", () => {
    // Banda de 20 px y columna de 18: la marca no puede medir 24 o se solaparía con la
    // de al lado y el ojo leería una sola línea continua.
    expect(anchoMarca(18, 20)).toBeLessThanOrEqual(20);
  });

  it("sin medida todavía devuelve 0, para que el gráfico no pinte una marca de 0 px", () => {
    expect(anchoMarca(0, 0)).toBe(0);
  });
});

describe("filasHistorico", () => {
  const datos = [
    { label: "jul", real: 900_000, presupuesto: 1_726_097 },
    { label: "ago", real: 1_100_000, presupuesto: 1_726_097 },
    { label: "sep", real: 400_000, presupuesto: 1_726_097 },
  ];

  it("marca parcial SOLO el último mes, y solo si el periodo está a medias", () => {
    const filas = filasHistorico(datos, { dia: 18, diasDelMes: 30 });
    expect(filas.map((f) => f.parcial)).toEqual([false, false, true]);
  });

  it("con el mes cerrado no hay ninguna columna parcial", () => {
    const filas = filasHistorico(datos, { dia: 30, diasDelMes: 30 });
    expect(filas.map((f) => f.parcial)).toEqual([false, false, false]);
    expect(filasHistorico(datos, null).every((f) => !f.parcial)).toBe(true);
  });

  it("conserva los valores tal cual: no es un sitio donde se redondee nada", () => {
    const filas = filasHistorico(datos, null);
    expect(filas.map((f) => f.real)).toEqual([900_000, 1_100_000, 400_000]);
    expect(filas.map((f) => f.presupuesto)).toEqual([1_726_097, 1_726_097, 1_726_097]);
  });
});

describe("rotuloParcial", () => {
  it("dice «parcial» y el día, que vienen del servidor", () => {
    expect(rotuloParcial({ dia: 18, diasDelMes: 30 })).toBe("parcial · día 18 de 30");
  });

  it("el último día del mes no es parcial", () => {
    expect(rotuloParcial({ dia: 30, diasDelMes: 30 })).toBeNull();
    expect(rotuloParcial(null)).toBeNull();
  });
});

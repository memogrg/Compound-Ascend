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
  mensajeEnCurso,
  partesColumna,
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

describe("partesColumna", () => {
  it("parte la columna en lo que cabe en el presupuesto y lo que se pasa", () => {
    expect(partesColumna(800_000, 1_000_000)).toEqual({ dentro: 800_000, exceso: 0 });
    expect(partesColumna(1_200_000, 1_000_000)).toEqual({ dentro: 1_000_000, exceso: 200_000 });
    expect(partesColumna(1_000_000, 1_000_000)).toEqual({ dentro: 1_000_000, exceso: 0 });
  });

  it("sin presupuesto TODO es exceso: no hay nada dentro de lo que no existe", () => {
    expect(partesColumna(300_000, 0)).toEqual({ dentro: 0, exceso: 300_000 });
  });

  it("sin gasto no hay ninguna de las dos partes", () => {
    expect(partesColumna(0, 1_000_000)).toEqual({ dentro: 0, exceso: 0 });
  });
});

describe("mensajeEnCurso", () => {
  const enCurso = { dia: 18, diasDelMes: 30 };

  it("por debajo dice lo que queda, para cuántos días y a cuánto por día", () => {
    // ₡1.726.097 − ₡1.167.030 = ₡559.067 para 12 días → ₡46.589/día.
    const m = mensajeEnCurso(1_167_030, 1_726_097, enCurso);
    expect(m?.tono).toBe("neutro");
    expect(m?.texto).toBe("Te quedan ₡559.067 para 12 días (≈ ₡46.589/día)");
  });

  it("por encima lo dice en alerta, y NO con un signo en verde", () => {
    const m = mensajeEnCurso(1_900_000, 1_726_097, enCurso);
    expect(m?.tono).toBe("alerta");
    expect(m?.texto).toBe("Excedido por ₡173.903 con 12 días por delante");
  });

  it("justo en el presupuesto quedan ₡0, y no es alerta", () => {
    const m = mensajeEnCurso(1_726_097, 1_726_097, enCurso);
    expect(m?.tono).toBe("neutro");
    expect(m?.texto).toBe("Te quedan ₡0 para 12 días (≈ ₡0/día)");
  });

  it("los días salen del periodo del SERVIDOR, no de ningún reloj", () => {
    expect(mensajeEnCurso(0, 100, { dia: 1, diasDelMes: 31 })?.texto).toContain("para 30 días");
    expect(mensajeEnCurso(0, 100, { dia: 28, diasDelMes: 29 })?.texto).toContain("para 1 días");
  });

  it("sin periodo a medias no hay mensaje: el mes cerrado no tiene «lo que queda»", () => {
    expect(mensajeEnCurso(100, 200, null)).toBeNull();
    expect(mensajeEnCurso(100, 200, { dia: 30, diasDelMes: 30 })).toBeNull();
  });
});

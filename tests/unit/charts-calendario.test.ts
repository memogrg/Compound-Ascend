/**
 * La aritmética del calendario de gasto.
 *
 * Todo se calcula sobre la fecha ISO en texto. No hay `new Date()` en ningún sitio: el
 * servidor corre en UTC y el mismo día caería en otra casilla según la zona de quien mira.
 */
import { describe, it, expect } from "vitest";

import {
  cuantiles,
  diaDeLaSemana,
  diasDelMes,
  gridDelMes,
  nivelDe,
  rangosDeNivel,
} from "@/components/charts/core/calendario";

describe("diasDelMes", () => {
  it("los meses normales", () => {
    expect(diasDelMes(2026, 1)).toBe(31);
    expect(diasDelMes(2026, 4)).toBe(30);
    expect(diasDelMes(2026, 9)).toBe(30);
    expect(diasDelMes(2026, 12)).toBe(31);
  });

  it("febrero, con las tres reglas del bisiesto", () => {
    expect(diasDelMes(2026, 2), "año normal").toBe(28);
    expect(diasDelMes(2028, 2), "divisible por 4").toBe(29);
    expect(diasDelMes(1900, 2), "divisible por 100 pero no por 400").toBe(28);
    expect(diasDelMes(2000, 2), "divisible por 400").toBe(29);
  });
});

describe("diaDeLaSemana (lunes = 0)", () => {
  it("fechas conocidas", () => {
    // 1-sep-2026 es martes; 1-feb-2026, domingo.
    expect(diaDeLaSemana(2026, 9, 1)).toBe(1);
    expect(diaDeLaSemana(2026, 2, 1)).toBe(6);
    expect(diaDeLaSemana(2026, 1, 1)).toBe(3); // jueves
  });

  it("coincide con `Date` para todo un año, sin usarlo en producción", () => {
    // El test sí puede usar `Date` —corre en un entorno controlado— y así se comprueba la
    // congruencia de Zeller contra la implementación del motor.
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= diasDelMes(2026, m); d++) {
        const js = new Date(Date.UTC(2026, m - 1, d)).getUTCDay(); // 0 = domingo
        expect(diaDeLaSemana(2026, m, d), `2026-${m}-${d}`).toBe((js + 6) % 7);
      }
    }
  });
});

describe("gridDelMes", () => {
  it("un mes que empieza en martes deja un hueco antes del 1", () => {
    const g = gridDelMes(2026, 9);
    expect(g[0]![0]!.dia).toBeNull();
    expect(g[0]![1]!.dia).toBe(1);
  });

  it("un mes que empieza en DOMINGO llena seis huecos, no cero", () => {
    // Con lunes primero, el domingo es la última columna: es el caso que rompe una
    // implementación escrita pensando en domingo = 0.
    const g = gridDelMes(2026, 2);
    expect(g[0]!.slice(0, 6).every((c) => c.dia === null)).toBe(true);
    expect(g[0]![6]!.dia).toBe(1);
  });

  it("un mes que empieza en LUNES no deja hueco", () => {
    expect(diaDeLaSemana(2026, 6, 1)).toBe(0);
    expect(gridDelMes(2026, 6)[0]![0]!.dia).toBe(1);
  });

  it("todas las filas tienen siete celdas, siempre", () => {
    for (let m = 1; m <= 12; m++) {
      for (const fila of gridDelMes(2026, m)) expect(fila, `mes ${m}`).toHaveLength(7);
    }
  });

  it("no pierde ni inventa días", () => {
    for (let m = 1; m <= 12; m++) {
      const dias = gridDelMes(2026, m)
        .flat()
        .filter((c) => c.dia !== null)
        .map((c) => c.dia);
      expect(dias, `mes ${m}`).toHaveLength(diasDelMes(2026, m));
      expect(dias[0]).toBe(1);
      expect(dias[dias.length - 1]).toBe(diasDelMes(2026, m));
    }
  });

  it("febrero bisiesto que empieza en lunes cabe en cuatro filas exactas", () => {
    // 2038-02-01 es lunes y febrero tiene 28 días: el caso límite de 4×7 clavado.
    expect(diaDeLaSemana(2038, 2, 1)).toBe(0);
    expect(gridDelMes(2038, 2)).toHaveLength(4);
  });

  it("las fechas son ISO con ceros a la izquierda", () => {
    expect(gridDelMes(2026, 9)[0]![1]!.fecha).toBe("2026-09-01");
  });
});

describe("cuantiles", () => {
  it("reparte en cinco niveles con cuatro cortes", () => {
    const v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(cuantiles(v, 5)).toHaveLength(4);
  });

  it("los ceros NO entran en el reparto", () => {
    // Un día sin gasto no es «poco gasto»: si entrara, se comería el primer cuantil entero.
    const conCeros = cuantiles([0, 0, 0, 0, 10, 20, 30, 40], 5);
    const sinCeros = cuantiles([10, 20, 30, 40], 5);
    expect(conCeros).toEqual(sinCeros);
  });

  it("los cortes van en orden creciente", () => {
    const c = cuantiles([5, 100, 3, 42, 8, 77, 15], 5);
    for (let i = 1; i < c.length; i++) expect(c[i]!).toBeGreaterThanOrEqual(c[i - 1]!);
  });

  it("una serie vacía o toda en cero no tiene cortes", () => {
    expect(cuantiles([], 5)).toEqual([]);
    expect(cuantiles([0, 0, 0], 5)).toEqual([]);
  });

  it("un solo valor positivo da cortes, todos iguales a él", () => {
    expect(cuantiles([42], 5)).toEqual([42, 42, 42, 42]);
  });
});

describe("nivelDe", () => {
  const cortes = cuantiles([10, 20, 30, 40, 50], 5);

  it("sin gasto es −1, que no es un nivel", () => {
    expect(nivelDe(0, cortes)).toBe(-1);
    expect(nivelDe(Number.NaN, cortes)).toBe(-1);
  });

  it("el mínimo cae en el primer nivel y el máximo en el último", () => {
    expect(nivelDe(10, cortes)).toBe(0);
    expect(nivelDe(50, cortes)).toBe(4);
  });

  it("nunca devuelve un nivel fuera de rango", () => {
    for (const v of [1, 15, 25, 35, 45, 1000]) {
      const n = nivelDe(v, cortes);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(4);
    }
  });
});

describe("rangosDeNivel", () => {
  it("da un rango por nivel, y el último queda abierto arriba", () => {
    const r = rangosDeNivel([10, 20, 30, 40, 50], 5);
    expect(r).toHaveLength(5);
    expect(r[0]!.desde).toBe(10);
    expect(r[4]!.hasta).toBeNull();
  });

  it("sin datos positivos no hay leyenda que pintar", () => {
    expect(rangosDeNivel([0, 0], 5)).toEqual([]);
  });
});

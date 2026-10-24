/**
 * Las reglas del tooltip y de la interacción, en lo que se puede probar sin montar nada.
 */
import { describe, it, expect } from "vitest";

import {
  ESTADO_INICIAL,
  SIN_COMPARACION,
  deltaComparacion,
  describirPunto,
  filasTooltip,
  formatoEjeX,
  posicionAnclada,
  reducirSerieActiva,
  tonoDelta,
  type FilaTooltip,
  type SerieDef,
} from "@/components/charts/core";
import { formatMonthShort } from "@/lib/format";

const fmt = (v: number) => `₡${String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;

const serie = (clave: string, extra: Partial<SerieDef> = {}): SerieDef => ({
  clave,
  etiqueta: clave,
  color: "var(--chart-1)",
  marca: "linea",
  ...extra,
});

describe("reducirSerieActiva · fijar y soltar", () => {
  it("fijar guarda el índice del punto", () => {
    const e = reducirSerieActiva(ESTADO_INICIAL, { tipo: "fijar", indice: 4 });
    expect(e.fijado).toBe(4);
  });

  it("fijar OTRO punto lo mueve", () => {
    let e = reducirSerieActiva(ESTADO_INICIAL, { tipo: "fijar", indice: 4 });
    e = reducirSerieActiva(e, { tipo: "fijar", indice: 7 });
    expect(e.fijado).toBe(7);
  });

  it("fijar el MISMO punto suelta: es un interruptor", () => {
    // Sin esto, para quitar el tooltip habría que acertar fuera del gráfico.
    let e = reducirSerieActiva(ESTADO_INICIAL, { tipo: "fijar", indice: 4 });
    e = reducirSerieActiva(e, { tipo: "fijar", indice: 4 });
    expect(e.fijado).toBeNull();
  });

  it("soltar sin nada fijado devuelve el MISMO objeto", () => {
    expect(reducirSerieActiva(ESTADO_INICIAL, { tipo: "soltar" })).toBe(ESTADO_INICIAL);
  });

  it("Escape suelta el punto Y el resaltado, pero no reenciende lo apagado", () => {
    let e = reducirSerieActiva(ESTADO_INICIAL, { tipo: "alternarOculta", clave: "presupuesto" });
    e = reducirSerieActiva(e, { tipo: "activar", clave: "real" });
    e = reducirSerieActiva(e, { tipo: "fijar", indice: 2 });
    const tras = reducirSerieActiva(e, { tipo: "limpiar" });
    expect(tras.fijado).toBeNull();
    expect(tras.activa).toBeNull();
    expect([...tras.ocultas]).toEqual(["presupuesto"]);
  });

  it("apagar una serie no suelta el punto fijado: son cosas distintas", () => {
    let e = reducirSerieActiva(ESTADO_INICIAL, { tipo: "fijar", indice: 3 });
    e = reducirSerieActiva(e, { tipo: "alternarOculta", clave: "real" });
    expect(e.fijado).toBe(3);
  });

  it("el índice 0 se fija: no puede confundirse con «nada fijado»", () => {
    // El error clásico de usar el índice como booleano.
    const e = reducirSerieActiva(ESTADO_INICIAL, { tipo: "fijar", indice: 0 });
    expect(e.fijado).toBe(0);
    expect(e.fijado).not.toBeNull();
  });
});

describe("posicionAnclada", () => {
  const ancho = 600;
  const anchoTooltip = 180;

  it("en el centro, centra el tooltip sobre el punto", () => {
    expect(posicionAnclada({ ancho, x: 300, anchoTooltip })).toBe(210);
  });

  it("a la izquierda, se pega al borde sin salirse", () => {
    expect(posicionAnclada({ ancho, x: 10, anchoTooltip })).toBe(0);
  });

  it("a la derecha, se pega al otro borde", () => {
    expect(posicionAnclada({ ancho, x: 595, anchoTooltip })).toBe(ancho - anchoTooltip);
  });

  it("nunca se sale del área, para cualquier punto", () => {
    for (let x = 0; x <= ancho; x += 17) {
      const p = posicionAnclada({ ancho, x, anchoTooltip });
      expect(p, `x=${x}`).toBeGreaterThanOrEqual(0);
      expect(p + anchoTooltip, `x=${x}`).toBeLessThanOrEqual(ancho);
    }
  });

  it("si el tooltip es más ancho que el gráfico, se pega a la izquierda", () => {
    // No hay clamp posible; al menos se ve el principio del texto.
    expect(posicionAnclada({ ancho: 120, x: 60, anchoTooltip: 180 })).toBe(0);
  });
});

describe("describirPunto", () => {
  it("junta etiqueta y valor de cada serie con punto y coma", () => {
    // Punto y coma y no coma: la coma ya separa los miles dentro de cada cifra, y el lector
    // las encadenaría.
    expect(
      describirPunto("may 26", [
        { etiqueta: "Real", valor: "₡1.887.000" },
        { etiqueta: "Presupuesto", valor: "₡1.930.000" },
      ]),
    ).toBe("may 26: Real ₡1.887.000; Presupuesto ₡1.930.000");
  });

  it("sin filas anuncia solo el periodo", () => {
    expect(describirPunto("may 26", [])).toBe("may 26");
  });
});

describe("deltaComparacion", () => {
  it("subida: signo, monto y porcentaje con una decimal", () => {
    const d = deltaComparacion(1_930_000, 1_887_000, fmt);
    expect(d.direccion).toBe(1);
    expect(d.texto).toBe("+₡43.000 (+2,3 %)");
  });

  it("bajada: el signo es un menos real, no un guion", () => {
    const d = deltaComparacion(1_800_000, 2_000_000, fmt);
    expect(d.direccion).toBe(-1);
    expect(d.texto).toBe("−₡200.000 (−10,0 %)");
  });

  it("sin cambio: dirección 0 y sin signo", () => {
    expect(deltaComparacion(100, 100, fmt)).toEqual({ texto: "₡0 (0,0 %)", direccion: 0 });
  });

  it("anterior 0 o nulo → guion, no un porcentaje infinito", () => {
    // Un cambio desde cero es «apareció», no «creció un infinito por ciento».
    for (const anterior of [0, null, undefined, NaN]) {
      expect(deltaComparacion(500, anterior, fmt).texto, String(anterior)).toBe(SIN_COMPARACION);
      expect(deltaComparacion(500, anterior, fmt).direccion).toBeNull();
    }
  });

  it("actual nulo o no finito tampoco produce delta", () => {
    expect(deltaComparacion(null, 100, fmt).texto).toBe(SIN_COMPARACION);
    expect(deltaComparacion(Infinity, 100, fmt).texto).toBe(SIN_COMPARACION);
  });

  it("el porcentaje se calcula sobre el ANTERIOR", () => {
    // «creció un 50 %» significa medio anterior más, no medio actual.
    expect(deltaComparacion(150, 100, fmt).texto).toContain("+50,0 %");
  });

  it("con un anterior negativo, el porcentaje usa su magnitud", () => {
    // Si no, una deuda que baja de −100 a −50 daría «−50 %» cuando mejoró.
    const d = deltaComparacion(-50, -100, fmt);
    expect(d.direccion).toBe(1);
    expect(d.texto).toBe("+₡50 (+50,0 %)");
  });
});

describe("tonoDelta", () => {
  it("en ingresos, subir es bueno; en gastos, malo", () => {
    expect(tonoDelta(1, "arriba")).toBe("bueno");
    expect(tonoDelta(1, "abajo")).toBe("malo");
    expect(tonoDelta(-1, "abajo")).toBe("bueno");
    expect(tonoDelta(-1, "arriba")).toBe("malo");
  });

  it("sin sentido declarado, o sin cambio, va neutro", () => {
    expect(tonoDelta(1, undefined)).toBe("neutro");
    expect(tonoDelta(0, "arriba")).toBe("neutro");
    expect(tonoDelta(null, "arriba")).toBe("neutro");
  });
});

describe("filasTooltip", () => {
  const seis: FilaTooltip[] = [
    { serie: serie("a"), valor: 10 },
    { serie: serie("b"), valor: 900 },
    { serie: serie("c"), valor: -800 },
    { serie: serie("d"), valor: 30 },
    { serie: serie("e"), valor: 700 },
    { serie: serie("f"), valor: 5 },
  ];

  it("con 4 o menos, las devuelve todas y no omite nada", () => {
    const r = filasTooltip(seis.slice(0, 4));
    expect(r.filas).toHaveLength(4);
    expect(r.omitidas).toBe(0);
  });

  it("con 6 muestra las 4 de mayor valor ABSOLUTO y cuenta 2", () => {
    // El valor absoluto importa: un gasto de −800 pesa tanto como un ingreso de 800.
    const r = filasTooltip(seis);
    expect(r.omitidas).toBe(2);
    expect(r.filas.map((f) => f.serie.clave).sort()).toEqual(["b", "c", "d", "e"]);
  });

  it("las devuelve en el orden de DECLARACIÓN, no en el de peso", () => {
    // El tooltip tiene que leerse igual que la leyenda; si se ordenara por valor, cada punto
    // reordenaría la lista y sería imposible seguir una serie.
    expect(filasTooltip(seis).filas.map((f) => f.serie.clave)).toEqual(["b", "c", "d", "e"]);
  });

  it("el `max` se puede bajar", () => {
    const r = filasTooltip(seis, 2);
    expect(r.filas).toHaveLength(2);
    expect(r.omitidas).toBe(4);
  });

  it("sin filas no revienta", () => {
    expect(filasTooltip([])).toEqual({ filas: [], omitidas: 0 });
  });
});

describe("formatoEjeX", () => {
  it("una fecha ISO sale igual que por `formatMonthShort`", () => {
    // El eje y la cabecera del tooltip tienen que decir lo mismo: una sola función.
    for (const iso of ["2026-08", "2026-08-16", "2025-01-01"]) {
      expect(formatoEjeX(iso), iso).toBe(formatMonthShort(iso));
    }
  });

  it("lo que ya es legible se deja tal cual", () => {
    expect(formatoEjeX("abr")).toBe("abr");
    expect(formatoEjeX("may 26")).toBe("may 26");
  });

  it("sin etiqueta devuelve cadena vacía, no «undefined»", () => {
    expect(formatoEjeX(undefined)).toBe("");
  });

  it("un número se convierte a texto sin tocarlo", () => {
    expect(formatoEjeX(2026)).toBe("2026");
  });
});

/**
 * Motor de historial/tendencia (puro): colapso diario→mensual, ventana, variación y
 * render honesto cuando no hay historia suficiente.
 */
import { describe, it, expect } from "vitest";
import {
  claveMes,
  etiquetaPeriodo,
  colapsarAMensual,
  ultimosMeses,
  calcularVariacion,
  construirHistorial,
  renderHistorial,
  CONSULTAR_HISTORIAL_TOOL,
  type SeriePunto,
} from "@/lib/ai/history-query";

const p = (periodo: string, valor: number): SeriePunto => ({ periodo, valor });

describe("utilidades de periodo", () => {
  it("claveMes recorta a YYYY-MM en ambos formatos", () => {
    expect(claveMes("2026-08-14")).toBe("2026-08");
    expect(claveMes("2026-08")).toBe("2026-08");
  });

  it("etiquetaPeriodo formatea en español", () => {
    expect(etiquetaPeriodo("2026-08")).toBe("agosto 2026");
    expect(etiquetaPeriodo("2026-01-01")).toBe("enero 2026");
  });

  it("un periodo basura se devuelve tal cual, no revienta", () => {
    expect(etiquetaPeriodo("basura")).toBe("basura");
    expect(etiquetaPeriodo("2026-13")).toBe("2026-13");
  });
});

describe("colapsarAMensual", () => {
  it("se queda con el ÚLTIMO día de cada mes (valor de cierre), no con el promedio", () => {
    const serie = colapsarAMensual([
      { fecha: "2026-07-01", valor: 100 },
      { fecha: "2026-07-15", valor: 200 },
      { fecha: "2026-07-31", valor: 300 },
      { fecha: "2026-08-02", valor: 400 },
    ]);
    expect(serie).toEqual([
      { periodo: "2026-07", valor: 300 },
      { periodo: "2026-08", valor: 400 },
    ]);
  });

  it("ordena cronológicamente aunque la entrada venga desordenada", () => {
    const serie = colapsarAMensual([
      { fecha: "2026-09-10", valor: 3 },
      { fecha: "2026-07-10", valor: 1 },
      { fecha: "2026-08-10", valor: 2 },
    ]);
    expect(serie.map((s) => s.periodo)).toEqual(["2026-07", "2026-08", "2026-09"]);
  });

  it("un mes con un solo punto lo conserva", () => {
    expect(colapsarAMensual([{ fecha: "2026-08-14", valor: 42 }])).toEqual([
      { periodo: "2026-08", valor: 42 },
    ]);
  });

  it("entrada vacía → serie vacía", () => {
    expect(colapsarAMensual([])).toEqual([]);
  });
});

describe("ultimosMeses", () => {
  const larga = Array.from({ length: 24 }, (_, i) => p(`2025-${String((i % 12) + 1).padStart(2, "0")}`, i));

  it("recorta a los últimos N (los más recientes están al final)", () => {
    const r = ultimosMeses(larga, 3);
    expect(r).toHaveLength(3);
    expect(r.at(-1)).toEqual(larga.at(-1));
  });

  it("acota a 60 meses y cae a 6 con un valor inválido", () => {
    expect(ultimosMeses(larga, 999)).toHaveLength(24); // no hay más que 24
    expect(ultimosMeses(larga, 0)).toHaveLength(6);
    expect(ultimosMeses(larga, NaN)).toHaveLength(6);
  });
});

describe("calcularVariacion", () => {
  it("calcula delta y % entre el primero y el último", () => {
    const v = calcularVariacion([p("2026-06", 100), p("2026-07", 120), p("2026-08", 150)]);
    expect(v?.delta).toBe(50);
    expect(v?.pct).toBe(50);
    expect(v?.direccion).toBe("sube");
  });

  it("detecta la baja", () => {
    const v = calcularVariacion([p("2026-06", 200), p("2026-08", 150)]);
    expect(v?.direccion).toBe("baja");
    expect(v?.delta).toBe(-50);
  });

  it("un cambio menor a 3% es 'estable', no una tendencia", () => {
    const v = calcularVariacion([p("2026-06", 100), p("2026-08", 102)]);
    expect(v?.direccion).toBe("estable");
  });

  it("base 0 → pct null (no existe 'creciste un infinito por ciento')", () => {
    const v = calcularVariacion([p("2026-06", 0), p("2026-08", 500)]);
    expect(v?.pct).toBeNull();
    expect(v?.direccion).toBe("sube");
    expect(v?.delta).toBe(500);
  });

  it("con menos de dos puntos no hay variación", () => {
    expect(calcularVariacion([p("2026-08", 100)])).toBeNull();
    expect(calcularVariacion([])).toBeNull();
  });

  it("una base NEGATIVA (patrimonio en rojo) usa el valor absoluto y no invierte el signo", () => {
    const v = calcularVariacion([p("2026-06", -100), p("2026-08", -50)]);
    expect(v?.delta).toBe(50);
    expect(v?.direccion).toBe("sube"); // menos deuda neta = mejora
  });
});

describe("construirHistorial + renderHistorial", () => {
  it("sin datos lo dice honestamente y NUNCA menciona falta de acceso", () => {
    const r = construirHistorial([], { metrica: "patrimonio", moneda: "CRC" });
    expect(r.insuficiente).toBe("sin_datos");
    const texto = renderHistorial(r);
    expect(texto).toContain("Todavía no tengo historial");
    expect(texto.toLowerCase()).not.toContain("no tengo acceso");
  });

  it("con un solo punto lo dice y muestra ese punto, sin inventar tendencia", () => {
    const r = construirHistorial([p("2026-08", 1_000_000)], { metrica: "patrimonio", moneda: "CRC" });
    expect(r.insuficiente).toBe("un_solo_punto");
    const texto = renderHistorial(r);
    expect(texto).toContain("solo tengo un punto");
    expect(texto).toContain("agosto 2026");
  });

  it("con serie completa lista los meses y cierra con la variación", () => {
    const r = construirHistorial(
      [p("2026-06", 1_000_000), p("2026-07", 1_100_000), p("2026-08", 1_300_000)],
      { metrica: "patrimonio", moneda: "CRC" },
    );
    const texto = renderHistorial(r);
    expect(texto).toContain("junio 2026");
    expect(texto).toContain("agosto 2026");
    expect(texto).toContain("subió");
    expect(texto).toContain("30%");
  });

  it("respeta la ventana de meses pedida", () => {
    const serie = [p("2026-01", 1), p("2026-02", 2), p("2026-03", 3), p("2026-04", 4)];
    const r = construirHistorial(serie, { metrica: "gasto", moneda: "CRC", meses: 2 });
    expect(r.serie).toHaveLength(2);
    expect(r.serie[0]?.periodo).toBe("2026-03");
  });

  it("cada métrica se nombra distinto en la respuesta", () => {
    const serie = [p("2026-07", 100), p("2026-08", 200)];
    const gasto = renderHistorial(construirHistorial(serie, { metrica: "gasto", moneda: "CRC" }));
    const patr = renderHistorial(construirHistorial(serie, { metrica: "patrimonio", moneda: "CRC" }));
    expect(gasto).toContain("gasto mensual");
    expect(patr).toContain("patrimonio neto");
    expect(gasto).not.toBe(patr);
  });

  it("una serie estable no dice 'subió' ni 'bajó'", () => {
    const r = construirHistorial([p("2026-07", 100), p("2026-08", 101)], {
      metrica: "ahorro",
      moneda: "CRC",
    });
    const texto = renderHistorial(r);
    expect(texto).toContain("estable");
    expect(texto).not.toContain("subió ");
  });
});

describe("declaración de la herramienta", () => {
  it("se llama consultar_historial y exige la métrica", () => {
    expect(CONSULTAR_HISTORIAL_TOOL.name).toBe("consultar_historial");
    expect(CONSULTAR_HISTORIAL_TOOL.parameters.required).toEqual(["metrica"]);
  });

  it("le prohíbe al modelo responder que no tiene acceso", () => {
    expect(CONSULTAR_HISTORIAL_TOOL.description).toContain("no tenés acceso");
  });
});

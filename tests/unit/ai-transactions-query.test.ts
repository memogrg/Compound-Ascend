/**
 * Motor de consulta del libro diario (puro): resolución de periodo, filtros,
 * agregación multimoneda y render determinista.
 */
import { describe, it, expect } from "vitest";
import {
  resolverRango,
  rangoDosMeses,
  sumarDias,
  normalizar,
  filtrarTransacciones,
  agregarTransacciones,
  renderConsulta,
  CONSULTAR_TRANSACCIONES_TOOL,
  type TxnLike,
} from "@/lib/ai/transactions-query";

const HOY = "2026-08-12"; // miércoles

const tx = (
  occurredOn: string,
  amount: number,
  extra: Partial<TxnLike> = {},
): TxnLike => ({
  kind: "gasto",
  amount,
  currency: "CRC",
  occurredOn,
  merchantOrSource: null,
  description: null,
  categoryId: null,
  ...extra,
});

describe("resolverRango", () => {
  it("hoy y ayer son un solo día", () => {
    expect(resolverRango("hoy", HOY)).toEqual({ from: HOY, to: HOY, etiqueta: "hoy" });
    expect(resolverRango("ayer", HOY)).toEqual({
      from: "2026-08-11",
      to: "2026-08-11",
      etiqueta: "ayer",
    });
  });

  it("la semana arranca el LUNES (es-CR), no el domingo", () => {
    // 2026-08-12 es miércoles → lunes de esa semana es el 10.
    expect(resolverRango("semana", HOY).from).toBe("2026-08-10");
    expect(resolverRango("semana", HOY).to).toBe(HOY);
  });

  it("la semana pasada es el bloque lunes-domingo anterior, sin solaparse", () => {
    const r = resolverRango("semana_pasada", HOY);
    expect(r.from).toBe("2026-08-03");
    expect(r.to).toBe("2026-08-09");
  });

  it("el mes en curso llega hasta hoy, no hasta fin de mes (no hay futuro que sumar)", () => {
    const r = resolverRango("mes", HOY);
    expect(r.from).toBe("2026-08-01");
    expect(r.to).toBe(HOY);
  });

  it("mes_pasado toma el mes completo y cruza el año en enero", () => {
    expect(resolverRango("mes_pasado", HOY)).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
      etiqueta: "julio 2026",
    });
    expect(resolverRango("mes_pasado", "2026-01-09")).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
      etiqueta: "diciembre 2025",
    });
  });

  it("un mes por nombre que todavía no llegó se entiende como el del año pasado", () => {
    expect(resolverRango("marzo", HOY).from).toBe("2026-03-01"); // ya pasó en 2026
    expect(resolverRango("noviembre", HOY).from).toBe("2025-11-01"); // todavía no llega
  });

  it("febrero de año bisiesto termina el 29", () => {
    expect(resolverRango("febrero", "2024-06-01").to).toBe("2024-02-29");
  });

  it("'ultimos N dias' incluye hoy (N días en total, no N+1)", () => {
    const r = resolverRango("ultimos_7_dias", HOY);
    expect(r.from).toBe("2026-08-06");
    expect(r.to).toBe(HOY);
  });

  it("un rango explícito manda sobre el periodo nombrado", () => {
    const r = resolverRango("mes", HOY, "2026-01-01", "2026-01-31");
    expect(r.from).toBe("2026-01-01");
    expect(r.to).toBe("2026-01-31");
  });

  it("un periodo desconocido cae al mes en curso, nunca revienta", () => {
    expect(resolverRango("blah", HOY).from).toBe("2026-08-01");
    expect(resolverRango(null, HOY).from).toBe("2026-08-01");
  });

  it("rangoDosMeses cubre el mes anterior completo hasta hoy", () => {
    expect(rangoDosMeses(HOY)).toEqual({
      from: "2026-07-01",
      to: HOY,
      etiqueta: "este mes vs. el pasado",
    });
  });

  it("sumarDias cruza meses y años sin corrimiento de zona", () => {
    expect(sumarDias("2026-08-31", 1)).toBe("2026-09-01");
    expect(sumarDias("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("normalizar y filtros", () => {
  it("normalizar quita tildes y baja a minúsculas", () => {
    expect(normalizar("Cafetería Súper")).toBe("cafeteria super");
  });

  it("filtra por tipo", () => {
    const txns = [tx("2026-08-01", 100), tx("2026-08-02", 500, { kind: "ingreso" })];
    expect(filtrarTransacciones(txns, { tipo: "gasto" })).toHaveLength(1);
    expect(filtrarTransacciones(txns, { tipo: "ingreso" })).toHaveLength(1);
    expect(filtrarTransacciones(txns, { tipo: "todos" })).toHaveLength(2);
  });

  it("filtra por comercio ignorando tildes y mayúsculas, mirando también la descripción", () => {
    const txns = [
      tx("2026-08-01", 100, { merchantOrSource: "Automercado" }),
      tx("2026-08-02", 200, { description: "compra en AUTOMERCADO centro" }),
      tx("2026-08-03", 300, { merchantOrSource: "Walmart" }),
    ];
    expect(filtrarTransacciones(txns, { comercio: "automercado" })).toHaveLength(2);
  });

  it("filtra por sobre resolviendo el nombre de la categoría", () => {
    const txns = [
      tx("2026-08-01", 100, { categoryId: "c1" }),
      tx("2026-08-02", 200, { categoryId: "c2" }),
    ];
    const nombres = { c1: "Restaurantes", c2: "Transporte" };
    expect(filtrarTransacciones(txns, { sobre: "restau" }, nombres)).toHaveLength(1);
  });
});

describe("agregarTransacciones", () => {
  const rango = { from: "2026-08-01", to: HOY, etiqueta: "este mes" };

  it("agrupa por día y ordena por monto descendente (los picos primero)", () => {
    const txns = [
      tx("2026-08-01", 1000),
      tx("2026-08-02", 5000),
      tx("2026-08-02", 3000),
      tx("2026-08-03", 200),
    ];
    const r = agregarTransacciones(txns, { rango, agrupacion: "dia", moneda: "CRC" });
    expect(r.grupos[0]?.clave).toBe("2026-08-02");
    expect(r.grupos[0]?.total).toBe(8000);
    expect(r.grupos[0]?.conteo).toBe(2);
    expect(r.total).toBe(9200);
  });

  it("agrupa por comercio sumando variantes de mayúsculas/tildes bajo la misma clave", () => {
    const txns = [
      tx("2026-08-01", 100, { merchantOrSource: "Café Rojo" }),
      tx("2026-08-02", 250, { merchantOrSource: "CAFE ROJO" }),
      tx("2026-08-03", 700, { merchantOrSource: "Walmart" }),
    ];
    const r = agregarTransacciones(txns, { rango, agrupacion: "comercio", moneda: "CRC" });
    expect(r.grupos).toHaveLength(2);
    const cafe = r.grupos.find((g) => g.clave === "cafe rojo");
    expect(cafe?.total).toBe(350);
    expect(cafe?.conteo).toBe(2);
  });

  it("agrupa por semana usando el lunes como clave", () => {
    const txns = [tx("2026-08-10", 100), tx("2026-08-12", 200), tx("2026-08-03", 50)];
    const r = agregarTransacciones(txns, { rango, agrupacion: "semana", moneda: "CRC" });
    const semana = r.grupos.find((g) => g.clave === "2026-08-10");
    expect(semana?.total).toBe(300);
  });

  it("las transacciones sin sobre caen en un grupo propio, no se pierden", () => {
    const txns = [tx("2026-08-01", 100, { categoryId: "c1" }), tx("2026-08-02", 400)];
    const r = agregarTransacciones(txns, {
      rango,
      agrupacion: "categoria",
      moneda: "CRC",
      nombresPorCategoria: { c1: "Restaurantes" },
    });
    expect(r.grupos.find((g) => g.clave === "sin_categoria")?.total).toBe(400);
    expect(r.conteo).toBe(2);
  });

  it("respeta el tope y lo acota al máximo", () => {
    const txns = Array.from({ length: 40 }, (_, i) =>
      tx(`2026-08-${String((i % 28) + 1).padStart(2, "0")}`, i + 1),
    );
    expect(agregarTransacciones(txns, { rango, agrupacion: "dia", tope: 3, moneda: "CRC" }).grupos).toHaveLength(3);
    expect(
      agregarTransacciones(txns, { rango, agrupacion: "dia", tope: 999, moneda: "CRC" }).grupos.length,
    ).toBeLessThanOrEqual(50);
  });

  it("sin agrupación lista movimientos ordenados por fecha descendente", () => {
    const txns = [tx("2026-08-01", 100), tx("2026-08-05", 200)];
    const r = agregarTransacciones(txns, { rango, agrupacion: "ninguna", moneda: "CRC" });
    expect(r.movimientos[0]?.fecha).toBe("2026-08-05");
    expect(r.grupos).toHaveLength(0);
  });

  it("un conjunto vacío da conteo 0 sin inventar un total", () => {
    const r = agregarTransacciones([], { rango, agrupacion: "dia", moneda: "CRC" });
    expect(r.conteo).toBe(0);
    expect(r.total).toBeNull();
    expect(r.grupos).toHaveLength(0);
  });
});

describe("disciplina de moneda", () => {
  const rango = { from: "2026-08-01", to: HOY, etiqueta: "este mes" };
  const mixtas = [
    tx("2026-08-01", 10000, { currency: "CRC" }),
    tx("2026-08-02", 20, { currency: "USD" }),
  ];

  it("con tasas para todas las monedas da un total convertido", () => {
    const rates = { CRC: 500, USD: 1 };
    const r = agregarTransacciones(mixtas, { rango, moneda: "CRC", rates });
    expect(r.total).toBe(20000); // 10000 CRC + 20 USD × 500
  });

  it("SIN tasas no inventa un total: lo deja null y expone los subtotales", () => {
    const r = agregarTransacciones(mixtas, { rango, moneda: "CRC", rates: null });
    expect(r.total).toBeNull();
    expect(r.subtotalesGenerales).toHaveLength(2);
  });

  it("una sola moneda igual a la de visualización no necesita tasas", () => {
    const r = agregarTransacciones([tx("2026-08-01", 5000)], { rango, moneda: "CRC", rates: null });
    expect(r.total).toBe(5000);
  });

  it("un grupo sin total convertible se ordena al final, no al principio", () => {
    const rates = null;
    const txns = [
      tx("2026-08-01", 100, { currency: "CRC" }),
      tx("2026-08-02", 50, { currency: "CRC" }),
      tx("2026-08-03", 1, { currency: "USD" }),
      tx("2026-08-03", 1, { currency: "CRC" }), // mismo día, mezcla → sin total
    ];
    const r = agregarTransacciones(txns, { rango, agrupacion: "dia", moneda: "CRC", rates });
    expect(r.grupos.at(-1)?.clave).toBe("2026-08-03");
  });
});

describe("renderConsulta", () => {
  const rango = { from: "2026-08-01", to: HOY, etiqueta: "este mes" };

  it("un periodo vacío lo dice explícito — NUNCA 'no tengo acceso'", () => {
    const r = agregarTransacciones([], { rango, tipo: "gasto", moneda: "CRC" });
    const texto = renderConsulta(r);
    expect(texto).toContain("No tenés gastos");
    expect(texto).toContain("este mes");
    expect(texto.toLowerCase()).not.toContain("no tengo acceso");
  });

  it("nombra el filtro de comercio en la respuesta vacía", () => {
    const r = agregarTransacciones([], {
      rango,
      tipo: "gasto",
      moneda: "CRC",
      filtros: { comercio: "Walmart", sobre: null },
    });
    expect(renderConsulta(r)).toContain("en Walmart");
  });

  it("lista los picos por día con sus cifras reales", () => {
    const txns = [tx("2026-08-02", 8000), tx("2026-08-01", 1000)];
    const r = agregarTransacciones(txns, { rango, tipo: "gasto", agrupacion: "dia", moneda: "CRC" });
    const texto = renderConsulta(r);
    expect(texto).toContain("2 de agosto");
    expect(texto).toContain("Desglose por día");
  });

  it("con dos meses agrega la comparación en el orden cronológico correcto", () => {
    const txns = [
      tx("2026-07-05", 10000),
      tx("2026-08-05", 15000),
    ];
    const r = agregarTransacciones(txns, {
      rango: rangoDosMeses(HOY),
      tipo: "gasto",
      agrupacion: "mes",
      moneda: "CRC",
    });
    const texto = renderConsulta(r);
    expect(texto).toContain("Subió");
    expect(texto).toContain("50%"); // 15000 vs 10000
    expect(texto).toContain("julio 2026");
  });

  it("detecta la baja además de la subida", () => {
    const txns = [tx("2026-07-05", 20000), tx("2026-08-05", 15000)];
    const r = agregarTransacciones(txns, {
      rango: rangoDosMeses(HOY),
      tipo: "gasto",
      agrupacion: "mes",
      moneda: "CRC",
    });
    expect(renderConsulta(r)).toContain("Bajó");
  });

  it("los ingresos se muestran con signo +", () => {
    const txns = [tx("2026-08-01", 500000, { kind: "ingreso", merchantOrSource: "Salario" })];
    const r = agregarTransacciones(txns, { rango, tipo: "ingreso", agrupacion: "ninguna", moneda: "CRC" });
    expect(renderConsulta(r)).toContain("+");
    expect(renderConsulta(r)).toContain("Salario");
  });
});

describe("declaración de la herramienta", () => {
  it("se llama consultar_transacciones y no exige argumentos", () => {
    expect(CONSULTAR_TRANSACCIONES_TOOL.name).toBe("consultar_transacciones");
    expect(CONSULTAR_TRANSACCIONES_TOOL.parameters.required).toEqual([]);
  });

  it("le dice explícitamente al modelo que NUNCA responda 'no tengo acceso'", () => {
    expect(CONSULTAR_TRANSACCIONES_TOOL.description).toContain("no tenés acceso");
  });
});

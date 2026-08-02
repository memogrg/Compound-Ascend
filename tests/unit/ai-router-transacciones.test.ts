/**
 * Ruteo determinista del LIBRO DIARIO (consulta_transacciones).
 *
 * Lo que se prueba acá es sobre todo el ORDEN: los patrones nuevos van antes de
 * REASONING_CUES (que atraparía "comparar"/"vs") y antes de gasto_mes/gasto_categoria
 * (que son golosos y responderían el agregado del mes en curso a una pregunta que pide
 * otro periodo). Cada test que rutea al carril nuevo tiene su gemelo que verifica que
 * el intent viejo NO se rompió.
 */
import { describe, it, expect } from "vitest";

vi.mock("server-only", () => ({}));

import { vi } from "vitest";
import { matchIntent, extractPeriodo, extractTerminoGasto } from "@/lib/ai/router";

const intentOf = (q: string) => matchIntent(q)?.intent ?? null;
const paramsOf = (q: string) => matchIntent(q)?.params ?? {};

describe("extractPeriodo", () => {
  it("reconoce los marcadores temporales comunes", () => {
    expect(extractPeriodo("¿cuánto gasté hoy?")).toBe("hoy");
    expect(extractPeriodo("¿y ayer?")).toBe("ayer");
    expect(extractPeriodo("gastos de esta semana")).toBe("semana");
    expect(extractPeriodo("¿cuánto gasté la semana pasada?")).toBe("semana_pasada");
    expect(extractPeriodo("¿cuánto gasté el mes pasado?")).toBe("mes_pasado");
    expect(extractPeriodo("¿cuánto gasté el año pasado?")).toBe("anio_pasado");
    expect(extractPeriodo("gastos en marzo")).toBe("marzo");
    expect(extractPeriodo("los últimos 15 días")).toBe("ultimos_15_dias");
  });

  it("'setiembre' (grafía tica) se normaliza a septiembre", () => {
    expect(extractPeriodo("cuánto gasté en setiembre")).toBe("septiembre");
  });

  it("'este mes' a secas NO es un periodo — eso sigue siendo gasto_mes", () => {
    expect(extractPeriodo("¿cuánto gasté este mes?")).toBeNull();
    expect(extractPeriodo("¿cuánto gasté?")).toBeNull();
  });

  it("la semana pasada gana sobre 'esta semana' cuando aparecen las dos formas", () => {
    expect(extractPeriodo("comparado con la semana pasada")).toBe("semana_pasada");
  });
});

describe("extractTerminoGasto", () => {
  it("saca el comercio tras el verbo", () => {
    expect(extractTerminoGasto("¿cuánto le gasté a Walmart?")).toBe("Walmart");
    expect(extractTerminoGasto("cuánto gasté en Automercado")).toBe("Automercado");
  });

  it("corta el marcador temporal pegado al término", () => {
    expect(extractTerminoGasto("cuánto gasté en Walmart este mes")).toBe("Walmart");
    expect(extractTerminoGasto("cuánto gasté en Walmart en marzo")).toBe("Walmart");
  });

  it("no confunde muletillas con un comercio", () => {
    expect(extractTerminoGasto("¿cuánto gasté en total?")).toBeNull();
    expect(extractTerminoGasto("¿cuánto gasté?")).toBeNull();
  });
});

describe("A) picos por fecha", () => {
  it("'¿qué días gasto más?' agrupa por día ordenado por monto", () => {
    expect(intentOf("¿qué días gasto más?")).toBe("consulta_transacciones");
    expect(paramsOf("¿qué días gasto más?")).toMatchObject({
      tipo: "gasto",
      agrupacion: "dia",
      orden: "monto_desc",
    });
  });

  it("'¿en qué fechas gasto más?' — la pregunta que motivó todo esto", () => {
    expect(intentOf("¿en qué fechas gasto más?")).toBe("consulta_transacciones");
    expect(paramsOf("¿en qué fechas gasto más?")).toMatchObject({ agrupacion: "dia" });
  });

  it("respeta el periodo si la pregunta lo trae", () => {
    expect(paramsOf("¿qué días gasté más el mes pasado?")).toMatchObject({
      periodo: "mes_pasado",
      agrupacion: "dia",
    });
  });
});

describe("B) comparación de dos periodos", () => {
  it("'¿gasté más este mes que el pasado?' NO se va al LLM por el guard de razonamiento", () => {
    expect(intentOf("¿gasté más este mes que el pasado?")).toBe("consulta_transacciones");
    expect(paramsOf("¿gasté más este mes que el pasado?")).toMatchObject({
      periodo: "mes_y_anterior",
      agrupacion: "mes",
    });
  });

  it("'este mes vs el pasado' también, pese a que 'vs' es señal de razonamiento", () => {
    expect(intentOf("mis gastos: este mes vs el pasado")).toBe("consulta_transacciones");
  });

  it("'comparar mis gastos con el mes pasado' entra al carril determinista", () => {
    expect(intentOf("comparame mis gastos con el mes pasado")).toBe("consulta_transacciones");
  });
});

describe("C) ranking por comercio", () => {
  it("'¿a quién le gasto más?' agrupa por comercio", () => {
    expect(intentOf("¿a quién le gasto más?")).toBe("consulta_transacciones");
    expect(paramsOf("¿a quién le gasto más?")).toMatchObject({ agrupacion: "comercio" });
  });

  it("'¿en qué comercio gasto más?' idem", () => {
    expect(paramsOf("¿en qué comercio gasto más?")).toMatchObject({ agrupacion: "comercio" });
  });
});

describe("D) gasto con periodo explícito", () => {
  it("'¿cuánto gasté la semana pasada?' consulta el libro, no el agregado del mes", () => {
    expect(intentOf("¿cuánto gasté la semana pasada?")).toBe("consulta_transacciones");
    expect(paramsOf("¿cuánto gasté la semana pasada?")).toMatchObject({
      periodo: "semana_pasada",
      tipo: "gasto",
    });
  });

  it("'¿en qué gasté esta semana?' desglosa por sobre", () => {
    expect(intentOf("¿en qué gasté esta semana?")).toBe("consulta_transacciones");
    expect(paramsOf("¿en qué gasté esta semana?")).toMatchObject({
      periodo: "semana",
      agrupacion: "categoria",
    });
  });

  it("'¿cuánto gasté en marzo?' toma el mes por nombre", () => {
    expect(paramsOf("¿cuánto gasté en marzo?")).toMatchObject({ periodo: "marzo" });
  });

  it("una pregunta de INGRESOS con periodo se rutea como ingreso", () => {
    expect(paramsOf("¿cuánto ingresé el mes pasado?")).toMatchObject({
      tipo: "ingreso",
      periodo: "mes_pasado",
    });
  });
});

describe("E) gasto en un comercio concreto", () => {
  it("'¿cuánto le gasté a Walmart?' filtra por término", () => {
    expect(intentOf("¿cuánto le gasté a Walmart?")).toBe("consulta_transacciones");
    expect(paramsOf("¿cuánto le gasté a Walmart?")).toMatchObject({ termino: "Walmart" });
  });

  it("sin término NO entra al carril (no se come '¿cuánto gasté?' a secas)", () => {
    expect(intentOf("¿cuánto gasté en total?")).not.toBe("consulta_transacciones");
  });
});

describe("NO REGRESIÓN de los intents golosos", () => {
  it("'¿cuánto gasté?' sigue siendo gasto_mes (agregado del contexto, 0 fetch)", () => {
    expect(intentOf("¿cuánto gasté?")).toBe("gasto_mes");
    expect(intentOf("¿cuánto gasté este mes?")).toBe("gasto_mes");
  });

  it("'¿en qué gasto más?' sigue siendo gasto_categoria", () => {
    expect(intentOf("¿en qué gasto más?")).toBe("gasto_categoria");
    expect(intentOf("¿en qué se me va el dinero?")).toBe("gasto_categoria");
  });

  it("'¿dónde puedo recortar gastos?' sigue escalando al LLM (es consejo, no dato)", () => {
    expect(intentOf("¿dónde puedo recortar gastos?")).toBeNull();
  });

  it("'¿cuánto gano?' sigue siendo ingreso_mes", () => {
    expect(intentOf("¿cuánto gano?")).toBe("ingreso_mes");
  });

  it("'mis últimos movimientos' sigue siendo ultimos_movimientos", () => {
    expect(intentOf("mostrame mis últimos movimientos")).toBe("ultimos_movimientos");
  });

  it("la pregunta COMPUESTA sigue escalando (dos consultas en una)", () => {
    expect(intentOf("¿cuánto gasto y cuánto ahorro al mes?")).toBeNull();
  });

  it("una proyección sigue escalando pese a mencionar gastos", () => {
    expect(intentOf("¿cómo debería reducir mis gastos el próximo año?")).toBeNull();
  });
});

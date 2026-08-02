/**
 * Ruteo determinista de HISTORIAL/TENDENCIA (consulta_historial).
 *
 * El orden importa: va antes de REASONING_CUES (que atrapa "cómo") y antes de
 * resumen_inversiones/gasto_mes, que responderían la FOTO DE HOY a una pregunta de
 * EVOLUCIÓN. Cada caso que rutea al carril nuevo tiene su gemelo de no regresión.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { matchIntent } from "@/lib/ai/router";

const intentOf = (q: string) => matchIntent(q)?.intent ?? null;
const paramsOf = (q: string) => matchIntent(q)?.params ?? {};

describe("señal de cambio + métrica", () => {
  it("'¿cómo cambió mi patrimonio?' — la pregunta del brief", () => {
    expect(intentOf("¿cómo cambió mi patrimonio?")).toBe("consulta_historial");
    expect(paramsOf("¿cómo cambió mi patrimonio?")).toMatchObject({ metrica: "patrimonio" });
  });

  it("'¿cuál es la tendencia de mi gasto?' → métrica gasto", () => {
    expect(paramsOf("¿cuál es la tendencia de mi gasto?")).toMatchObject({ metrica: "gasto" });
  });

  it("'¿cómo viene mi ahorro?' → métrica ahorro", () => {
    expect(paramsOf("¿cómo viene mi ahorro?")).toMatchObject({ metrica: "ahorro" });
  });

  it("'¿cómo evolucionó mi portafolio?' → métrica portafolio", () => {
    expect(paramsOf("¿cómo evolucionó mi portafolio?")).toMatchObject({ metrica: "portafolio" });
  });

  it("'mi patrimonio vs el año pasado' entra pese a que 'vs' es señal de razonamiento", () => {
    expect(intentOf("mi patrimonio vs el año pasado")).toBe("consulta_historial");
  });

  it("'¿mi patrimonio subió?' se toma como pregunta de evolución", () => {
    expect(intentOf("¿mi patrimonio subió este semestre?")).toBe("consulta_historial");
  });

  it("'mes a mes' es señal de serie histórica", () => {
    expect(intentOf("mostrame mi gasto mes a mes")).toBe("consulta_historial");
  });
});

describe("sin métrica reconocible NO entra (no se adivina la serie)", () => {
  it("'¿cómo vengo?' a secas escala en vez de inventar una métrica", () => {
    expect(intentOf("¿cómo vengo?")).not.toBe("consulta_historial");
  });

  it("'¿cuál es la tendencia?' sin objeto tampoco entra", () => {
    expect(intentOf("¿cuál es la tendencia?")).not.toBe("consulta_historial");
  });
});

describe("NO REGRESIÓN: la foto de hoy sigue siendo la foto de hoy", () => {
  it("'¿cuánto tengo invertido?' sigue siendo resumen_inversiones, no historial", () => {
    expect(intentOf("¿cuánto tengo invertido?")).toBe("resumen_inversiones");
  });

  it("'¿cómo va mi portafolio?' sigue siendo resumen_inversiones (estado actual)", () => {
    expect(intentOf("¿cómo va mi portafolio?")).toBe("resumen_inversiones");
  });

  it("'¿cuánto gasté?' sigue siendo gasto_mes", () => {
    expect(intentOf("¿cuánto gasté?")).toBe("gasto_mes");
  });

  it("'¿cuál es mi número de independencia?' no se confunde con historial", () => {
    expect(intentOf("¿cuál es mi número de independencia?")).toBe("numero_independencia");
  });

  it("P1 sigue intacto: '¿qué días gasto más?' va al libro diario, no al historial", () => {
    expect(intentOf("¿qué días gasto más?")).toBe("consulta_transacciones");
  });

  it("P1 sigue intacto: '¿gasté más este mes que el pasado?' va al libro diario", () => {
    // Comparación de DOS PERIODOS de transacciones, no serie de snapshots.
    expect(intentOf("¿gasté más este mes que el pasado?")).toBe("consulta_transacciones");
  });

  it("'¿debería invertir más?' sigue escalando al LLM", () => {
    expect(intentOf("¿debería invertir más el próximo año?")).toBeNull();
  });
});

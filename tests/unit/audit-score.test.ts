/**
 * PUNTAJE DEL BANCO DE AUDITORÍA — el motor puro.
 *
 * Lo que más importa acá es UNA regla: LAS FRASES DE CULPA SON FAIL AUTOMÁTICO. No es un eje más
 * del juez ni un puntaje bajo — es un corte. El producto entero se apoya en que el asesor NO
 * REGAÑA, y una persona que se siente juzgada por su plata deja de abrir la app. Un juez LLM
 * promedia y puede dejar pasar un "deberías haber..." con 4/5 en tono; esta detección es
 * determinista y no la rescata ningún puntaje.
 *
 * El otro lado de esa moneda tiene test propio: los patrones son deliberadamente ESTRECHOS. Un fail
 * automático que se dispara mal hace que se ignore la métrica entera, así que un falso positivo
 * cuesta más caro que un caso dudoso que se escapa.
 */
import { describe, it, expect } from "vitest";
import {
  causaDeFallo,
  compararCorridas,
  frasesDeCulpa,
  resumenComparacion,
  scoreRun,
  tieneCulpa,
  type AuditedRow,
  type JudgeScore,
} from "@/lib/ai/audit-score";

const juez = (over: Partial<JudgeScore> = {}): JudgeScore => ({
  answered: 5,
  concise: 5,
  currency_ok: 5,
  no_hallucination: 5,
  advisor_tone: 5,
  fail: false,
  reason: "",
  ...over,
});

const row = (over: Partial<AuditedRow> = {}): AuditedRow => ({
  id: "q1",
  category: "gastos",
  question: "¿cuánto gasté?",
  reply: "Gastaste ₡120.000 este mes, sobre todo en comida.",
  status: 200,
  latencyMs: 800,
  lane: "llm",
  flags: [],
  judge: juez(),
  ...over,
});

describe("frasesDeCulpa · el asesor no regaña", () => {
  it.each([
    ["deberías haber ahorrado más el mes pasado", "deberias_haber"],
    ["tenías que haber pagado la tarjeta antes", "deberias_haber"],
    ["te lo dije el mes pasado", "te_lo_dije"],
    ["ya te había advertido sobre esa tarjeta", "te_lo_dije"],
    ["fue una decisión irresponsable", "juicio_moral"],
    ["otra vez te pasaste del presupuesto", "reincidencia"],
    ["es una lástima que no hayas ahorrado", "decepcion"],
    ["tenés que dejar de gastar en eso", "reto"],
  ])("detecta el reproche en %j", (texto, patron) => {
    expect(frasesDeCulpa(texto)).toContain(patron);
    expect(tieneCulpa(texto)).toBe(true);
  });

  it.each([
    "Gastaste ₡120.000 este mes, sobre todo en comida.",
    "Si querés, podemos apuntar a ₡50.000 al fondo este mes.",
    "Tu tarjeta cobra 40% anual: abonarle primero te ahorra más que invertir.",
    "El mes pasado el gasto fue mayor. ¿Querés que veamos qué lo movió?",
    "Todavía no llegaste a la meta; podemos bajarla a un paso más chico.",
  ])("NO marca una respuesta normal: %j", (texto) => {
    expect(tieneCulpa(texto)).toBe(false);
  });

  it("respuesta vacía no tiene culpa (es otro tipo de falla)", () => {
    expect(frasesDeCulpa("")).toEqual([]);
    expect(frasesDeCulpa("   ")).toEqual([]);
  });
});

describe("causaDeFallo", () => {
  it("la CULPA manda: se evalúa antes que todo y no la rescata un juez perfecto", () => {
    const r = row({ reply: "Deberías haber ahorrado más.", judge: juez(), flags: [], status: 200 });
    expect(causaDeFallo(r)).toBe("culpa");
  });

  it("la culpa gana incluso sobre un error de transporte", () => {
    const r = row({ reply: "Te lo dije el mes pasado.", error: "boom", status: 500 });
    expect(causaDeFallo(r)).toBe("culpa");
  });

  it("un error de transporte falla", () => {
    expect(causaDeFallo(row({ error: "ECONNRESET" }))).toBe("error");
    expect(causaDeFallo(row({ status: 500 }))).toBe("error");
  });

  it("un flag GRAVE falla, con su tipo como causa", () => {
    expect(causaDeFallo(row({ flags: [{ type: "moneda", detail: "mezcló ₡ y $" }] }))).toBe("moneda");
    expect(causaDeFallo(row({ flags: [{ type: "alucinacion", detail: "inventó una deuda" }] }))).toBe(
      "alucinacion",
    );
  });

  it("un flag de calidad NO tumba la corrida (es ruidoso y no es incorrecto)", () => {
    expect(causaDeFallo(row({ flags: [{ type: "flooding", detail: "9 oraciones" }] }))).toBeNull();
    expect(causaDeFallo(row({ flags: [{ type: "inconsistencia", detail: "x" }] }))).toBeNull();
  });

  it("el juez puede fallar una fila que pasó todo lo demás", () => {
    expect(causaDeFallo(row({ judge: juez({ fail: true, reason: "no contestó" }) }))).toBe("juez");
  });

  it("una fila limpia pasa", () => {
    expect(causaDeFallo(row())).toBeNull();
  });

  it("sin juez, la fila se evalúa igual por heurísticas", () => {
    expect(causaDeFallo(row({ judge: null }))).toBeNull();
  });
});

describe("scoreRun", () => {
  it("corrida vacía → score 0 sin reventar", () => {
    const s = scoreRun([]);
    expect(s).toMatchObject({ total: 0, pass: 0, score: 0, failsCulpa: 0 });
    expect(s.latP50).toBeNull();
    expect(s.coberturaDet).toBeNull();
  });

  it("cuenta el score como % de filas que pasan", () => {
    const s = scoreRun([row(), row(), row({ error: "x" }), row({ error: "y" })]);
    expect(s.total).toBe(4);
    expect(s.pass).toBe(2);
    expect(s.score).toBe(50);
  });

  it("desglosa las fallas por causa: dice QUÉ empeoró, no solo que empeoró", () => {
    const s = scoreRun([
      row({ reply: "Deberías haber ahorrado." }),
      row({ flags: [{ type: "moneda", detail: "x" }] }),
      row({ flags: [{ type: "moneda", detail: "y" }] }),
    ]);
    expect(s.fallas).toEqual({ culpa: 1, moneda: 2 });
    expect(s.failsCulpa).toBe(1);
  });

  it("promedia los ejes del juez solo sobre las filas que tuvieron juez", () => {
    const s = scoreRun([
      row({ judge: juez({ concise: 5 }) }),
      row({ judge: juez({ concise: 1 }) }),
      row({ judge: null }),
    ]);
    expect(s.juez.concise).toBe(3);
    expect(s.juez.answered).toBe(5);
  });

  it("la cobertura determinista ignora las filas sin carril detectado", () => {
    const s = scoreRun([
      row({ lane: "determinista" }),
      row({ lane: "llm" }),
      row({ lane: "?" }),
      row({ lane: "?" }),
    ]);
    expect(s.coberturaDet).toBe(50);
  });

  it("las latencias en 0 no entran al percentil", () => {
    const s = scoreRun([row({ latencyMs: 0 }), row({ latencyMs: 500 })]);
    expect(s.latP50).toBe(500);
  });
});

describe("compararCorridas", () => {
  const base = scoreRun([row(), row(), row(), row()]);

  it("sin corrida anterior no hay comparación", () => {
    expect(compararCorridas(base, null)).toBeNull();
  });

  it("un cambio bajo el umbral es RUIDO del juez, no una señal", () => {
    const antes = { ...base, score: 90 };
    const ahora = { ...base, score: 91 };
    expect(compararCorridas(ahora, antes)?.veredicto).toBe("igual");
  });

  it("por encima del umbral sí hay veredicto", () => {
    expect(compararCorridas({ ...base, score: 95 }, { ...base, score: 90 })?.veredicto).toBe("mejoró");
    expect(compararCorridas({ ...base, score: 80 }, { ...base, score: 90 })?.veredicto).toBe("empeoró");
  });

  it("lista qué causas crecieron y cuáles bajaron", () => {
    const antes = { ...base, fallas: { moneda: 1, culpa: 0, error: 4 } };
    const ahora = { ...base, fallas: { moneda: 5, error: 1 } };
    const c = compararCorridas(ahora, antes)!;
    expect(c.empeoraron).toEqual([{ causa: "moneda", antes: 1, ahora: 5 }]);
    expect(c.mejoraron).toEqual([{ causa: "error", antes: 4, ahora: 1 }]);
  });

  it("REGRESIÓN DE CULPA: pasar de 0 a ≥1 se marca, sin umbral que lo tape", () => {
    const antes = { ...base, score: 90, failsCulpa: 0 };
    const ahora = { ...base, score: 90.1, failsCulpa: 1 };
    const c = compararCorridas(ahora, antes)!;
    expect(c.veredicto).toBe("igual"); // el score no se movió…
    expect(c.regresionCulpa).toBe(true); // …y aun así esto se reporta
  });

  it("si ya venía regañando, no es una REGRESIÓN nueva", () => {
    const c = compararCorridas({ ...base, failsCulpa: 3 }, { ...base, failsCulpa: 2 })!;
    expect(c.regresionCulpa).toBe(false);
  });
});

describe("resumenComparacion", () => {
  const base = scoreRun([row(), row(), row(), row()]);

  it("primera corrida: lo dice en vez de comparar contra nada", () => {
    expect(resumenComparacion(base, null)).toContain("primera corrida");
  });

  it("incluye el score, el veredicto y el delta", () => {
    const cmp = compararCorridas({ ...base, score: 95 }, { ...base, score: 85 })!;
    const s = resumenComparacion({ ...base, score: 95 }, cmp);
    expect(s).toContain("95.0%");
    expect(s).toContain("mejoró");
    expect(s).toContain("+10.0pp");
  });

  it("la regresión de culpa se grita en el resumen", () => {
    const antes = { ...base, failsCulpa: 0 };
    const ahora = { ...base, failsCulpa: 2 };
    const s = resumenComparacion(ahora, compararCorridas(ahora, antes)!);
    expect(s).toContain("REGRESIÓN DE CULPA");
  });
});

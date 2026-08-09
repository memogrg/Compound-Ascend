/**
 * Detector de RITMO (lib/rhythm/detectors.ts · detectRitmoSobre) y su integración con la
 * campana.
 *
 * El foco está en las dos reglas que no se ven en el motor: el tope de un aviso por sobre
 * por semana —que sale de la clave, no de un contador— y que el cuerpo del insight NOMBRE
 * las salidas, para que sirva desde la campana sin tener que abrir otra pantalla.
 */
import { describe, it, expect } from "vitest";

import { detectRitmoSobre } from "@/lib/rhythm/detectors";
import { detectarRitmo, semanaISO, type SobrePace } from "@/lib/rhythm/spend-pace";
import { suggestedAction } from "@/lib/insights/actions";
import { INSIGHT_RELATED_KINDS } from "@/lib/insights/types";

const fmt = (n: number, c: string) => `${c}${Math.round(n)}`;

const sobre = (over: Partial<SobrePace> & { categoryId: string }): SobrePace => ({
  path: `Vivir › ${over.categoryId}`,
  budget: 400_000,
  spent: 0,
  ...over,
});

/** Un escenario con un sobre apretado y otro con holgura para donar. */
function senales(dia = 8) {
  return detectarRitmo({
    sobres: [
      sobre({ categoryId: "comida", path: "Vivir › Comida", budget: 400_000, spent: 200_000 }),
      sobre({
        categoryId: "transporte",
        path: "Vivir › Transporte",
        budget: 400_000,
        spent: 5_000,
      }),
    ],
    dia,
    diasDelMes: 30,
    currency: "CRC",
  });
}

describe("detectRitmoSobre", () => {
  it("emite un insight por señal con la proyección en el cuerpo", () => {
    const out = detectRitmoSobre({ senales: senales(), dia: 8, todayIso: "2026-08-13", fmt });
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe("ritmo_sobre");
    expect(out[0]?.title).toContain("Vivir › Comida");
    expect(out[0]?.body).toContain("CRC750000");
  });

  it("el cuerpo NOMBRA las salidas: sirve desde la campana, no solo desde Gastos", () => {
    // Un insight que dice el problema y esconde la solución en otra pantalla es medio insight.
    const out = detectRitmoSobre({ senales: senales(), dia: 8, todayIso: "2026-08-13", fmt });
    const body = out[0]!.body;
    expect(body).toContain("mover");
    expect(body).toContain("Vivir › Transporte");
    expect(body).toContain("por día");
    expect(body.toLowerCase()).toContain("dejarlo así");
  });

  it("es 'observar', no 'accionar': todavía no pasó nada malo", () => {
    // La campana ordena por severidad. Una proyección preventiva por encima de una deuda en
    // mora sería mentir sobre la urgencia. El 'accionar' es de sobre_sobregirado.
    const out = detectRitmoSobre({ senales: senales(), dia: 8, todayIso: "2026-08-13", fmt });
    expect(out[0]?.severity).toBe("observar");
  });

  it("no emite nada sin señales — se auto-resuelve cuando el sobre vuelve a su carril", () => {
    expect(detectRitmoSobre({ senales: [], dia: 8, todayIso: "2026-08-13", fmt })).toEqual([]);
  });

  it("topea cuántos emite: una lista de seis sobres en rojo es un muro, no un consejo", () => {
    const muchas = detectarRitmo({
      sobres: [
        sobre({ categoryId: "a", budget: 400_000, spent: 300_000 }),
        sobre({ categoryId: "b", budget: 400_000, spent: 280_000 }),
        sobre({ categoryId: "c", budget: 400_000, spent: 260_000 }),
        sobre({ categoryId: "d", budget: 400_000, spent: 250_000 }),
      ],
      dia: 8,
      diasDelMes: 30,
      currency: "CRC",
    });
    expect(muchas.length).toBeGreaterThan(2);
    expect(detectRitmoSobre({ senales: muchas, dia: 8, todayIso: "2026-08-13", fmt })).toHaveLength(
      2,
    );
    expect(
      detectRitmoSobre({ senales: muchas, dia: 8, todayIso: "2026-08-13", fmt, max: 1 }),
    ).toHaveLength(1);
  });
});

describe("un aviso por sobre por semana · sale de la clave, no de un contador", () => {
  const claveDe = (todayIso: string) =>
    detectRitmoSobre({ senales: senales(), dia: 8, todayIso, fmt })[0]?.relatedId;

  it("días de la misma semana → MISMA clave: una tarjeta que se actualiza", () => {
    // El upsert de syncInsights dedupea por (kind, related_id): todas las pasadas de la
    // semana caen en la misma fila con cifras frescas, en vez de apilar siete tarjetas.
    expect(claveDe("2026-08-10")).toBe(claveDe("2026-08-14"));
  });

  it("la semana siguiente → clave nueva: el aviso vuelve a ser una pregunta legítima", () => {
    expect(claveDe("2026-08-16")).not.toBe(claveDe("2026-08-17"));
  });

  it("la clave lleva el sobre y la semana", () => {
    expect(claveDe("2026-08-13")).toBe(`ritmo:comida:${semanaISO("2026-08-13")}`);
  });

  it("dos sobres distintos en la misma semana no colisionan", () => {
    const dos = detectarRitmo({
      sobres: [
        sobre({ categoryId: "a", budget: 400_000, spent: 300_000 }),
        sobre({ categoryId: "b", budget: 400_000, spent: 280_000 }),
      ],
      dia: 8,
      diasDelMes: 30,
      currency: "CRC",
    });
    const out = detectRitmoSobre({ senales: dos, dia: 8, todayIso: "2026-08-13", fmt });
    expect(out[0]?.relatedId).not.toBe(out[1]?.relatedId);
  });
});

describe("integración con la campana", () => {
  const out = () => detectRitmoSobre({ senales: senales(), dia: 8, todayIso: "2026-08-13", fmt });

  it("relatedKind 'category' está permitido por el check de user_insights", () => {
    // Un valor fuera de INSIGHT_RELATED_KINDS aborta la pasada ENTERA (el bug de 'holding',
    // migración 20260810000001). 'category' es el que habilita el deep-link a /gastos.
    const i = out()[0]!;
    expect(i.relatedKind).toBe("category");
    expect(INSIGHT_RELATED_KINDS).toContain(i.relatedKind!);
  });

  it("la clave NO es un uuid — depende de que related_id sea text (20260813000001)", () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(uuid.test(out()[0]!.relatedId!)).toBe(false);
  });

  it("tiene acción sugerida, y nombra las dos salidas ejecutables", () => {
    const a = suggestedAction("ritmo_sobre");
    expect(a).toBeDefined();
    expect(a!.route).toBe("/gastos");
    expect(a!.label).toContain("mover");
  });
});

describe("tono · estrategia, no culpa", () => {
  it("sin signos de admiración ni vocabulario de reproche", () => {
    const i = detectRitmoSobre({ senales: senales(), dia: 8, todayIso: "2026-08-13", fmt })[0]!;
    const texto = `${i.title} ${i.body}`;
    expect(texto).not.toContain("!");
    expect(texto).not.toContain("¡");
    expect(texto).not.toMatch(/deberías|debiste|cuidado|excesivo|demasiado|descontrol/i);
  });

  it("ofrece 'dejarlo así' como opción explícita, no como abandono silencioso", () => {
    const i = detectRitmoSobre({ senales: senales(), dia: 8, todayIso: "2026-08-13", fmt })[0]!;
    expect(i.body.toLowerCase()).toContain("también es una opción");
  });
});

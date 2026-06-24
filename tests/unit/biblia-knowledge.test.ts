import { describe, it, expect } from "vitest";
import { selectBibliaKnowledge, selectPatrimonioGuidance } from "@/lib/ai/biblia-knowledge";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";

describe("selectBibliaKnowledge", () => {
  it("emoción 'culpa' → incluye su regla", () => {
    const out = selectBibliaKnowledge({ emotion: "culpa" });
    expect(out.some((c) => c.includes("separa conducta de identidad"))).toBe(true);
  });

  it("texto de inversión → incluye el chunk de inversión", () => {
    const out = selectBibliaKnowledge({ text: "quiero invertir en acciones" });
    expect(out.some((c) => c.startsWith("Inversión:"))).toBe(true);
  });

  it("sin emoción ni tema → []", () => {
    expect(selectBibliaKnowledge({ text: "hola, ¿cómo estás?" })).toEqual([]);
    expect(selectBibliaKnowledge({})).toEqual([]);
  });

  it("nunca devuelve más de 3 fragmentos", () => {
    // emoción + texto que toca >2 temas (deuda, ahorro, inversión, gasto).
    const out = selectBibliaKnowledge({
      emotion: "presion",
      text: "tengo deudas, quiero ahorrar, invertir en cripto y dejar de gastar por impulso",
    });
    expect(out.length).toBeLessThanOrEqual(3);
    // 1 de emoción + 2 de tema (tope).
    expect(out.length).toBe(3);
  });
});

describe("selectPatrimonioGuidance", () => {
  it("cada bandera §15 mapea a su acción", () => {
    expect(selectPatrimonioGuidance(["patrimonio_neto_negativo"])[0]).toContain(
      "Patrimonio neto negativo",
    );
    expect(selectPatrimonioGuidance(["patrimonio_alto_baja_liquidez"])[0]).toContain(
      "baja liquidez",
    );
    expect(selectPatrimonioGuidance(["alto_pero_poco_productivo"])[0]).toContain(
      "poco productivo",
    );
    expect(selectPatrimonioGuidance(["alta_tasa_baja_proteccion"])[0]).toContain(
      "baja protección",
    );
    expect(selectPatrimonioGuidance(["deuda_mala_alta"])[0]).toContain("Deuda mala alta");
    expect(selectPatrimonioGuidance(["alta_concentracion"])[0]).toContain("Alta concentración");
    expect(selectPatrimonioGuidance(["alto_gasto_vs_patrimonio"])[0]).toContain("Alto gasto");
  });

  it("ignora banderas desconocidas", () => {
    expect(selectPatrimonioGuidance(["no_existe", "deuda_mala_alta"])).toEqual([
      "Deuda mala alta: activar plan de deuda y limitar nuevos compromisos.",
    ]);
    expect(selectPatrimonioGuidance(["xxx", "yyy"])).toEqual([]);
  });

  it("nunca devuelve más de 3 y no repite", () => {
    const out = selectPatrimonioGuidance([
      "patrimonio_neto_negativo",
      "patrimonio_alto_baja_liquidez",
      "alto_pero_poco_productivo",
      "deuda_mala_alta",
      "deuda_mala_alta",
    ]);
    expect(out.length).toBe(3);
    expect(new Set(out).size).toBe(out.length);
  });

  it("array vacío → []", () => {
    expect(selectPatrimonioGuidance([])).toEqual([]);
  });
});

describe("buildSystemPrompt · knowledge", () => {
  it("con knowledge añade el bloque de base de conocimiento; sin él no aparece", () => {
    const con = buildSystemPrompt({ currency: "CRC", knowledge: ["Deuda: ataca la más cara."] });
    expect(con).toContain("Guía conductual aplicable a esta conversación");
    expect(con).toContain("- Deuda: ataca la más cara.");

    const sin = buildSystemPrompt({ currency: "CRC" });
    expect(sin).not.toContain("Guía conductual aplicable a esta conversación");
  });
});

import { describe, it, expect } from "vitest";
import { selectBibliaKnowledge } from "@/lib/ai/biblia-knowledge";
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

describe("buildSystemPrompt · knowledge", () => {
  it("con knowledge añade el bloque de base de conocimiento; sin él no aparece", () => {
    const con = buildSystemPrompt({ currency: "CRC", knowledge: ["Deuda: ataca la más cara."] });
    expect(con).toContain("Guía conductual aplicable a esta conversación");
    expect(con).toContain("- Deuda: ataca la más cara.");

    const sin = buildSystemPrompt({ currency: "CRC" });
    expect(sin).not.toContain("Guía conductual aplicable a esta conversación");
  });
});

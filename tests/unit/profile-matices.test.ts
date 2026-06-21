import { describe, it, expect } from "vitest";
import { buildMaticesPrompt } from "@/lib/ai/profile-matices";

describe("buildMaticesPrompt", () => {
  const base = {
    archetypeLabel: "El Constructor",
    recommendedTone: "cercano y directo",
    topOpportunity: "Fortalecer tu base de seguridad (fondo de emergencia).",
  };

  it("el system fija los guardrails (2ª persona, sin inventar cifras) y el tono recibido", () => {
    const { system } = buildMaticesPrompt(base);
    expect(system).toContain("segunda");
    expect(system).toContain("NO inventes cifras");
    expect(system).toContain("cercano y directo");
  });

  it("el user incluye el arquetipo y la oportunidad provistos", () => {
    const { user } = buildMaticesPrompt(base);
    expect(user).toContain("El Constructor");
    expect(user).toContain("Fortalecer tu base de seguridad (fondo de emergencia).");
  });

  it("incluye el arquetipo secundario solo cuando se provee", () => {
    expect(buildMaticesPrompt(base).user).not.toContain("rasgos de");
    const con = buildMaticesPrompt({ ...base, archetypeLabel2: "El Protector" });
    expect(con.user).toContain("rasgos de El Protector");
  });

  it("omite los campos opcionales ausentes (nombre, valor, money script)", () => {
    const { user } = buildMaticesPrompt(base);
    expect(user).not.toContain("Nombre:");
    expect(user).not.toContain("Lo que más quiere de su dinero:");
    expect(user).not.toContain("money script");
  });
});

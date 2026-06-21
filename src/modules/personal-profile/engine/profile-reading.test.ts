import { describe, it, expect } from "vitest";
import { buildProfileReading } from "@/modules/personal-profile/engine/profile-reading";
import type { ProfileDraft } from "@/modules/personal-profile/types";

describe("buildProfileReading", () => {
  it("disciplina alta produce su fortaleza", () => {
    const r = buildProfileReading({ discipline: 8 });
    expect(r.strengths).toContain("Puedes sostener un plan en el tiempo.");
  });

  it("sin fondo de emergencia genera la oportunidad de seguridad", () => {
    const r = buildProfileReading({ hasEmergencyFund: "no" });
    expect(r.opportunities).toContain("Fortalecer tu base de seguridad (fondo de emergencia).");
  });

  it("siempre incluye el ancla del arquetipo como oportunidad", () => {
    const r = buildProfileReading({});
    expect(r.opportunities[0]?.startsWith("Tu siguiente nivel: ")).toBe(true);
  });

  it("riskClass agresivo → riskDisplay 'Crecimiento alto'", () => {
    // crecimiento + invierto_mas + volatilidad alta → agresivo.
    const d: ProfileDraft = {
      riskPreference: "crecimiento",
      lossReaction: "invierto_mas",
      volatilityComfort: 10,
    };
    expect(buildProfileReading(d).riskDisplay).toBe("Crecimiento alto");
  });

  it("draft vacío no rompe: fallback de fortaleza, riesgo y ruta presentes", () => {
    const r = buildProfileReading({});
    expect(r.strengths.length).toBeGreaterThan(0);
    expect(r.riskDisplay.length).toBeGreaterThan(0);
    expect(r.route.length).toBe(7);
    expect(r.companionship.avoids).toContain("regaños");
  });

  // ── Lectura espejo (Cierre v3) ──
  it("siempre produce un heroLine no vacío", () => {
    expect(buildProfileReading({}).heroLine.length).toBeGreaterThan(0);
  });

  it("disciplina 10 → superpoder de consistencia", () => {
    expect(buildProfileReading({ discipline: 10 }).superpower.title).toContain("consistencia");
  });

  it("riskClass agresivo → riesgo oculto 'crecer con base'", () => {
    const d: ProfileDraft = {
      riskPreference: "crecimiento",
      lossReaction: "invierto_mas",
      volatilityComfort: 10,
    };
    expect(buildProfileReading(d).hiddenRisk.title).toBe("Lo que debes cuidar: crecer con base");
  });

  it("nextMove.cta es el CTA de marca de 7 minutos", () => {
    expect(buildProfileReading({}).nextMove.cta).toBe("Crear mi mapa financiero en 7 minutos");
  });

  it("control 10 + urgencia crítica → whatThisSays resuelve la contradicción", () => {
    const r = buildProfileReading({ perceivedControl: 10, urgency: "critica" });
    expect(r.whatThisSays).toContain("acelerar con estrategia");
  });
});

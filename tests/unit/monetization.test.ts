import { describe, it, expect } from "vitest";
import { can, isPaidPlan, aiTokenLimit, isUpgrade, isDowngrade, PAID_PLANS } from "@/lib/plan";

describe("gating por plan", () => {
  it("sin plan no se usa nada: no es un tier gratuito disimulado", () => {
    expect(can("ninguno", "ai_chat")).toBe(false);
    expect(can("ninguno", "household")).toBe(false);
    expect(isPaidPlan("ninguno")).toBe(false);
  });

  it("Esencial+ deja conversar, pero la foto y el correo entran desde Pro+", () => {
    expect(can("esencial", "ai_chat")).toBe(true);
    expect(can("esencial", "receipt_scanner")).toBe(false);
    expect(can("esencial", "email_ingest")).toBe(false);
  });

  it("Pro+ suma la captura automática y el simulador", () => {
    expect(can("pro", "receipt_scanner")).toBe(true);
    expect(can("pro", "email_ingest")).toBe(true);
    expect(can("pro", "advanced_simulator")).toBe(true);
  });

  it("el hogar es exclusivo de Max+ — de ahí sale la regla de orfandad", () => {
    expect(can("esencial", "household")).toBe(false);
    expect(can("pro", "household")).toBe(false);
    expect(can("max", "household")).toBe(true);
  });

  it("el uso de My Agent C+ sube con cada escalón", () => {
    expect(aiTokenLimit("esencial")).toBeGreaterThan(aiTokenLimit("ninguno"));
    expect(aiTokenLimit("pro")).toBeGreaterThan(aiTokenLimit("esencial"));
    expect(aiTokenLimit("max")).toBeGreaterThan(aiTokenLimit("pro"));
  });
});

describe("dirección del cambio de plan", () => {
  it("subir y bajar no son lo mismo (y deciden si se cobra hoy o se programa)", () => {
    expect(isUpgrade("esencial", "pro")).toBe(true);
    expect(isDowngrade("max", "pro")).toBe(true);
    expect(isUpgrade("pro", "pro")).toBe(false);
    expect(isDowngrade("pro", "pro")).toBe(false);
  });

  it("salir de un plan de pago a ninguno es una bajada", () => {
    for (const p of PAID_PLANS) expect(isDowngrade(p, "ninguno")).toBe(true);
  });
});

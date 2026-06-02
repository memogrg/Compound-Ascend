import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { can, isPremium, aiTokenLimit } from "@/lib/plan";
import { verifySignature } from "@/lib/security/webhook";

describe("plan gating", () => {
  it("free no tiene funciones premium pero sí lo esencial", () => {
    expect(can("free", "ai_chat")).toBe(true);
    expect(can("free", "receipt_scanner")).toBe(true);
    expect(can("free", "expert_review")).toBe(false);
    expect(can("free", "advanced_simulator")).toBe(false);
  });
  it("premium desbloquea todo", () => {
    expect(can("premium", "expert_review")).toBe(true);
    expect(can("premium", "marketplace")).toBe(true);
    expect(isPremium("premium")).toBe(true);
  });
  it("límites de tokens por plan", () => {
    expect(aiTokenLimit("premium")).toBeGreaterThan(aiTokenLimit("free"));
  });
});

describe("verificación de firma de webhook", () => {
  const secret = "test-secret";
  const body = JSON.stringify({ type: "plan.updated", userId: "u", plan: "premium" });

  it("acepta firma válida", () => {
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifySignature(body, sig, secret)).toBe(true);
  });
  it("rechaza firma inválida o ausente", () => {
    expect(verifySignature(body, "deadbeef", secret)).toBe(false);
    expect(verifySignature(body, null, secret)).toBe(false);
  });
  it("rechaza si el cuerpo cambió", () => {
    const sig = createHmac("sha256", secret).update(body).digest("hex");
    expect(verifySignature(body + "x", sig, secret)).toBe(false);
  });
});

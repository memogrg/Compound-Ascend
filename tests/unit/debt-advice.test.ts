import { describe, it, expect } from "vitest";
import { buildDebtAdvice } from "@/modules/control/engine/debt-advice";

/**
 * #98 · la nota "Tu próxima jugada con tus deudas" no debe recomendar atacar una deuda
 * ya SALDADA. El engine filtra `balance>0`; el residual estaba en la página, que le pasaba
 * el ANCLA en vez del saldo vivo. Estos tests fijan el contrato del engine: con el saldo
 * correcto (≤0 = pagada), una deuda saldada nunca encabeza la recomendación aunque sea la
 * de mayor APR.
 */
describe("buildDebtAdvice · deudas saldadas (#98)", () => {
  const base = { archetypeLabel: "Guardián Familiar", dominantValue: "tu familia" };

  it("no recomienda una deuda saldada (saldo ≤0) aunque tenga el APR más alto", () => {
    const advice = buildDebtAdvice({
      ...base,
      debts: [
        { name: "Tarjeta pagada", balance: -500, apr: 45 }, // saldada, APR más alto
        { name: "Préstamo activo", balance: 4_000_000, apr: 13.5 },
      ],
    });
    expect(advice?.title).toBe("Tu próxima jugada con tus deudas");
    expect(advice?.body).toContain("Préstamo activo");
    expect(advice?.body).not.toContain("Tarjeta pagada");
  });

  it("si TODAS están saldadas, felicita en vez de recomendar atacar", () => {
    const advice = buildDebtAdvice({
      ...base,
      debts: [{ name: "Tarjeta pagada", balance: -500, apr: 45 }],
    });
    expect(advice?.accent).toBe("pos");
    expect(advice?.title).toContain("Sin deudas activas");
  });

  it("entre activas, recomienda la de mayor APR", () => {
    const advice = buildDebtAdvice({
      ...base,
      debts: [
        { name: "Hipoteca", balance: 20_000_000, apr: 10.5 },
        { name: "Vehículo", balance: 4_000_000, apr: 13.5 },
      ],
    });
    expect(advice?.body).toContain("Vehículo");
  });
});

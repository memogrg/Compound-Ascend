/**
 * Gasto esencial mensual (insumo del número de seguridad). Los 4 tests
 * obligatorios: dedup derivadas, dedup prima-vía-ahorro, inversiones nunca,
 * multi-moneda + vacío.
 */
import { describe, it, expect } from "vitest";
import { computeEssentialMonthly } from "@/modules/wealth/engine/essential-expense";

// rates: unidades por USD (como FX_PER_USD). CRC 500/USD para conversiones claras.
const RATES = { USD: 1, CRC: 500 };

describe("computeEssentialMonthly", () => {
  it("#1 deuda esencial + su línea derivada en el frasco Deudas → suma UNA vez", () => {
    const r = computeEssentialMonthly({
      displayCurrency: "CRC",
      rates: RATES,
      // La línea derivada de la deuda (source_kind 'debt') NO debe contar como sobre.
      budgetLines: [
        { amount: 50_000, currency: "CRC", sourceKind: "debt" }, // derivada → excluida
        { amount: 30_000, currency: "CRC", sourceKind: "manual" }, // sobre real → cuenta
      ],
      debts: [{ monthly: 50_000, currency: "CRC" }], // la deuda se cuenta desde sí misma
      goals: [],
      policies: [],
    });
    // 30k (sobre real) + 50k (deuda) = 80k. La línea derivada de 50k NO se sumó.
    expect(r.total).toBe(80_000);
    expect(r.byOrigin.sobres).toBe(30_000);
    expect(r.byOrigin.debts).toBe(50_000);
  });

  it("#2 meta esencial con policy_id a póliza esencial → cuenta el APORTE, no la prima", () => {
    const r = computeEssentialMonthly({
      displayCurrency: "CRC",
      rates: RATES,
      budgetLines: [],
      debts: [],
      goals: [{ monthly: 25_000, currency: "CRC", policyId: "pol-1" }],
      policies: [
        { id: "pol-1", monthly: 25_000, currency: "CRC" }, // financiada por la meta → excluida
        { id: "pol-2", monthly: 10_000, currency: "CRC" }, // independiente → cuenta
      ],
    });
    // aporte 25k + prima pol-2 10k = 35k. La prima de pol-1 NO se sumó.
    expect(r.total).toBe(35_000);
    expect(r.byOrigin.goals).toBe(25_000);
    expect(r.byOrigin.policies).toBe(10_000);
    expect(r.excludedPolicies).toEqual([{ id: "pol-1", monthly: 25_000 }]);
  });

  it("#3 una inversión NUNCA entra al cálculo (no hay input para inversiones)", () => {
    // El engine no acepta inversiones: no hay forma de que sumen. Contrato explícito.
    const r = computeEssentialMonthly({
      displayCurrency: "CRC",
      rates: RATES,
      budgetLines: [{ amount: 40_000, currency: "CRC", sourceKind: "manual" }],
      debts: [],
      goals: [],
      policies: [],
    });
    expect(r.total).toBe(40_000);
    expect(Object.keys(r.byOrigin)).toEqual(["sobres", "debts", "goals", "policies"]); // sin 'investments'
  });

  it("#4 multi-moneda convierte a la de visualización; sin nada marcado → 0", () => {
    const vacio = computeEssentialMonthly({
      displayCurrency: "CRC", rates: RATES,
      budgetLines: [], debts: [], goals: [], policies: [],
    });
    expect(vacio.total).toBe(0);

    const mixed = computeEssentialMonthly({
      displayCurrency: "CRC",
      rates: RATES,
      budgetLines: [{ amount: 100, currency: "USD", sourceKind: "manual" }], // 100 USD → 50.000 CRC
      debts: [{ monthly: 20_000, currency: "CRC" }],
      goals: [],
      policies: [],
    });
    expect(mixed.total).toBe(70_000); // 50.000 + 20.000
  });
});

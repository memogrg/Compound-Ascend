import { describe, it, expect } from "vitest";
import { computeTotalCommitment } from "@/modules/wealth/engine/total-commitment";

const RATES = { USD: 1, CRC: 500 };
const base = { displayCurrency: "USD", rates: RATES };

describe("computeTotalCommitment · TODO compromiso mensual (sin filtro esencial)", () => {
  it("suma sobres propios + metas + DCA + deudas + primas", () => {
    const r = computeTotalCommitment({
      ...base,
      budgetLines: [
        { amount: 300, currency: "USD", sourceKind: "manual" },
        { amount: 100, currency: "USD", sourceKind: "recurring" },
      ],
      goals: [{ monthly: 200, currency: "USD", policyId: null }],
      dca: [{ monthly: 150, currency: "USD" }],
      debts: [{ monthly: 250, currency: "USD" }],
      policies: [{ id: "p1", monthly: 50, currency: "USD" }],
    });
    // 400 sobres + 200 metas + 150 dca + 250 deudas + 50 seguros = 1050.
    expect(r.total).toBe(1050);
    expect(r.byOrigin).toEqual({ sobres: 400, goals: 200, dca: 150, debts: 250, policies: 50 });
  });

  it("dedup #1: los sobres DERIVADOS (debt/goal/policy) NO se cuentan del budget (van por su entidad)", () => {
    const r = computeTotalCommitment({
      ...base,
      budgetLines: [
        { amount: 300, currency: "USD", sourceKind: "manual" },
        { amount: 999, currency: "USD", sourceKind: "goal" }, // derivado → NO cuenta acá
        { amount: 999, currency: "USD", sourceKind: "debt" }, // derivado → NO cuenta acá
      ],
      goals: [{ monthly: 200, currency: "USD", policyId: null }],
      dca: [],
      debts: [{ monthly: 250, currency: "USD" }],
      policies: [],
    });
    expect(r.byOrigin.sobres).toBe(300); // solo el manual
    expect(r.total).toBe(300 + 200 + 250);
  });

  it("dedup #2: prima financiada por una meta (policy_id) se EXCLUYE (se paga vía el aporte)", () => {
    const r = computeTotalCommitment({
      ...base,
      budgetLines: [],
      goals: [{ monthly: 80, currency: "USD", policyId: "pol-1", name: "Ahorro seguro vida" }],
      dca: [],
      debts: [],
      policies: [{ id: "pol-1", monthly: 80, currency: "USD", name: "Vida" }],
    });
    expect(r.byOrigin.policies).toBe(0); // prima excluida
    expect(r.excludedPolicies).toHaveLength(1);
    expect(r.total).toBe(80); // solo el aporte de la meta, no doble
  });

  it("DCA en otra moneda se convierte a la de visualización", () => {
    const r = computeTotalCommitment({
      ...base,
      budgetLines: [],
      goals: [],
      dca: [{ monthly: 50000, currency: "CRC" }], // 50000 CRC / 500 = 100 USD
      debts: [],
      policies: [],
    });
    expect(r.byOrigin.dca).toBe(100);
  });
});

import { describe, it, expect } from "vitest";
import { premiumActionPayload } from "@/modules/wealth/engine/premium-payload";
import { policyPremiumToTxn } from "@/modules/financial-base";

/**
 * Delta 4 · B2 — paridad web = móvil del pago de prima de póliza. El web solo agrega la UI: arma el
 * MISMO payload que el móvil (`premiumActionPayload`) y lo manda a la MISMA action
 * (`payPolicyPremiumAction` → `payPolicyPremium` → `registerLinkedTransaction`). Acá se prueba el
 * helper puro + su paso por `policyPremiumToTxn` (el orquestador compartido, ya cubierto por
 * `moneda-prima-seguro`), para fijar el único invariante que podría regresar en el web: la moneda.
 */
const policyUSD = {
  id: "11111111-1111-4111-8111-111111111111",
  currency: "USD",
  provider: "Promerica",
};

describe("premiumActionPayload · el pago de prima web manda el contrato correcto", () => {
  it("FIJA la moneda de la PÓLIZA (no la de display) y compone el nombre como el móvil", () => {
    const p = premiumActionPayload(policyUSD, {
      amount: 50,
      paymentDate: "2026-08-20",
      label: "Protección médica",
    });
    expect(p).toEqual({
      policyId: "11111111-1111-4111-8111-111111111111",
      amount: 50,
      currency: "USD", // ← moneda de la póliza; el riesgo del web era mandar la de display (CRC)
      paymentDate: "2026-08-20",
      policyName: "Protección médica · Promerica",
    });
  });

  it("sin aseguradora, el nombre es solo la etiqueta", () => {
    const p = premiumActionPayload(
      { id: "p2", currency: "CRC" },
      { amount: 30_000, paymentDate: "2026-08-01", label: "Vida" },
    );
    expect(p.policyName).toBe("Vida");
    expect(p.currency).toBe("CRC");
  });
});

describe("paridad: el payload web produce la MISMA transacción vinculada que el móvil", () => {
  it("póliza en USD → txn vinculada a la póliza, gasto, en USD, sin convertir", () => {
    const p = premiumActionPayload(policyUSD, {
      amount: 50,
      paymentDate: "2026-08-20",
      label: "Protección médica",
    });
    const txn = policyPremiumToTxn({
      policyId: p.policyId,
      policyName: p.policyName,
      currency: p.currency,
      paymentDate: p.paymentDate,
      amount: p.amount!,
      categoryId: "cat-seguros",
    });
    expect(txn.linkedKind).toBe("policy");
    expect(txn.linkedId).toBe("11111111-1111-4111-8111-111111111111");
    expect(txn.kind).toBe("gasto");
    expect(txn.currency).toBe("USD"); // en la moneda de la póliza, sin convertir
    expect(txn.amount).toBe(50);
    expect(txn.description).toBe("Prima — Protección médica · Promerica");
  });
});

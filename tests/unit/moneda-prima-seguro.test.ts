import { describe, it, expect } from "vitest";
import { convertCurrency } from "@/lib/fx";
import { policyPremiumToTxn } from "@/modules/financial-base";
import { monedaDelMovimientoEsCoherente } from "@/modules/wealth/engine/portfolio-engine";

/**
 * El pago de una prima queda en la moneda de la PÓLIZA, no en la de display. El hueco: no
 * existia flujo de pago de prima, asi que ningun test ejercitaba una poliza en moneda ≠
 * principal. Aqui se fija con principal CRC y una poliza en USD.
 */

const PRIMARY = "CRC";
const RATES = { USD: 1, CRC: 510 };

describe("policyPremiumToTxn — la prima va en la moneda de la póliza", () => {
  it("póliza en USD (principal CRC): transacción vinculada en USD, sin convertir", () => {
    const txn = policyPremiumToTxn({
      policyId: "p1",
      policyName: "Protección médica · Promerica",
      currency: "USD",
      paymentDate: "2026-07-01",
      amount: 120,
      categoryId: "cat-seguros",
    });

    expect(txn.linkedKind).toBe("policy");
    expect(txn.linkedId).toBe("p1");
    expect(txn.kind).toBe("gasto");
    expect(txn.currency).toBe("USD");
    expect(txn.amount).toBe(120); // sin convertir a CRC
    // Si se colara la conversión, saldría ~61.200 CRC.
    expect(txn.amount).not.toBeCloseTo(convertCurrency(120, "USD", PRIMARY, RATES), 0);
    expect(txn.description).toBe("Prima — Protección médica · Promerica");
  });
});

describe("guarda de moneda de la póliza (servidor)", () => {
  it("acepta la misma moneda (o sin declarar) y rechaza una que contradiga la póliza", () => {
    expect(monedaDelMovimientoEsCoherente("USD", "USD")).toBe(true);
    expect(monedaDelMovimientoEsCoherente(undefined, "USD")).toBe(true);
    expect(monedaDelMovimientoEsCoherente("CRC", "USD")).toBe(false);
  });
});

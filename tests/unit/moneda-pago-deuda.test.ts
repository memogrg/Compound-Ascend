import { describe, it, expect } from "vitest";
import { cuotaPrecargada, monedaDelPagoEsCoherente } from "@/modules/control/engine/debt-strategy";
import { debtPaymentToTxn } from "@/modules/financial-base/engine/linked";
import { convertCurrency } from "@/lib/fx";

/**
 * Regresión del P0 de moneda: un pago de 2.341 USD se guardó como 1.063.076 USD.
 *
 * La causa fue que el importe y su etiqueta venían de fuentes distintas: el modal
 * precargaba la cuota desde el view-model —que trae los montos YA convertidos a la
 * moneda principal— y el guardado la escribía con la moneda de la deuda. El número
 * convertido con la etiqueta sin convertir: multiplicado por el tipo de cambio.
 *
 * Los 851 tests que había pasaron con este fallo dentro porque NINGUNO ejercitaba una
 * entidad en moneda distinta a la principal. Ese hueco es lo que se tapa aquí.
 */

const PRINCIPAL = "CRC";
const TASAS = { USD: 1, CRC: 510 };

/** La tarjeta real que disparó el incidente. */
const TARJETA_USD = { currentPayment: 2341, minPayment: 2341, currency: "USD" };

describe("precarga de la cuota en el modal de pago", () => {
  it("devuelve el importe en la moneda de la DEUDA, no en la de visualización", () => {
    const { amount, currency } = cuotaPrecargada(TARJETA_USD);
    expect(currency).toBe("USD");
    expect(amount).toBe(2341);
    // El valor que se guardó de verdad. Si alguien vuelve a precargar desde el VM
    // convertido, este número reaparece y el test cae.
    expect(amount).not.toBeCloseTo(convertCurrency(2341, "USD", PRINCIPAL, TASAS), 0);
  });

  it("no arrastra decimales de una conversión", () => {
    // El campo llegó a mostrar `1063076.114747`: seis decimales en un importe de dinero
    // son la huella de que el número salió de una división por el tipo de cambio.
    const convertido = convertCurrency(2341, "USD", PRINCIPAL, TASAS) / 3;
    const { amount } = cuotaPrecargada({ ...TARJETA_USD, currentPayment: convertido });
    expect(String(amount).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(2);
  });

  it("cae a la cuota mínima cuando no hay cuota corriente, sin cambiar de moneda", () => {
    const r = cuotaPrecargada({ currentPayment: 0, minPayment: 180, currency: "USD" });
    expect(r).toEqual({ amount: 180, currency: "USD" });
  });
});

describe("la transacción del pago se etiqueta con la moneda de su importe", () => {
  it("deuda en USD con la app en CRC: importe y moneda salen de la misma fuente", () => {
    const cuota = cuotaPrecargada(TARJETA_USD);
    const txn = debtPaymentToTxn({
      debtId: "d1",
      debtName: "tarjeta",
      currency: cuota.currency,
      paymentDate: "2026-07-20",
      amount: cuota.amount,
      extraAmount: 0,
      categoryId: null,
    });

    expect(txn.currency).toBe("USD");
    expect(txn.amount).toBe(2341);

    // El fallo original, escrito como aserción: un importe de tamaño colones con
    // etiqueta USD. Si vuelve a pasar, esto lo delata.
    const importeCorrupto = convertCurrency(2341, "USD", PRINCIPAL, TASAS);
    expect(txn.amount).toBeLessThan(importeCorrupto);
    expect(importeCorrupto / txn.amount).toBeCloseTo(TASAS.CRC, 0);
  });

  it("deuda en la misma moneda que la app: nada que convertir, nada que romper", () => {
    const cuota = cuotaPrecargada({ currentPayment: 800000, minPayment: 0, currency: "CRC" });
    const txn = debtPaymentToTxn({
      debtId: "d2",
      debtName: "Casa",
      currency: cuota.currency,
      paymentDate: "2026-07-20",
      amount: cuota.amount,
      extraAmount: 0,
      categoryId: null,
    });
    expect(txn.currency).toBe("CRC");
    expect(txn.amount).toBe(800000);
  });
});

/**
 * Segunda vuelta (auditoría de moneda, jul 2026). El P0 se corrigió en la LISTA de deudas
 * y se quedó vivo en otros dos sitios durante meses:
 *
 *  · el pago desde el móvil (`m/(app)/deudas/debt-manager.tsx`), que precargaba
 *    `reporting.monthlyPayment` — un valor del view-model, ya convertido a la moneda de
 *    visualización — y lo etiquetaba con esa misma moneda de display;
 *  · el detalle web (`control/components/debt-detail.tsx`), donde TODO el `input` de
 *    amortización se construye con `conv(...)`, así que la cuota, la tabla y el preset del
 *    botón "Pagar" venían en display mientras `editing.amount` venía del ledger en moneda
 *    nativa. El mismo campo se precargaba desde DOS unidades distintas según el camino.
 *
 * Los tests de arriba pasaban porque ejercitan `cuotaPrecargada`, y esos dos sitios no la
 * llamaban. Por eso lo que se prueba aquí es la GUARDA: es lo que convierte una recaída en
 * un error visible en vez de un dato corrupto silencioso.
 */
describe("guarda: el importe de un pago viene en la moneda de la deuda", () => {
  it("rechaza un importe etiquetado en la moneda de visualización", () => {
    // Exactamente el escenario del incidente: app en CRC, deuda en USD.
    expect(monedaDelPagoEsCoherente(PRINCIPAL, "USD")).toBe(false);
  });

  it("acepta el importe cuando viene en la moneda de la deuda", () => {
    expect(monedaDelPagoEsCoherente("USD", "USD")).toBe(true);
  });

  it("deja pasar a quien no manda moneda, que es el estado heredado", () => {
    // No es un permiso: es la razón por la que la guarda era INERTE. Mientras los
    // formularios no la manden, esto no protege de nada — por eso el arreglo real fue
    // que la manden, no solo que exista la comprobación.
    expect(monedaDelPagoEsCoherente(undefined, "USD")).toBe(true);
  });

  it("el importe nativo y el convertido difieren por el tipo de cambio", () => {
    // Ancla numérica del incidente: si alguien vuelve a precargar desde un VM convertido,
    // el número que entra es este, y es ~510 veces el correcto.
    const { amount, currency } = cuotaPrecargada(TARJETA_USD);
    const siSePrecargaraDelVM = convertCurrency(amount, currency, PRINCIPAL, TASAS);
    expect(siSePrecargaraDelVM / amount).toBeCloseTo(TASAS.CRC, 0);
    expect(monedaDelPagoEsCoherente(currency, TARJETA_USD.currency)).toBe(true);
  });
});

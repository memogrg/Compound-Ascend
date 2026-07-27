import { describe, it, expect } from "vitest";
import { montoFilaDeuda } from "@/modules/control/engine/debt-strategy";
import { convertCurrency } from "@/lib/fx";

/**
 * La fila de una deuda se muestra en la moneda de la ENTIDAD; el TOTAL se convierte a la
 * de display para poder sumar monedas distintas.
 *
 * Hallazgo de device (27 jul): una tarjeta en USD (~$40.000) aparecía en la lista como
 * ₡18,2 M — el saldo convertido a la moneda de display. El reverso de la auditoría de
 * captura: ya capturamos en la moneda de la entidad; la visualización también debe hacerlo.
 *
 * Igual que moneda-pago-deuda: el hueco es que ningún test ejercitaba una deuda en moneda
 * distinta a la principal. Eso es lo que se fija aquí.
 */

const DISPLAY = "CRC";
const TASAS = { USD: 1, CRC: 510 };
const conv = (n: number, from: string) => convertCurrency(n, from, DISPLAY, TASAS);

describe("montoFilaDeuda — la fila usa la moneda de la deuda", () => {
  it("deuda en otra moneda → importe NATIVO con su código, no el convertido", () => {
    const convertidoCRC = conv(40000, "USD"); // ~₡20,4 M, el número del bug
    const fila = montoFilaDeuda({ amount: 40000, currency: "USD" }, convertidoCRC, DISPLAY);

    expect(fila).toEqual({ amount: 40000, currency: "USD" });
    // Si alguien vuelve a mostrar el saldo convertido, este valor reaparece y el test cae.
    expect(fila.amount).not.toBeCloseTo(convertidoCRC, 0);
    expect(fila.currency).not.toBe(DISPLAY);
  });

  it("deuda en la moneda de display → el convertido (idéntico), en la de display", () => {
    const fila = montoFilaDeuda({ amount: 4_540_188, currency: "CRC" }, 4_540_188, DISPLAY);
    expect(fila).toEqual({ amount: 4_540_188, currency: "CRC" });
  });

  it("sin dato crudo → cae al convertido en la de display", () => {
    const fila = montoFilaDeuda(undefined, 1_000_000, DISPLAY);
    expect(fila).toEqual({ amount: 1_000_000, currency: "CRC" });
  });
});

describe("total de deudas — sigue convertido a la moneda de display", () => {
  it("las filas van nativas pero el total suma los saldos CONVERTIDOS", () => {
    const deudas = [
      { balance: 40000, currency: "USD" }, // ~₡20,4 M convertida
      { balance: 4_540_188, currency: "CRC" },
    ];

    // Cada fila, en su moneda.
    const filas = deudas.map((d) =>
      montoFilaDeuda({ amount: d.balance, currency: d.currency }, conv(d.balance, d.currency), DISPLAY),
    );
    expect(filas[0]).toEqual({ amount: 40000, currency: "USD" });
    expect(filas[1]!.currency).toBe("CRC");

    // El total: suma de CONVERTIDOS, en la de display.
    const total = deudas.reduce((s, d) => s + conv(d.balance, d.currency), 0);
    // Sumar los nativos sin convertir (mezclar monedas) sería el bug; el total convertido
    // es mayor porque los USD suben al pasar a CRC.
    const mezclaSinConvertir = deudas.reduce((s, d) => s + d.balance, 0);
    expect(total).toBeGreaterThan(mezclaSinConvertir);
    expect(total).toBeCloseTo(conv(40000, "USD") + 4_540_188, 0);
  });
});

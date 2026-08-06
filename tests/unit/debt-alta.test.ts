/**
 * Monto original al dar de alta una deuda.
 *
 * El saldo de una deuda se deriva de sus pagos, y ese replay arranca de `originalAmount ??
 * balance`. Sin monto original, el ancla es el saldo GUARDADO — que se mueve al editar la deuda o
 * al abonar en modo 'cuota' — y al moverse, los pagos anteriores se descuentan otra vez sobre el
 * saldo nuevo. Anotar el original al alta fija un ancla que ya no se mueve.
 */
import { describe, it, expect } from "vitest";
import { montoOriginalAlAlta } from "@/modules/control/engine/debt-alta";
import { recomputeFromPayments } from "@/modules/control/engine/amortization";

describe("montoOriginalAlAlta", () => {
  /** En el alta no hay ningún pago todavía, así que saldo actual y original son el mismo número. */
  it("sin monto original explícito, usa el saldo del alta", () => {
    expect(montoOriginalAlAlta({ balance: 1_000_000 })).toBe(1_000_000);
    expect(montoOriginalAlAlta({ balance: 1_000_000, originalAmount: undefined })).toBe(1_000_000);
  });

  /** Quien lo escribe sabe de qué monto arrancó la deuda, que puede ser muy anterior al alta. */
  it("un original explícito manda sobre el saldo", () => {
    expect(montoOriginalAlAlta({ balance: 600_000, originalAmount: 1_200_000 })).toBe(1_200_000);
  });

  it("un cero no cuenta como original explícito", () => {
    expect(montoOriginalAlAlta({ balance: 800_000, originalAmount: 0 })).toBe(800_000);
  });

  it("una deuda en cero no rompe", () => {
    expect(montoOriginalAlAlta({ balance: 0 })).toBe(0);
  });
});

describe("por qué importa el ancla", () => {
  const pago = (paymentDate: string, amount: number) => ({
    paymentDate,
    amount,
    extraAmount: 0,
    kind: "ordinario" as const,
  });
  const base = {
    apr: 24,
    termMonths: 24,
    monthlyPayment: 60_000,
    insurance: 0,
    extraMonthly: 0,
    startDate: "2026-01-01",
  };

  /**
   * El caso que esto arregla. Dos pagos hechos, y después el saldo GUARDADO se mueve (una edición
   * manual, o un abono en modo 'cuota'). Sin ancla, el replay arranca de ese saldo nuevo y vuelve
   * a descontar los dos pagos: el resultado queda por debajo de la realidad.
   */
  it("sin monto original, mover el saldo guardado hace que los pagos se descuenten dos veces", () => {
    const pagos = [pago("2026-02-01", 60_000), pago("2026-03-01", 60_000)];

    // Ancla intacta: el saldo guardado sigue siendo el del alta.
    const sano = recomputeFromPayments(
      { ...base, balance: 1_000_000, originalAmount: null },
      pagos,
    ).currentBalance;

    // El saldo guardado se movió a lo que ya era el saldo real; los mismos pagos se re-aplican.
    const doblemente = recomputeFromPayments(
      { ...base, balance: sano, originalAmount: null },
      pagos,
    ).currentBalance;

    expect(doblemente).toBeLessThan(sano);
  });

  it("con monto original, el saldo guardado deja de importar y el replay da siempre lo mismo", () => {
    const pagos = [pago("2026-02-01", 60_000), pago("2026-03-01", 60_000)];
    const conAncla = (balanceGuardado: number) =>
      recomputeFromPayments(
        { ...base, balance: balanceGuardado, originalAmount: 1_000_000 },
        pagos,
      ).currentBalance;

    // El mismo resultado sin importar cómo se haya movido el saldo guardado.
    expect(conAncla(1_000_000)).toBe(conAncla(920_000));
    expect(conAncla(1_000_000)).toBe(conAncla(500_000));
  });

  /**
   * Efecto colateral visible: la barra de progreso de la lista deja de estar clavada en cero.
   *
   * `recomputeFromPayments` mide el progreso contra `originalAmount ?? balance`, así que al alta
   * da lo mismo tenerlo o no. La diferencia está en la VISTA, que usa su propia fórmula y
   * devuelve 0 cuando no hay original — por eso la barra no se movía nunca.
   */
  it("la fórmula de la barra necesita el original para no dar siempre cero", () => {
    // La misma expresión que usa `debtSummary` en debts-view.
    const progresoVista = (originalAmount: number | null, balance: number) =>
      originalAmount && originalAmount > 0
        ? Math.min(1, Math.max(0, (originalAmount - balance) / originalAmount))
        : 0;

    const pagos = [pago("2026-02-01", 60_000)];
    const saldo = recomputeFromPayments(
      { ...base, balance: 1_000_000, originalAmount: 1_000_000 },
      pagos,
    ).currentBalance;

    expect(progresoVista(null, saldo)).toBe(0);
    expect(progresoVista(1_000_000, saldo)).toBeGreaterThan(0);
  });
});

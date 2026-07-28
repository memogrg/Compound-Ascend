import { describe, it, expect } from "vitest";
import {
  computeLiquidityBalance,
  liquidityDelta,
  periodNetChange,
  type LiquidityRow,
} from "@/modules/financial-base/engine/liquidity";

const row = (delta: number, reason: string, occurredOn: string): LiquidityRow => ({
  delta,
  reason,
  occurredOn,
});

describe("computeLiquidityBalance", () => {
  it("ledger vacío → 0", () => {
    expect(computeLiquidityBalance([])).toBe(0);
  });

  it("solo apertura → apertura", () => {
    expect(computeLiquidityBalance([row(1000, "apertura", "2026-06-01")])).toBe(1000);
  });

  it("apertura + ingresos − gastos + ajuste", () => {
    const rows = [
      row(1000, "apertura", "2026-06-01"),
      row(500, "transaccion", "2026-06-05"), // ingreso
      row(-200, "transaccion", "2026-06-10"), // gasto
      row(-50, "transaccion", "2026-06-12"), // gasto
      row(25, "ajuste", "2026-06-20"), // reconciliación
    ];
    expect(computeLiquidityBalance(rows)).toBe(1275);
  });

  it("redondea a 2 decimales", () => {
    expect(computeLiquidityBalance([row(0.1, "transaccion", "2026-06-01"), row(0.2, "transaccion", "2026-06-02")])).toBe(0.3);
  });
});

describe("liquidityDelta · tabla de verdad del cash", () => {
  const AMT = 200;

  // Cada fila: [descripción, kind, countsInBudget, delta esperado].
  const cases: Array<[string, string, boolean | undefined, number]> = [
    ["Ingreso / salario", "ingreso", undefined, +AMT],
    ["Gasto normal", "gasto", true, -AMT],
    // El pago de deuda entra como gasto (−); su delta lo escribe la RPC atómica,
    // que replica ESTA misma regla en SQL.
    ["Pago de deuda", "gasto", true, -AMT],
    ["Aporte a meta", "gasto", true, -AMT],
    ["Retiro de meta", "ingreso", undefined, +AMT],
    // El caso que corregimos: consumir un frasco de meta (gasto OFF-BUDGET) es
    // NEUTRO — el cash ya salió al aportar; restar otra vez lo descuadraría.
    ["Consumo de frasco de meta (off-budget)", "gasto", false, 0],
    ["Compra / aporte de inversión", "gasto", true, -AMT],
    ["Venta / retiro parcial de inversión", "ingreso", undefined, +AMT],
    ["Prima de seguro", "gasto", true, -AMT],
    ["Dividendo / renta", "ingreso", undefined, +AMT],
    ["Transferencia entre cuentas", "transferencia", undefined, 0],
    ["Ajuste / reconciliación", "ajuste", undefined, 0],
  ];

  it.each(cases)("%s → %s liquidez", (_desc, kind, countsInBudget, expected) => {
    expect(liquidityDelta({ kind, amount: AMT, countsInBudget })).toBe(expected);
  });

  it("un gasto on-budget SÍ resta aunque countsInBudget sea undefined", () => {
    expect(liquidityDelta({ kind: "gasto", amount: AMT })).toBe(-AMT);
  });

  it("solo countsInBudget===false neutraliza (true/undefined restan)", () => {
    expect(liquidityDelta({ kind: "gasto", amount: AMT, countsInBudget: true })).toBe(-AMT);
    expect(liquidityDelta({ kind: "gasto", amount: AMT, countsInBudget: undefined })).toBe(-AMT);
    expect(liquidityDelta({ kind: "gasto", amount: AMT, countsInBudget: false })).toBe(0);
  });

  it("countsInBudget=false en un INGRESO no cambia nada (sigue sumando)", () => {
    // La neutralización off-budget es solo para gastos; un ingreso siempre suma.
    expect(liquidityDelta({ kind: "ingreso", amount: AMT, countsInBudget: false })).toBe(+AMT);
  });

  it("redondea a 2 decimales", () => {
    expect(liquidityDelta({ kind: "gasto", amount: 0.1 + 0.2 })).toBe(-0.3);
  });
});

describe("periodNetChange", () => {
  const rows = [
    row(1000, "apertura", "2026-05-01"),
    row(300, "transaccion", "2026-06-05"), // junio
    row(-100, "transaccion", "2026-06-15"), // junio
    row(80, "transaccion", "2026-07-02"), // julio
  ];

  it("suma solo los deltas del mes dado", () => {
    expect(periodNetChange(rows, { year: 2026, month: 6 })).toBe(200);
  });

  it("mes sin movimientos → 0", () => {
    expect(periodNetChange(rows, { year: 2026, month: 8 })).toBe(0);
  });
});

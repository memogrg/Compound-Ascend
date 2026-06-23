import { describe, it, expect } from "vitest";
import {
  computeLiquidityBalance,
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

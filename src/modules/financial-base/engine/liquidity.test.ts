import { describe, it, expect } from "vitest";
import {
  computeLiquidityBalance,
  liquidityDelta,
  periodNetChange,
  sumClosingBalance,
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
    expect(
      computeLiquidityBalance([
        row(0.1, "transaccion", "2026-06-01"),
        row(0.2, "transaccion", "2026-06-02"),
      ]),
    ).toBe(0.3);
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

describe("sumClosingBalance · liquidez al cierre (base apertura + multi-moneda)", () => {
  // rates "por USD": convertCurrency(amount, from, to) = amount / rates[from] * rates[to].
  const rates = { USD: 1, CRC: 520 };
  const r = (delta: number | string, currency: string, reason: string, occurredOn: string) => ({
    delta,
    currency,
    reason,
    occurredOn,
  });

  it("normaliza distinta moneda a la moneda de display (USD)", () => {
    const rows = [
      r(100, "USD", "transaccion", "2026-06-10"), // 100 USD
      r(52000, "CRC", "transaccion", "2026-06-20"), // 52000/520 = 100 USD
    ];
    expect(sumClosingBalance(rows, "2026-06-30", "USD", rates)).toBe(200);
  });

  it("normaliza a la moneda de display (CRC)", () => {
    const rows = [
      r(100, "USD", "transaccion", "2026-06-10"), // 100*520 = 52000 CRC
      r(52000, "CRC", "transaccion", "2026-06-20"), // 52000 CRC
    ];
    expect(sumClosingBalance(rows, "2026-06-30", "CRC", rates)).toBe(104000);
  });

  it("la APERTURA es la base: cuenta aunque su fecha sea POSTERIOR al cierre del periodo", () => {
    // Apertura fijada HOY (28-jul) pero cerramos JUNIO: la base igual entra; el gasto
    // de julio queda fuera del cierre de junio.
    const rows = [
      r(1000, "USD", "apertura", "2026-07-28"), // fechada después → SIEMPRE base
      r(-200, "USD", "transaccion", "2026-06-15"), // gasto de junio
      r(-50, "USD", "transaccion", "2026-07-05"), // gasto de JULIO → fuera de junio
    ];
    expect(sumClosingBalance(rows, "2026-06-30", "USD", rates)).toBe(800); // 1000 − 200
  });

  it("transaccion/ajuste posteriores al cierre se excluyen (sólo la apertura ignora la fecha)", () => {
    const rows = [
      r(500, "USD", "transaccion", "2026-06-10"),
      r(300, "USD", "ajuste", "2026-07-01"), // ajuste de julio → fuera del cierre de junio
    ];
    expect(sumClosingBalance(rows, "2026-06-30", "USD", rates)).toBe(500);
  });

  it("mes en curso (todo ocurrió en/antes del cierre) → suma total (= getLiquidityBalance)", () => {
    // period.to = fin del mes actual; apertura + todos los movimientos caen dentro.
    const rows = [
      r(1000, "USD", "apertura", "2026-07-02"),
      r(500, "USD", "transaccion", "2026-07-10"),
      r(-300, "USD", "transaccion", "2026-07-15"),
    ];
    expect(sumClosingBalance(rows, "2026-07-31", "USD", rates)).toBe(1200);
  });

  it("misma moneda → suma directa; acepta delta string; redondea a 2 decimales", () => {
    const rows = [
      r("0.1", "USD", "transaccion", "2026-06-01"),
      r(0.2, "USD", "transaccion", "2026-06-02"),
      r(-0.3, "USD", "transaccion", "2026-06-03"),
    ];
    expect(sumClosingBalance(rows, "2026-06-30", "USD", rates)).toBe(0);
  });

  it("ledger vacío → 0", () => {
    expect(sumClosingBalance([], "2026-06-30", "USD", rates)).toBe(0);
  });
});

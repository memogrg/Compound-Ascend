import { describe, expect, it } from "vitest";

import {
  buildAhorrosVsMes,
  buildDeudasVsMes,
  buildInversionesVsMes,
  buildPatrimonioVsMes,
} from "@/modules/dashboard/engine/vs-mes";

/**
 * Derivación del "vs mes anterior" por dominio (capa pura). Verifica el SIGNO, el color por
 * dominio (Deudas invertido), la normalización de moneda en Ahorros y la degradación de
 * Inversiones con serie corta. No toca cálculos base; sólo el delta + su presentación.
 */

const idc = (a: number) => a; // una sola moneda: identidad
const fx = (a: number, from: string) => (from === "USD" ? a * 500 : a); // USD→CRC ×500

describe("buildPatrimonioVsMes", () => {
  it("subió → % up/verde; deltaPct = velocity / previo", () => {
    // netWorth 1100, velocity 100 → previo 1000 → +10%
    expect(buildPatrimonioVsMes({ netWorth: 1100, wealthVelocity: 100 })).toEqual({
      format: "percent",
      value: 0.1,
      dir: "up",
      tone: "pos",
      label: "vs mes ant.",
    });
  });
  it("bajó → down/rojo", () => {
    const vs = buildPatrimonioVsMes({ netWorth: 900, wealthVelocity: -100 }); // previo 1000
    expect(vs).toMatchObject({ value: 0.1, dir: "down", tone: "neg" });
  });
  it("sin histórico (velocity null) → null", () => {
    expect(buildPatrimonioVsMes({ netWorth: 1000, wealthVelocity: null })).toBeNull();
  });
  it("previo ≤ 0 → null (sin base con sentido)", () => {
    expect(buildPatrimonioVsMes({ netWorth: 100, wealthVelocity: 200 })).toBeNull(); // previo -100
  });
});

describe("buildInversionesVsMes", () => {
  const snapshots = [
    { date: "2026-06-30", portfolioValue: 800 },
    { date: "2026-07-31", portfolioValue: 1000 }, // cierre del mes anterior
    { date: "2026-08-02", portfolioValue: 5000 }, // dentro del mes en curso: se ignora
  ];
  it("compara contra el último snapshot ≤ fin del mes anterior; +% up/verde", () => {
    expect(
      buildInversionesVsMes({ currentValue: 1100, snapshots, prevMonthEnd: "2026-07-31" }),
    ).toEqual({ format: "percent", value: 0.1, dir: "up", tone: "pos", label: "vs mes ant." });
  });
  it("bajó → down/rojo", () => {
    expect(
      buildInversionesVsMes({ currentValue: 900, snapshots, prevMonthEnd: "2026-07-31" }),
    ).toMatchObject({ dir: "down", tone: "neg" });
  });
  it("serie sin punto ≤ fin del mes anterior (cuenta nueva) → null (degrada, sin chip)", () => {
    expect(
      buildInversionesVsMes({
        currentValue: 1300,
        snapshots: [{ date: "2026-08-02", portfolioValue: 5000 }],
        prevMonthEnd: "2026-07-31",
      }),
    ).toBeNull();
  });
  it("serie vacía → null", () => {
    expect(buildInversionesVsMes({ currentValue: 1300, snapshots: [], prevMonthEnd: "2026-07-31" })).toBeNull();
  });
});

describe("buildAhorrosVsMes", () => {
  it("aporté (gasto en presupuesto) → up/verde 'aportaste'", () => {
    expect(
      buildAhorrosVsMes([{ kind: "gasto", amount: 100, currency: "CRC", countsInBudget: true }], idc),
    ).toMatchObject({ format: "amount", value: 100, dir: "up", tone: "pos", label: "aportaste" });
  });
  it("retiré (ingreso) → down/rojo 'retiraste'", () => {
    expect(
      buildAhorrosVsMes([{ kind: "ingreso", amount: 80, currency: "CRC", countsInBudget: true }], idc),
    ).toMatchObject({ value: 80, dir: "down", tone: "neg", label: "retiraste" });
  });
  it("gasto fuera de presupuesto = consumo (−)", () => {
    expect(
      buildAhorrosVsMes([{ kind: "gasto", amount: 50, currency: "CRC", countsInBudget: false }], idc)?.dir,
    ).toBe("down");
  });
  it("multi-moneda: normaliza cada movimiento antes de netear", () => {
    // +100 USD (→50 000 CRC) aporte, −100 CRC retiro → net +49 900
    expect(
      buildAhorrosVsMes(
        [
          { kind: "gasto", amount: 100, currency: "USD", countsInBudget: true },
          { kind: "ingreso", amount: 100, currency: "CRC", countsInBudget: true },
        ],
        fx,
      ),
    ).toMatchObject({ value: 49900, dir: "up", tone: "pos" });
  });
  it("sin movimientos → null (sin chip)", () => {
    expect(buildAhorrosVsMes([], idc)).toBeNull();
  });
});

describe("buildDeudasVsMes · color INVERTIDO (bajar deuda = verde)", () => {
  const period = { from: "2026-08-01", to: "2026-08-31" };
  it("pagué (sin altas) → deuda bajó → down/VERDE 'pagaste'", () => {
    expect(
      buildDeudasVsMes({
        payments: [{ kind: "gasto", amount: 200, currency: "CRC" }],
        debts: [],
        ...period,
        convert: idc,
      }),
    ).toMatchObject({ format: "amount", value: 200, dir: "down", tone: "pos", label: "pagaste" });
  });
  it("alta del periodo > pagos → subió → up/ROJO 'adquiriste'", () => {
    // adquirido 300 − pagado 50 = +250
    expect(
      buildDeudasVsMes({
        payments: [{ kind: "gasto", amount: 50, currency: "CRC" }],
        debts: [{ balance: 300, originalAmount: null, currency: "CRC", createdOn: "2026-08-10T09:00:00Z" }],
        ...period,
        convert: idc,
      }),
    ).toMatchObject({ value: 250, dir: "up", tone: "neg", label: "adquiriste" });
  });
  it("alta FUERA del periodo no cuenta (solo el pago)", () => {
    expect(
      buildDeudasVsMes({
        payments: [{ kind: "gasto", amount: 100, currency: "CRC" }],
        debts: [{ balance: 999, originalAmount: null, currency: "CRC", createdOn: "2026-07-15T00:00:00Z" }],
        ...period,
        convert: idc,
      }),
    ).toMatchObject({ value: 100, dir: "down", tone: "pos" });
  });
  it("usa originalAmount (monto adquirido) si existe, no el saldo actual", () => {
    expect(
      buildDeudasVsMes({
        payments: [],
        debts: [{ balance: 100, originalAmount: 500, currency: "CRC", createdOn: "2026-08-05" }],
        ...period,
        convert: idc,
      })?.value,
    ).toBe(500);
  });
  it("altas en USD normalizadas antes de netear", () => {
    // alta 100 USD → 50 000 CRC, sin pagos → +50 000 (up/rojo)
    expect(
      buildDeudasVsMes({
        payments: [],
        debts: [{ balance: 100, originalAmount: null, currency: "USD", createdOn: "2026-08-05" }],
        ...period,
        convert: fx,
      }),
    ).toMatchObject({ value: 50000, dir: "up", tone: "neg" });
  });
  it("sin pagos ni altas → null", () => {
    expect(buildDeudasVsMes({ payments: [], debts: [], ...period, convert: idc })).toBeNull();
  });
});

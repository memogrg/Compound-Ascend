import { describe, it, expect } from "vitest";
import { resolveInvestmentValue } from "@/modules/rich-life/services/rich-life-service";
import { convertCurrency } from "@/lib/fx";
import {
  computePatrimonio,
  type PatrimonioInput,
  type AssetClassKey,
} from "@/modules/wealth/engine/patrimonio-engine";

const rates = { USD: 1, CRC: 455 };

describe("resolveInvestmentValue · Bug A (sin broadcast de _standalone)", () => {
  const market = { abc: 1000, _standalone: 45_000_000 };

  it("dos inversiones sin match por id NO reciben el valor _standalone (no se duplica)", () => {
    const a = resolveInvestmentValue(
      { id: "x1", investedAmount: 150, currency: "CRC" },
      market,
      "CRC",
    );
    const b = resolveInvestmentValue(
      { id: "x2", investedAmount: 70, currency: "CRC" },
      market,
      "CRC",
    );
    expect(a.value).toBe(150);
    expect(b.value).toBe(70);
    expect(a.value).not.toBe(45_000_000);
    expect(b.value).not.toBe(45_000_000);
  });

  it("una inversión con match por id usa su valor de mercado (no el invested_amount)", () => {
    expect(
      resolveInvestmentValue({ id: "abc", investedAmount: 999, currency: "CRC" }, market, "CRC")
        .value,
    ).toBe(1000);
  });

  it("delta 3b: el fallback etiqueta la moneda NATIVA; con market value, la principal", () => {
    // Sin match por id (fallback = invested_amount) → su moneda nativa (USD), no la de display.
    expect(
      resolveInvestmentValue({ id: "x", investedAmount: 10, currency: "USD" }, market, "CRC")
        .currency,
    ).toBe("USD");
    // Con match por id (market value ya normalizado a la principal) → la principal.
    expect(
      resolveInvestmentValue({ id: "abc", investedAmount: 10, currency: "USD" }, market, "CRC")
        .currency,
    ).toBe("CRC");
  });
});

describe("invariancia de moneda · netWorth y añosDeLibertad", () => {
  // Datos con su moneda REAL. Principal = CRC; market values en principal.
  const PRIMARY = "CRC";
  const market = { _standalone: 45_000_000 }; // holding suelto, en principal (CRC)
  type A = { cls: AssetClassKey; value: number; ccy: string };

  // Inversiones (sin match → invested_amount en su moneda NATIVA vía el helper).
  const inv1 = resolveInvestmentValue(
    { id: "i1", investedAmount: 150_000, currency: PRIMARY },
    market,
    PRIMARY,
  );
  const inv2 = resolveInvestmentValue(
    { id: "i2", investedAmount: 70_000, currency: PRIMARY },
    market,
    PRIMARY,
  );
  // Delta 3b: una inversión en USD (fallback) → tageada USD, valor crudo 1000; el motor la convierte
  // (su correcta conversión se valida por la invariancia de netWorth/añosDeLibertad abajo).
  const inv3 = resolveInvestmentValue(
    { id: "i3", investedAmount: 1_000, currency: "USD" },
    market,
    PRIMARY,
  );

  const assets: A[] = [
    { cls: "inversion", value: 238_000, ccy: "USD" }, // activo de inversión explícito en USD
    { cls: "inversion", value: inv1.value, ccy: inv1.currency },
    { cls: "inversion", value: inv2.value, ccy: inv2.currency },
    { cls: "inversion", value: inv3.value, ccy: inv3.currency }, // USD → convertida por el motor
    { cls: "inversion", value: market._standalone, ccy: PRIMARY }, // standalone contado UNA vez
    { cls: "liquido", value: 35_800_000, ccy: "CRC" },
    { cls: "uso_personal", value: 70_000, ccy: "USD" },
  ];
  // Pasivos en monedas MIXTAS (deudas etiquetadas con su moneda real, Bug C).
  const liabs: { balance: number; ccy: string }[] = [
    { balance: 14_000_000, ccy: "CRC" }, // préstamo en CRC
    { balance: 50_000_000, ccy: "CRC" }, // hipoteca en CRC
    { balance: 40_000, ccy: "USD" }, // tarjeta en USD
  ];
  const trueMonthlyExpenseCRC = 2_575_128;

  const reportFor = (display: string) => {
    const norm = (v: number, ccy: string) => convertCurrency(v, ccy, display, rates);
    const assetsByClass: Record<AssetClassKey, number> = {
      liquido: 0,
      inversion: 0,
      productivo: 0,
      uso_personal: 0,
      especial: 0,
    };
    for (const a of assets)
      assetsByClass[a.cls] = (assetsByClass[a.cls] ?? 0) + norm(a.value, a.ccy);
    const input: PatrimonioInput = {
      assetsByClass,
      totalLiabilities: liabs.reduce((s, l) => s + norm(l.balance, l.ccy), 0),
      protectedCoverage: 0,
      protectionScore: 0,
      monthlyExpenses: norm(trueMonthlyExpenseCRC, "CRC"),
      passiveIncomeMonthly: 0,
      netMonthlyIncome: 0,
      monthlyInvested: 0,
      badDebtMonthlyPayment: 0,
      diversification: "media",
      topConcentration: 0,
      currency: display,
    };
    return computePatrimonio(input);
  };

  it("añosDeLibertad es idéntico con display CRC y USD", () => {
    const crc = reportFor("CRC");
    const usd = reportFor("USD");
    expect(usd.añosDeLibertad).toBeCloseTo(crc.añosDeLibertad, 2);
    // y es un valor sano (dígito único), no inflado.
    expect(crc.añosDeLibertad).toBeGreaterThan(1);
    expect(crc.añosDeLibertad).toBeLessThan(20);
  });

  it("netWorth equivale al tipo de cambio entre display", () => {
    const crc = reportFor("CRC");
    const usd = reportFor("USD");
    // CRC = USD * (rateCRC/rateUSD), salvo redondeo (round2 + FX).
    const expected = usd.netWorth * (rates.CRC / rates.USD);
    expect(Math.abs(crc.netWorth - expected) / crc.netWorth).toBeLessThan(1e-6);
  });
});

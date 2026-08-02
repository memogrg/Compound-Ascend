/**
 * De qué tabla sale la tendencia de `consultar_historial` (history-query-service).
 *
 * El bug que cierra: "¿cómo cambió mi patrimonio?" respondía con `portfolio_snapshots`
 * —el valor de las INVERSIONES—. Ahora manda `net_worth_snapshots` (patrimonio neto
 * real), con fallback a la fuente vieja mientras esa serie no dé una tendencia.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/fx", () => ({
  convertCurrency: (n: number) => n,
  SUPPORTED_CURRENCIES: ["USD", "CRC", "EUR", "MXN", "COP", "GBP", "BTC"],
  isCryptoCurrency: (c: string) => c === "BTC",
  currencyDecimals: (c: string) => (c === "BTC" ? 8 : 0),
}));

type NwPoint = { period: string; netWorth: number; totalAssets: number; totalLiabilities: number; currency: string | null };
type PfPoint = { id: string; date: string; portfolioValue: number; investmentValue: number; netWorth: number; currency: string };

let netWorthSerie: NwPoint[] = [];
let portfolioSerie: PfPoint[] = [];

vi.mock("@/modules/rich-life/services/net-worth-snapshot-service", () => ({
  getNetWorthHistory: vi.fn(async () => netWorthSerie),
}));
vi.mock("@/modules/wealth/services/snapshot-service", () => ({
  getSnapshotHistory: vi.fn(async () => portfolioSerie),
}));
vi.mock("@/modules/financial-base/services/snapshot-service", () => ({
  getSnapshotHistory: vi.fn(async () => []),
}));

import { consultarHistorial } from "@/lib/ai/history-query-service";

const nw = (period: string, netWorth: number, currency: string | null = "CRC"): NwPoint => ({
  period,
  netWorth,
  totalAssets: netWorth,
  totalLiabilities: 0,
  currency,
});

const pf = (date: string, portfolioValue: number, netWorth: number): PfPoint => ({
  id: date,
  date,
  portfolioValue,
  investmentValue: portfolioValue,
  netWorth,
  currency: "USD",
});

beforeEach(() => {
  netWorthSerie = [];
  portfolioSerie = [];
});

describe("consultar_historial · métrica patrimonio", () => {
  it("con historial propio usa net_worth_snapshots, NO el valor del portafolio", async () => {
    netWorthSerie = [nw("2026-06-01", 4_000_000), nw("2026-07-01", 4_500_000)];
    portfolioSerie = [pf("2026-06-30", 1_000, 999), pf("2026-07-31", 2_000, 999)];

    const r = await consultarHistorial({ metrica: "patrimonio" }, "CRC");

    expect(r.serie.map((p) => p.valor)).toEqual([4_000_000, 4_500_000]);
    expect(r.moneda).toBe("CRC");
    expect(r.variacion?.delta).toBe(500_000);
    expect(r.variacion?.direccion).toBe("sube");
  });

  it("sin historial de patrimonio cae a portfolio_snapshots (y a SU moneda)", async () => {
    netWorthSerie = [];
    portfolioSerie = [pf("2026-06-30", 1_000, 30_000), pf("2026-07-31", 2_000, 33_000)];

    const r = await consultarHistorial({ metrica: "patrimonio" }, "CRC");

    expect(r.serie.map((p) => p.valor)).toEqual([30_000, 33_000]); // net_worth del snapshot
    expect(r.moneda).toBe("USD");
    expect(r.insuficiente).toBeNull();
  });

  it("con un solo mes propio pero varios de portafolio, gana la serie que sí da tendencia", async () => {
    netWorthSerie = [nw("2026-07-01", 4_500_000)];
    portfolioSerie = [pf("2026-05-31", 900, 28_000), pf("2026-06-30", 1_000, 30_000), pf("2026-07-31", 2_000, 33_000)];

    const r = await consultarHistorial({ metrica: "patrimonio" }, "CRC");

    expect(r.serie).toHaveLength(3);
    expect(r.moneda).toBe("USD");
  });

  it("un solo mes propio y nada de portafolio → se queda en el propio y lo dice", async () => {
    netWorthSerie = [nw("2026-07-01", 4_500_000)];

    const r = await consultarHistorial({ metrica: "patrimonio" }, "CRC");

    expect(r.insuficiente).toBe("un_solo_punto");
    expect(r.serie[0]!.valor).toBe(4_500_000);
  });

  it("sin ninguna de las dos fuentes responde honesto, no inventa", async () => {
    const r = await consultarHistorial({ metrica: "patrimonio" }, "CRC");
    expect(r.insuficiente).toBe("sin_datos");
    expect(r.resumen_md).toContain("Todavía no tengo historial");
  });

  it("nunca mezcla fuentes: o todo net_worth o todo portafolio", async () => {
    netWorthSerie = [nw("2026-06-01", 4_000_000), nw("2026-07-01", 4_500_000)];
    portfolioSerie = [pf("2026-05-31", 900, 28_000)];

    const r = await consultarHistorial({ metrica: "patrimonio" }, "CRC");

    expect(r.serie).toHaveLength(2);
    expect(r.serie.every((p) => p.valor >= 4_000_000)).toBe(true);
  });
});

describe("consultar_historial · métrica portafolio", () => {
  it("sigue leyendo portfolio_snapshots aunque haya historial de patrimonio", async () => {
    netWorthSerie = [nw("2026-06-01", 4_000_000), nw("2026-07-01", 4_500_000)];
    portfolioSerie = [pf("2026-06-30", 1_000, 30_000), pf("2026-07-31", 2_000, 33_000)];

    const r = await consultarHistorial({ metrica: "portafolio" }, "CRC");

    expect(r.serie.map((p) => p.valor)).toEqual([1_000, 2_000]); // portfolio_value
    expect(r.moneda).toBe("USD");
  });
});

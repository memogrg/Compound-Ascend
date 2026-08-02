/**
 * Escritura del PATRIMONIO en `net_worth_snapshots` (rich-life/net-worth-snapshot-service):
 * el servicio REAL con dependencias mockeadas. Verifica que se guarda lo que calcula el
 * MOTOR (activos − pasivos, no el valor del portafolio), la clave de periodo mensual, el
 * etiquetado al hogar, el early-return sin datos y que el barrido multi-usuario no se
 * caiga entero por un usuario roto.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/fx", () => ({
  convertCurrency: (n: number) => n,
  // format.ts (importado transitivamente por el motor) deriva su lista de monedas de aquí.
  SUPPORTED_CURRENCIES: ["USD", "CRC", "EUR", "MXN", "COP", "GBP", "BTC"],
  isCryptoCurrency: (c: string) => c === "BTC",
  currencyDecimals: (c: string) => (c === "BTC" ? 8 : 0),
}));
vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => {
    throw new Error("requireUser NO debe llamarse cuando hay ctx (modo cron)");
  }),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock("@/lib/household/active", () => ({
  getActiveHouseholdId: vi.fn(async () => "hogar-1"),
  householdMemberIds: vi.fn(async () => ["u1", "u2"]),
}));

const aggregateNetWorthMock = vi.fn();
vi.mock("@/modules/rich-life/services/rich-life-service", () => ({
  aggregateNetWorth: (...args: unknown[]) => aggregateNetWorthMock(...args),
}));

const upserts: Record<string, unknown>[] = [];
let historyRows: Record<string, unknown>[] = [];

function fakeDb() {
  return {
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        order: () => q,
        upsert: (row: Record<string, unknown>) => {
          upserts.push({ ...row, __table: table });
          return Promise.resolve({ error: null });
        },
        // Las lecturas se await-ean directo sobre el builder.
        then(resolve: (v: { data: unknown[] }) => void) {
          resolve({ data: table === "profiles" ? profileRows : historyRows });
        },
      };
      return q;
    },
  };
}

let profileRows: { id: string }[] = [];
vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => fakeDb() }));

const AGG = {
  assets: [
    { id: "a1", name: "Efectivo", assetClass: "liquido", value: 1_000_000, currency: "CRC", generatesIncome: false, liquidity: "alta" },
    { id: "a2", name: "ETF", assetClass: "inversion", value: 4_000_000, currency: "CRC", generatesIncome: false, liquidity: "media" },
  ],
  liabilities: [
    { id: "l1", name: "Tarjeta", liabilityClass: "consumo", balance: 500_000, currency: "CRC" },
  ],
  passiveIncomeMonthly: 0,
  monthlyExpenses: 300_000,
  netMonthlyIncome: 800_000,
  freeCashflow: 500_000,
  protection: { score: 50 },
  portfolio: { diversification: 40 },
  currency: "CRC",
  explicitAssets: [],
  explicitLiabilities: [],
  previousNetWorth: null,
};

import {
  generateNetWorthSnapshot,
  generateNetWorthSnapshotsForAllUsers,
  getNetWorthHistory,
  periodKey,
} from "@/modules/rich-life/services/net-worth-snapshot-service";

const ctx = { db: fakeDb(), userId: "u1" } as never;

beforeEach(() => {
  upserts.length = 0;
  historyRows = [];
  profileRows = [];
  aggregateNetWorthMock.mockReset();
  aggregateNetWorthMock.mockResolvedValue(AGG);
});

describe("periodKey", () => {
  it("normaliza el mes al día 1 con dos dígitos", () => {
    expect(periodKey({ year: 2026, month: 7 })).toBe("2026-07-01");
    expect(periodKey({ year: 2026, month: 12 })).toBe("2026-12-01");
  });
});

describe("generateNetWorthSnapshot", () => {
  it("guarda el patrimonio del MOTOR (activos − pasivos), no el valor del portafolio", async () => {
    const snap = await generateNetWorthSnapshot({ year: 2026, month: 7 }, ctx);

    expect(snap).toMatchObject({
      period: "2026-07-01",
      netWorth: 4_500_000,
      totalAssets: 5_000_000,
      totalLiabilities: 500_000,
      currency: "CRC",
    });
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      __table: "net_worth_snapshots",
      user_id: "u1",
      household_id: "hogar-1", // sin esto el resto del hogar no lo ve (RLS)
      period: "2026-07-01",
      net_worth: 4_500_000,
      total_assets: 5_000_000,
      total_liabilities: 500_000,
    });
  });

  it("deja la moneda y el desglose en `breakdown` (la tabla no tiene columna de moneda)", async () => {
    await generateNetWorthSnapshot({ year: 2026, month: 7 }, ctx);
    const bd = upserts[0]!.breakdown as Record<string, number | string>;
    expect(bd.currency).toBe("CRC");
    expect(bd.invested).toBe(4_000_000);
    expect(bd.liquid).toBe(1_000_000);
  });

  it("usa la caché de precios cuando se le pide (barrido multi-usuario)", async () => {
    await generateNetWorthSnapshot({ year: 2026, month: 7 }, ctx, { precios: "cache" });
    expect(aggregateNetWorthMock).toHaveBeenCalledWith(ctx, { precios: "cache" });
  });

  it("sin activos NI pasivos no escribe nada (no ensucia la serie con meses en cero)", async () => {
    aggregateNetWorthMock.mockResolvedValue({ ...AGG, assets: [], liabilities: [] });
    expect(await generateNetWorthSnapshot({ year: 2026, month: 7 }, ctx)).toBeNull();
    expect(upserts).toHaveLength(0);
  });

  it("un patrimonio negativo se guarda tal cual (deudas > activos es un dato real)", async () => {
    aggregateNetWorthMock.mockResolvedValue({
      ...AGG,
      assets: [{ ...AGG.assets[0]!, value: 100_000 }],
      liabilities: [{ ...AGG.liabilities[0]!, balance: 900_000 }],
    });
    const snap = await generateNetWorthSnapshot({ year: 2026, month: 7 }, ctx);
    expect(snap?.netWorth).toBe(-800_000);
  });
});

describe("generateNetWorthSnapshotsForAllUsers", () => {
  it("escribe una fila por usuario con datos", async () => {
    profileRows = [{ id: "u1" }, { id: "u2" }];
    const res = await generateNetWorthSnapshotsForAllUsers({ year: 2026, month: 7 });
    expect(res).toEqual({ users: 2, written: 2 });
    expect(upserts).toHaveLength(2);
  });

  it("un usuario que revienta no aborta el barrido de los demás", async () => {
    profileRows = [{ id: "u1" }, { id: "u2" }];
    aggregateNetWorthMock
      .mockRejectedValueOnce(new Error("portafolio roto"))
      .mockResolvedValue(AGG);
    const res = await generateNetWorthSnapshotsForAllUsers({ year: 2026, month: 7 });
    expect(res).toEqual({ users: 2, written: 1 });
  });
});

describe("getNetWorthHistory", () => {
  it("deduplica por periodo (las filas del hogar traen el MISMO agregado, no se suman)", async () => {
    historyRows = [
      { user_id: "u2", period: "2026-06-01", net_worth: 4_000_000, total_assets: 4_500_000, total_liabilities: 500_000, breakdown: { currency: "CRC" } },
      { user_id: "u1", period: "2026-06-01", net_worth: 4_000_000, total_assets: 4_500_000, total_liabilities: 500_000, breakdown: { currency: "CRC" } },
      { user_id: "u1", period: "2026-07-01", net_worth: 4_500_000, total_assets: 5_000_000, total_liabilities: 500_000, breakdown: { currency: "CRC" } },
    ];
    const { requireUser } = await import("@/lib/auth/session");
    vi.mocked(requireUser).mockResolvedValue({ id: "u1" } as never);
    const { createSupabaseServerClient } = await import("@/lib/supabase/server");
    vi.mocked(createSupabaseServerClient).mockResolvedValue(fakeDb() as never);

    const serie = await getNetWorthHistory();
    expect(serie.map((s) => s.period)).toEqual(["2026-06-01", "2026-07-01"]);
    expect(serie[0]!.netWorth).toBe(4_000_000); // no 8.000.000
    expect(serie[1]!.currency).toBe("CRC");
  });
});

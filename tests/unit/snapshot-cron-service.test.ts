/**
 * Cobertura directa de generateSnapshotForUserCron (wealth/snapshot-service):
 * el servicio REAL con dependencias mockeadas. Verifica el early-return sin
 * holdings, que el net_worth se calcule con el MOTOR (ya no se arrastra el del
 * snapshot anterior), la degradación cuando ese motor falla, y que JAMÁS
 * dependa de la sesión.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => {
    throw new Error("requireUser NO debe llamarse en modo cron");
  }),
  isSupabaseConfigured: () => true,
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/market-data/fx-rates", () => ({ getFxRates: vi.fn(async () => ({})) }));
vi.mock("@/lib/fx", () => ({
  convertCurrency: (n: number) => n,
  // format.ts (importado transitivamente) deriva su lista de monedas + helpers de aquí.
  SUPPORTED_CURRENCIES: ["USD", "CRC", "EUR", "MXN", "COP", "GBP", "BTC"],
  isCryptoCurrency: (c: string) => c === "BTC",
  currencyDecimals: (c: string) => (c === "BTC" ? 8 : 0),
}));
vi.mock("@/modules/wealth/services/portfolio-service", () => ({
  fetchNormalizedPrices: vi.fn(async () => ({ VOO: 500 })),
  // snapshot-service ahora normaliza holdings vía este helper (no afecta este
  // test: la analítica está mockeada); identidad basta.
  normalizeHoldings: <T,>(holdings: T) => holdings,
}));
vi.mock("@/modules/wealth/engine/portfolio-engine", () => ({
  computePortfolioAnalytics: vi.fn(() => ({ totalPortfolioValue: 6000, totalCostBasis: 4800 })),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

const computeNetWorthMock = vi.fn();
vi.mock("@/modules/rich-life/services/net-worth-snapshot-service", () => ({
  computeNetWorth: (...args: unknown[]) => computeNetWorthMock(...args),
}));

const upserts: unknown[] = [];
let holdingsRows: unknown[] = [];
const LAST_NET_WORTH = 9999;
const NET_WORTH_MOTOR = 12_345_678;

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        limit: () => q,
        maybeSingle: async () =>
          table === "user_settings"
            ? { data: { primary_currency: "CRC" } }
            : { data: { net_worth: LAST_NET_WORTH } },
        upsert: (row: unknown) => {
          upserts.push(row);
          return {
            select: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "s1",
                  date: "2026-06-12",
                  portfolio_value: 6000,
                  investment_value: 4800,
                  net_worth: LAST_NET_WORTH,
                  currency: "CRC",
                },
                error: null,
              }),
            }),
          };
        },
        // la consulta de holdings se await-ea directo sobre el builder
        then(resolve: (v: { data: unknown[] }) => void) {
          resolve({ data: holdingsRows });
        },
      };
      return q;
    },
  }),
}));

import { generateSnapshotForUserCron } from "@/modules/wealth/services/snapshot-service";

const VALID_UUID = "e7040f66-42de-4a15-a9a2-14d2b3e16b6c";

const HOLDING = {
  id: "h1",
  investment_id: null,
  symbol: "VOO",
  asset_type: "etf",
  quantity: 12,
  average_cost: 400,
  purchase_date: null,
  broker: null,
  currency: "USD",
  label: null,
  current_value_manual: null,
  rental_income: null,
  rental_frequency: null,
  rental_subtype: null,
};

type UpsertRow = { net_worth: number; portfolio_value: number; user_id: string };

beforeEach(() => {
  upserts.length = 0;
  holdingsRows = [];
  computeNetWorthMock.mockReset();
  computeNetWorthMock.mockResolvedValue({
    indicators: { netWorth: NET_WORTH_MOTOR, totalAssets: NET_WORTH_MOTOR, totalLiabilities: 0 },
    currency: "CRC",
    assets: [],
  });
});

describe("generateSnapshotForUserCron", () => {
  it("sin holdings devuelve null y no escribe nada", async () => {
    expect(await generateSnapshotForUserCron(VALID_UUID)).toBeNull();
    expect(upserts).toHaveLength(0);
    expect(computeNetWorthMock).not.toHaveBeenCalled();
  });

  it("el net_worth sale del MOTOR, no del snapshot anterior", async () => {
    holdingsRows = [HOLDING];

    const snap = await generateSnapshotForUserCron(VALID_UUID);

    expect(snap).not.toBeNull();
    expect(upserts).toHaveLength(1);
    const row = upserts[0] as UpsertRow;
    expect(row.net_worth).toBe(NET_WORTH_MOTOR);
    expect(row.net_worth).not.toBe(LAST_NET_WORTH); // se acabó el arrastre
    expect(row.portfolio_value).toBe(6000);
    expect(row.user_id).toBe(VALID_UUID);
  });

  it("el motor corre con service-role y precios de caché (no repite la ronda en vivo)", async () => {
    holdingsRows = [HOLDING];

    await generateSnapshotForUserCron(VALID_UUID);

    const [ctx, opts] = computeNetWorthMock.mock.calls[0] as [
      { userId: string; db: unknown },
      { precios: string },
    ];
    expect(ctx.userId).toBe(VALID_UUID);
    expect(ctx.db).toBeTruthy(); // cliente inyectado: nunca la sesión
    expect(opts).toEqual({ precios: "cache" });
  });

  it("si el motor revienta, degrada al último snapshot en vez de perder la corrida", async () => {
    holdingsRows = [HOLDING];
    computeNetWorthMock.mockRejectedValue(new Error("proveedor caído"));

    const snap = await generateSnapshotForUserCron(VALID_UUID);

    expect(snap).not.toBeNull();
    expect((upserts[0] as UpsertRow).net_worth).toBe(LAST_NET_WORTH);
  });

  it("usuario sin activos ni pasivos: el motor devuelve null y también degrada", async () => {
    holdingsRows = [HOLDING];
    computeNetWorthMock.mockResolvedValue(null);

    await generateSnapshotForUserCron(VALID_UUID);

    expect((upserts[0] as UpsertRow).net_worth).toBe(LAST_NET_WORTH);
  });
});

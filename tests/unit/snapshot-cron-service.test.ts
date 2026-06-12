/**
 * Cobertura directa de generateSnapshotForUserCron (wealth/snapshot-service):
 * el servicio REAL con dependencias mockeadas. Verifica el early-return sin
 * holdings, el carry-forward de net_worth y que JAMÁS dependa de la sesión.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(async () => {
    throw new Error("requireUser NO debe llamarse en modo cron");
  }),
  isSupabaseConfigured: () => true,
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/market-data/fx-rates", () => ({ getFxRates: vi.fn(async () => ({})) }));
vi.mock("@/lib/fx", () => ({ convertCurrency: (n: number) => n }));
vi.mock("@/modules/wealth/services/portfolio-service", () => ({
  fetchNormalizedPrices: vi.fn(async () => ({ VOO: 500 })),
}));
vi.mock("@/modules/wealth/engine/portfolio-engine", () => ({
  computePortfolioAnalytics: vi.fn(() => ({ totalPortfolioValue: 6000, totalCostBasis: 4800 })),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

const upserts: unknown[] = [];
let holdingsRows: unknown[] = [];
const LAST_NET_WORTH = 9999;

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

describe("generateSnapshotForUserCron", () => {
  it("sin holdings devuelve null y no escribe nada", async () => {
    holdingsRows = [];
    expect(await generateSnapshotForUserCron(VALID_UUID)).toBeNull();
    expect(upserts).toHaveLength(0);
  });

  it("con holdings genera snapshot y arrastra net_worth del último snapshot", async () => {
    holdingsRows = [
      {
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
      },
    ];
    const snap = await generateSnapshotForUserCron(VALID_UUID);
    expect(snap).not.toBeNull();
    expect(upserts).toHaveLength(1);
    const row = upserts[0] as { net_worth: number; portfolio_value: number; user_id: string };
    expect(row.net_worth).toBe(LAST_NET_WORTH); // carry-forward, no recálculo
    expect(row.portfolio_value).toBe(6000);
    expect(row.user_id).toBe(VALID_UUID);
  });
});

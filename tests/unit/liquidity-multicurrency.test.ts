import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { AuthContext } from "@/lib/auth/auth-context";

/**
 * #87 · liquidez MULTI-MONEDA. El saldo inicial se declara en la moneda que el usuario elige
 * (el ledger es multi-moneda vía `liquidity_ledger.currency`, sin migración). `setOpeningBalance`
 * la persiste tal cual; `loadRows`/`getLiquidityBalance` la CONVIERTEN a la principal al leer —que
 * es lo que consume el patrimonio (rich-life-service llama getLiquidityBalance para el bucket
 * líquido). Principal ("USD") ≠ la moneda declarada ("EUR") para discriminar el feature.
 */

// Fake mínimo de SupabaseClient: encadena como el builder real, captura inserts, y resuelve el
// SELECT (await de la query) con `ledgerRows`; el maybeSingle (chequeo de apertura previa) con `existing`.
function makeDb(ledgerRows: unknown[] = [], existing: unknown = null) {
  const inserted: Record<string, unknown[]> = {};
  const builder = (table: string) => {
    const b: Record<string, unknown> = {};
    const self = () => b;
    Object.assign(b, {
      select: self,
      insert: (row: unknown) => {
        (inserted[table] ??= []).push(row);
        return b;
      },
      update: self,
      delete: self,
      eq: self,
      order: self,
      maybeSingle: async () => ({ data: existing }),
      single: async () => ({ data: existing }),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve({ data: ledgerRows }).then(resolve, reject),
    });
    return b;
  };
  const db = { from: (t: string) => builder(t) } as unknown as SupabaseClient<Database>;
  return { db, inserted };
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/household/active", () => ({ getActiveHouseholdId: async () => "hh_1" }));
// 1 USD = 0.9 EUR (rates per-USD). convertCurrency(x,"EUR","USD",rates) = (x/0.9)*1.
vi.mock("@/lib/market-data/fx-rates", () => ({
  getFxRates: async () => ({ USD: 1, EUR: 0.9, CRC: 520 }),
}));
vi.mock("@/lib/time/user-time", () => ({ userToday: async () => "2026-08-24" }));
vi.mock("@/modules/financial-base/services/base-service", () => ({
  getPrimaryCurrency: async () => "USD",
  getDisplayCurrency: async () => "CRC",
}));

import {
  setOpeningBalance,
  getLiquidityBalance,
} from "@/modules/financial-base/services/liquidity-service";

describe("#87 · saldo inicial en la moneda elegida (ledger multi-moneda, sin migración)", () => {
  it("setOpeningBalance con moneda explícita graba la 'apertura' en ESA moneda, no la principal", async () => {
    const { db, inserted } = makeDb();
    const ctx: AuthContext = { db, userId: "u_1" };

    await setOpeningBalance(500, "EUR", ctx);

    expect(inserted.liquidity_ledger).toHaveLength(1);
    expect(inserted.liquidity_ledger![0]).toMatchObject({
      reason: "apertura",
      currency: "EUR", // la elegida, NO la principal (USD)
      delta: 500,
      occurred_on: "2026-08-24",
    });
  });

  it("sin moneda → default a la principal (USD)", async () => {
    const { db, inserted } = makeDb();
    const ctx: AuthContext = { db, userId: "u_1" };

    await setOpeningBalance(500, undefined, ctx);

    expect(inserted.liquidity_ledger![0]).toMatchObject({ currency: "USD", delta: 500 });
  });

  it("al LEER, una apertura en EUR se convierte a la principal (lo que consume el patrimonio)", async () => {
    // 90 EUR con 1 USD = 0.9 EUR → 100 USD.
    const eurApertura = {
      delta: 90,
      currency: "EUR",
      reason: "apertura",
      occurred_on: "2026-08-24",
    };
    const { db } = makeDb([eurApertura]);
    const ctx: AuthContext = { db, userId: "u_1" };

    const res = await getLiquidityBalance(ctx);

    expect(res.currency).toBe("USD"); // principal
    expect(res.balance).toBe(100); // 90 EUR convertidos, no 90 crudos
    expect(res.hasOpening).toBe(true);
  });
});

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { AuthContext } from "@/lib/auth/auth-context";

/**
 * Delta 1 · #87 — el Saco de Liquidez se ALMACENA (y se lee) en la moneda PRINCIPAL del
 * usuario, no en la de VISTA (topbar). El bug vivía solo en el camino sin `ctx` (cookie
 * `ca_display_currency`; con `ctx`, `getDisplayCurrency` ya devolvía la principal), así que
 * la única forma de discriminar el fix es con `getPrimaryCurrency` ≠ `getDisplayCurrency`
 * MOCKEADOS: si el servicio escribiera en la de vista, la fila saldría en "CRC" (vista) en
 * vez de "USD" (principal).
 *
 * De paso valida el fix #90 server: los asientos de apertura/ajuste llevan `occurred_on` de
 * `userToday()`, no el default `now()` (UTC) de la columna.
 */

// Fake mínimo de SupabaseClient que encadena como el builder real y captura los `insert`.
// Definido en `vi.hoisted` para poder referenciarlo desde el factory (hoisteado) del mock
// de `@/lib/supabase/server` (camino de sesión de reconcileBalance).
const H = vi.hoisted(() => {
  function makeDb() {
    const inserted: Record<string, unknown[]> = {};
    const responses: Record<string, { data: unknown }> = {
      liquidity_ledger: { data: null }, // no hay apertura previa → rama INSERT; ledger vacío al leer
    };
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
        maybeSingle: async () => responses[table] ?? { data: null },
        single: async () => responses[table] ?? { data: null },
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve(responses[table] ?? { data: [] }).then(resolve, reject),
      });
      return b;
    };
    const db = { from: (t: string) => builder(t) } as unknown as SupabaseClient<Database>;
    return { db, inserted };
  }
  return { makeDb, session: makeDb() };
});

vi.mock("server-only", () => ({}));
vi.mock("@/lib/household/active", () => ({ getActiveHouseholdId: async () => "hh_1" }));
vi.mock("@/lib/market-data/fx-rates", () => ({ getFxRates: async () => ({}) }));
vi.mock("@/lib/time/user-time", () => ({ userToday: async () => "2026-08-24" }));
// El corazón de la prueba: principal ("USD") ≠ vista ("CRC").
vi.mock("@/modules/financial-base/services/base-service", () => ({
  getPrimaryCurrency: async () => "USD",
  getDisplayCurrency: async () => "CRC",
}));
// reconcileBalance no toma ctx: usa el camino de SESIÓN (requireUser + server client).
vi.mock("@/lib/auth/session", () => ({ requireUser: async () => ({ id: "u_1" }) }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => H.session.db,
}));

import {
  setOpeningBalance,
  reconcileBalance,
} from "@/modules/financial-base/services/liquidity-service";

describe("#87(a) · la liquidez se escribe en la moneda PRINCIPAL, no en la de vista", () => {
  it("setOpeningBalance graba la 'apertura' en USD (principal), no CRC (vista)", async () => {
    const open = H.makeDb();
    const ctx: AuthContext = { db: open.db, userId: "u_1" };

    await setOpeningBalance(1000, undefined, ctx);

    const rows = open.inserted.liquidity_ledger ?? [];
    expect(rows).toHaveLength(1);
    // Si el fix no estuviera, currency sería "CRC" (la de vista mockeada).
    expect(rows[0]).toMatchObject({
      reason: "apertura",
      currency: "USD",
      delta: 1000,
      occurred_on: "2026-08-24", // fix #90 server: fecha del usuario, no el now() UTC de la BD
    });
  });

  it("reconcileBalance graba el 'ajuste' en USD (principal)", async () => {
    // saldo real 500, computado 0 (ledger vacío) → delta 500 en la moneda principal.
    await reconcileBalance(500);

    const rows = H.session.inserted.liquidity_ledger ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      reason: "ajuste",
      currency: "USD",
      delta: 500,
      occurred_on: "2026-08-24",
    });
  });
});

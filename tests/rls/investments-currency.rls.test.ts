/**
 * Delta 3b (#437) — la moneda de `investments` se PERSISTE, contra Postgres real.
 *   · createInvestment con moneda explícita (USD) → columna 'USD' + listInvestments la lee 'USD'.
 *   · createInvestment SIN moneda → se resuelve a la PRINCIPAL del usuario (no CRC hard-coded).
 *
 * Requiere la migración 20260825000001 aplicada en la BD de pruebas (columna currency). Gated en
 * SUPABASE_TEST_*; shim `ws` para Node 20 (ver delta 1).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { AuthContext } from "@/lib/auth/auth-context";
import { createInvestment, listInvestments } from "@/modules/wealth/services/wealth-service";

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const ready = Boolean(URL && ANON && SERVICE);

const pw = "Test1234!seguro";
const email = `invcur-${Date.now()}@example.com`;

describe.skipIf(!ready)("delta 3b · moneda de investments (Postgres real)", () => {
  let admin: SupabaseClient<Database>;
  let userId = "";
  let ctx: AuthContext;

  beforeAll(async () => {
    const g = globalThis as { WebSocket?: unknown };
    if (typeof g.WebSocket === "undefined") g.WebSocket = (await import("ws")).default;
    admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } });
    userId = (await admin.auth.admin.createUser({ email, password: pw, email_confirm: true })).data
      .user!.id;
    await admin.from("user_settings").upsert({ user_id: userId, primary_currency: "USD" });
    ctx = { db: admin, userId };
  });

  afterAll(async () => {
    if (!ready) return;
    if (userId) {
      await admin.from("investments").delete().eq("user_id", userId);
      await admin.from("user_settings").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("persiste la moneda explícita (USD) y la lee de vuelta", async () => {
    await createInvestment(
      {
        name: "ETF USD",
        assetType: "etf",
        investedAmount: 1_000,
        contribution: 0,
        currency: "USD",
      },
      ctx,
    );
    const { data } = await admin
      .from("investments")
      .select("currency")
      .eq("user_id", userId)
      .eq("name", "ETF USD")
      .single();
    expect(data?.currency).toBe("USD");

    const list = await listInvestments(ctx);
    expect(list.find((i) => i.name === "ETF USD")?.currency).toBe("USD");
  });

  it("sin moneda → se resuelve a la PRINCIPAL (USD), no a CRC", async () => {
    await createInvestment(
      { name: "ETF sin moneda", assetType: "etf", investedAmount: 500, contribution: 0 },
      ctx,
    );
    const { data } = await admin
      .from("investments")
      .select("currency")
      .eq("user_id", userId)
      .eq("name", "ETF sin moneda")
      .single();
    expect(data?.currency).toBe("USD");
  });
});

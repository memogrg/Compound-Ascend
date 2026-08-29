/**
 * Delta 1 · #87 (b) — integración contra Postgres REAL: con `primary_currency='USD'`, el
 * Saco de Liquidez se GRABA y se LEE en USD (la principal), no en CRC (el default de la app
 * ni la moneda de vista). Complementa la unitaria `liquidity-primary-currency.test.ts`: la
 * unitaria discrimina principal≠vista con mocks (el bug vivía solo en el camino de cookie);
 * esta prueba el PLOMBING extremo-a-extremo en la moneda principal contra la BD.
 *
 * Requiere Supabase de PRUEBAS con migraciones aplicadas (NO producción):
 *   SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY / SUPABASE_TEST_SERVICE_ROLE_KEY
 * Si faltan, se omite (no rompe CI). El config de vitest NO carga .env.local: inyectá las
 * vars en el shell para ejercerla (ver README de sim/rls).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { AuthContext } from "@/lib/auth/auth-context";
import {
  setOpeningBalance,
  getLiquidityBalance,
  getClosingLiquidity,
} from "@/modules/financial-base/services/liquidity-service";

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const ready = Boolean(URL && ANON && SERVICE);

const pw = "Test1234!seguro";
const email = `liq-usd-${Date.now()}@example.com`;

describe.skipIf(!ready)("#87(b) · liquidez en la moneda principal (USD) contra Postgres", () => {
  let admin: SupabaseClient<Database>;
  let userId = "";
  let ctx: AuthContext;

  beforeAll(async () => {
    // supabase-js inicializa realtime en su constructor y busca un `WebSocket` global; Node < 22
    // no lo trae y `createClient` explota (misma limitación que el resto de tests/rls). Nunca
    // usamos realtime acá: le prestamos el de `ws` (ya en devDeps) para poder ejercer la prueba
    // también en local. En Node 22+ el global ya existe y esto es no-op.
    const g = globalThis as { WebSocket?: unknown };
    if (typeof g.WebSocket === "undefined") g.WebSocket = (await import("ws")).default;
    admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } });
    const u = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
    userId = u.data.user!.id;
    // La principal es USD (la app default es CRC): así "USD" prueba que se respeta la principal.
    await admin.from("user_settings").upsert({ user_id: userId, primary_currency: "USD" });
    // ctx service-role (patrón cron): bypassa RLS y filtra por userId explícito.
    ctx = { db: admin, userId };
  });

  afterAll(async () => {
    if (!ready) return;
    if (userId) {
      await admin.from("liquidity_ledger").delete().eq("user_id", userId);
      await admin.from("user_settings").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  it("setOpeningBalance graba la 'apertura' en USD en la BD", async () => {
    await setOpeningBalance(1000, undefined, ctx);
    const { data } = await admin
      .from("liquidity_ledger")
      .select("delta, currency, reason")
      .eq("user_id", userId)
      .eq("reason", "apertura")
      .single();
    expect(data?.currency).toBe("USD"); // no CRC (default) ni la de vista
    expect(Number(data?.delta)).toBe(1000);
  });

  it("getLiquidityBalance lee el saldo en USD (no en CRC)", async () => {
    const bal = await getLiquidityBalance(ctx);
    expect(bal.currency).toBe("USD");
    expect(bal.balance).toBe(1000);
    expect(bal.hasOpening).toBe(true);
  });

  it("la liquidez de cierre (input líquido del patrimonio neto) también sale en USD", async () => {
    // El patrimonio neto compone su parte líquida desde el servicio de liquidez: si éste
    // devuelve USD, el neto lo hereda (nunca CRC ni la de vista).
    const closing = await getClosingLiquidity({ to: "2026-12-31" }, ctx);
    expect(closing.currency).toBe("USD");
    expect(closing.balance).toBe(1000);
  });
});

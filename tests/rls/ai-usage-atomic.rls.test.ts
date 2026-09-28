/**
 * Concurrencia del ledger de consumo de IA, contra un Supabase REAL (self-skip sin credenciales).
 *
 * Demuestra el bug que motiva la migración 20260928000001: con read-modify-write (select ->
 * upsert) N incrementos en paralelo se PISAN y el total queda por debajo del real. Con el RPC
 * atómico increment_ai_usage (INSERT ... ON CONFLICT DO UPDATE ... + excluded, serializado por
 * fila) el total es EXACTO.
 *
 * Requiere que la migración esté aplicada en la BD de prueba (en CI lo hace el job
 * «Migraciones aplican en BD fresca»; en local, aplicarla al stack de Supabase).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_TEST_URL;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const ready = Boolean(URL && SERVICE);

const N = 20; // incrementos concurrentes
const STEP = 100; // tokens por incremento
const EXPECTED = N * STEP; // 2000
const PERIOD = (() => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
})();

describe.skipIf(!ready)("ai_usage_ledger · incremento concurrente", () => {
  let admin: SupabaseClient;
  let userId = "";

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } });
    const u = await admin.auth.admin.createUser({
      email: `usage-atomic-${Date.now()}@example.com`,
      password: "Test1234!seguro",
      email_confirm: true,
    });
    userId = u.data.user!.id;
  });

  afterAll(async () => {
    if (userId) {
      await admin.from("ai_usage_ledger").delete().eq("user_id", userId);
      await admin.auth.admin.deleteUser(userId);
    }
  });

  async function reset() {
    await admin.from("ai_usage_ledger").delete().eq("user_id", userId);
  }

  async function readTokens(): Promise<number> {
    const { data } = await admin
      .from("ai_usage_ledger")
      .select("tokens_used,requests")
      .eq("user_id", userId)
      .eq("period", PERIOD)
      .maybeSingle();
    return Number(data?.tokens_used ?? 0);
  }

  it(`read-modify-write SUBCUENTA con ${N} incrementos en paralelo`, async () => {
    await reset();
    // Réplica fiel del camino viejo: leer, (ventana de carrera), escribir la suma.
    const rmw = async () => {
      const { data: existing } = await admin
        .from("ai_usage_ledger")
        .select("tokens_used,requests")
        .eq("user_id", userId)
        .eq("period", PERIOD)
        .maybeSingle();
      // La ventana existe también en producción; acá la ensanchamos para hacer la carrera
      // determinista en el test (si no, a veces se serializa sola y no se ve el bug).
      await new Promise((r) => setTimeout(r, 15));
      await admin.from("ai_usage_ledger").upsert(
        {
          user_id: userId,
          period: PERIOD,
          tokens_used: Number(existing?.tokens_used ?? 0) + STEP,
          requests: Number(existing?.requests ?? 0) + 1,
        },
        { onConflict: "user_id,period" },
      );
    };
    await Promise.all(Array.from({ length: N }, () => rmw()));
    const got = await readTokens();
    console.log(`[read-modify-write] esperado=${EXPECTED} obtenido=${got} (pérdida=${EXPECTED - got})`);
    expect(got).toBeLessThan(EXPECTED); // el bug: subcuenta
  });

  it(`RPC increment_ai_usage suma EXACTO con ${N} incrementos en paralelo`, async () => {
    await reset();
    const results = await Promise.all(
      Array.from({ length: N }, () =>
        admin.rpc("increment_ai_usage", {
          p_user_id: userId,
          p_period: PERIOD,
          p_tokens: STEP,
          p_requests: 1,
        }),
      ),
    );
    const errored = results.filter((r) => r.error);
    expect(errored, JSON.stringify(errored.map((r) => r.error))).toHaveLength(0);
    const got = await readTokens();
    const { data } = await admin
      .from("ai_usage_ledger")
      .select("requests")
      .eq("user_id", userId)
      .eq("period", PERIOD)
      .maybeSingle();
    console.log(`[RPC atómico] esperado=${EXPECTED} obtenido=${got} requests=${data?.requests}`);
    expect(got).toBe(EXPECTED);
    expect(Number(data?.requests)).toBe(N);
  });
});

/**
 * Concurrencia del ledger de consumo de IA, contra un Supabase REAL (self-skip sin credenciales).
 *
 * Demuestra el bug que motiva la migración 20260928000001: con read-modify-write (leer
 * tokens_used -> escribir la suma) N incrementos en paralelo se PISAN y el total queda por
 * debajo del real. Con el RPC atómico increment_ai_usage (INSERT ... ON CONFLICT DO UPDATE ...
 * + excluded, serializado por fila) el total es EXACTO.
 *
 * Sin supabase-js a propósito: usa fetch contra PostgREST y la API admin de auth, así corre en
 * Node 20 (sin WebSocket nativo) igual que en Node 22. Requiere que la migración esté aplicada
 * en la BD de prueba (en CI lo hace el job «Migraciones aplican en BD fresca»; en local,
 * `supabase migration up`).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const BASE = process.env.SUPABASE_TEST_URL;
const KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const ready = Boolean(BASE && KEY);

const N = 20; // incrementos concurrentes
const STEP = 100; // tokens por incremento
const EXPECTED = N * STEP; // 2000
const PERIOD = (() => {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
})();

const H = () => ({ apikey: KEY!, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" });

describe.skipIf(!ready)("ai_usage_ledger · incremento concurrente", () => {
  let userId = "";

  beforeAll(async () => {
    const res = await fetch(`${BASE}/auth/v1/admin/users`, {
      method: "POST",
      headers: H(),
      body: JSON.stringify({
        email: `usage-atomic-${Date.now()}@example.com`,
        password: "Test1234!seguro",
        email_confirm: true,
      }),
    });
    const user = (await res.json()) as { id?: string };
    if (!user.id) throw new Error(`no se pudo crear el usuario de prueba: ${JSON.stringify(user)}`);
    userId = user.id;
  });

  afterAll(async () => {
    if (!userId) return;
    await deleteRows();
    await fetch(`${BASE}/auth/v1/admin/users/${userId}`, { method: "DELETE", headers: H() });
  });

  const deleteRows = () =>
    fetch(`${BASE}/rest/v1/ai_usage_ledger?user_id=eq.${userId}&period=eq.${PERIOD}`, {
      method: "DELETE",
      headers: H(),
    });

  async function readRow(): Promise<{ tokens_used: number; requests: number }> {
    const res = await fetch(
      `${BASE}/rest/v1/ai_usage_ledger?user_id=eq.${userId}&period=eq.${PERIOD}&select=tokens_used,requests`,
      { headers: H() },
    );
    const rows = (await res.json()) as { tokens_used: number; requests: number }[];
    return rows[0] ?? { tokens_used: 0, requests: 0 };
  }

  it(`read-modify-write SUBCUENTA con ${N} incrementos en paralelo`, async () => {
    await deleteRows();
    // Réplica fiel del camino viejo: leer, (ventana de carrera), escribir la suma.
    const rmw = async () => {
      const cur = await readRow();
      // La ventana existe también en producción; acá la ensanchamos para hacer la carrera
      // determinista en el test (si no, a veces se serializa sola y no se ve el bug).
      await new Promise((r) => setTimeout(r, 15));
      await fetch(`${BASE}/rest/v1/ai_usage_ledger`, {
        method: "POST",
        headers: { ...H(), Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({
          user_id: userId,
          period: PERIOD,
          tokens_used: Number(cur.tokens_used) + STEP,
          requests: Number(cur.requests) + 1,
        }),
      });
    };
    await Promise.all(Array.from({ length: N }, () => rmw()));
    const got = await readRow();
    console.log(
      `[read-modify-write] esperado=${EXPECTED} obtenido=${got.tokens_used} (pérdida=${EXPECTED - Number(got.tokens_used)})`,
    );
    expect(Number(got.tokens_used)).toBeLessThan(EXPECTED); // el bug: subcuenta
  });

  it(`RPC increment_ai_usage suma EXACTO con ${N} incrementos en paralelo`, async () => {
    await deleteRows();
    const statuses = await Promise.all(
      Array.from({ length: N }, () =>
        fetch(`${BASE}/rest/v1/rpc/increment_ai_usage`, {
          method: "POST",
          headers: H(),
          body: JSON.stringify({
            p_user_id: userId,
            p_period: PERIOD,
            p_tokens: STEP,
            p_requests: 1,
          }),
        }).then((r) => r.status),
      ),
    );
    expect(statuses.every((s) => s === 200), `status RPC: ${[...new Set(statuses)].join(",")}`).toBe(
      true,
    );
    const got = await readRow();
    console.log(
      `[RPC atómico] esperado=${EXPECTED} obtenido=${got.tokens_used} requests=${got.requests}`,
    );
    expect(Number(got.tokens_used)).toBe(EXPECTED);
    expect(Number(got.requests)).toBe(N);
  });
});

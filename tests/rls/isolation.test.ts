/**
 * Tests de aislamiento RLS.
 *
 * Requieren un proyecto Supabase de PRUEBAS con las migraciones aplicadas y estas
 * variables (NO usar producción):
 *   SUPABASE_TEST_URL
 *   SUPABASE_TEST_ANON_KEY
 *   SUPABASE_TEST_SERVICE_ROLE_KEY
 *
 * Si faltan, la suite se omite (no rompe el CI hasta provisionar la BD).
 *
 * Verifica:
 *  1. Usuario A no puede leer datos de B.
 *  2. Usuario A no puede modificar datos de B.
 *  3. Usuario A no puede escribir su consumo de tokens (ai_usage_ledger).
 *  4. Usuario A no puede aumentar su límite (ai_rate_limits).
 *  5. Usuario A no puede cambiar su plan (profiles.plan).
 *  6. El cliente anónimo no puede saltarse RLS.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const ready = Boolean(URL && ANON && SERVICE);

const pw = "Test1234!seguro";
const emailA = `rls-a-${Date.now()}@example.com`;
const emailB = `rls-b-${Date.now()}@example.com`;

describe.skipIf(!ready)("Aislamiento RLS", () => {
  let admin: SupabaseClient;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let userAId = "";
  let userBId = "";
  let goalBId = "";

  beforeAll(async () => {
    admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } });

    const a = await admin.auth.admin.createUser({
      email: emailA,
      password: pw,
      email_confirm: true,
    });
    const b = await admin.auth.admin.createUser({
      email: emailB,
      password: pw,
      email_confirm: true,
    });
    userAId = a.data.user!.id;
    userBId = b.data.user!.id;

    clientA = createClient(URL!, ANON!, { auth: { persistSession: false } });
    clientB = createClient(URL!, ANON!, { auth: { persistSession: false } });
    await clientA.auth.signInWithPassword({ email: emailA, password: pw });
    await clientB.auth.signInWithPassword({ email: emailB, password: pw });

    // B crea un objetivo de ahorro propio.
    const { data } = await clientB
      .from("savings_goals")
      .insert({ user_id: userBId, name: "Meta de B", target_amount: 1000 })
      .select("id")
      .single();
    goalBId = data?.id ?? "";
  });

  afterAll(async () => {
    if (!ready) return;
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  it("1. A no puede leer los objetivos de B", async () => {
    const { data } = await clientA.from("savings_goals").select("*");
    expect((data ?? []).find((g) => g.id === goalBId)).toBeUndefined();
  });

  it("2. A no puede modificar el objetivo de B", async () => {
    const { data } = await clientA
      .from("savings_goals")
      .update({ name: "hackeado" })
      .eq("id", goalBId)
      .select();
    expect(data ?? []).toHaveLength(0); // RLS impide tocar la fila
  });

  it("3. A no puede escribir su consumo de tokens", async () => {
    const { error } = await clientA
      .from("ai_usage_ledger")
      .insert({ user_id: userAId, period: "2026-06-01", tokens_used: 999999 });
    expect(error).not.toBeNull();
  });

  it("4. A no puede crear/aumentar su rate limit", async () => {
    const { error } = await clientA
      .from("ai_rate_limits")
      .insert({ user_id: userAId, bucket: "aiChat", count: 0 });
    expect(error).not.toBeNull();
  });

  it("5. A no puede cambiar su plan a premium", async () => {
    const { data, error } = await clientA
      .from("profiles")
      .update({ plan: "premium" })
      .eq("id", userAId)
      .select();
    // O bien lo rechaza el trigger (error), o no afecta filas.
    const changed = (data ?? []).some((p) => p.plan === "premium");
    expect(changed).toBe(false);
    expect(error ?? (data ?? []).length === 0).toBeTruthy();
  });

  it("6. El cliente anónimo no puede leer objetivos", async () => {
    const anon = createClient(URL!, ANON!, { auth: { persistSession: false } });
    const { data } = await anon.from("savings_goals").select("*");
    expect(data ?? []).toHaveLength(0);
  });
});

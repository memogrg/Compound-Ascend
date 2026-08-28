/**
 * RLS de `user_memory` — la memoria es PERSONAL, no del hogar.
 *
 * Es la diferencia importante con casi todas las demás tablas de datos del usuario, que están
 * compartidas por `household_id`: lo que alguien le contó al asesor en SU chat ("mi esposa se
 * llama Fernanda", un problema de salud, un plan que todavía no habló en casa) no puede aparecer
 * en el chat de su pareja. Por eso la tabla no lleva `household_id` y sus políticas son de dueño
 * estricto — y por eso el caso central de este archivo es DOS MIEMBROS DEL MISMO HOGAR.
 *
 * Requiere un proyecto Supabase de PRUEBAS con las migraciones aplicadas (mismas variables que
 * `isolation.test.ts`). Sin credenciales, la suite se omite.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_TEST_URL;
const ANON = process.env.SUPABASE_TEST_ANON_KEY;
const SERVICE = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const ready = Boolean(URL && ANON && SERVICE);

const pw = "Test1234!seguro";
const emailA = `mem-a-${Date.now()}@example.com`;
const emailB = `mem-b-${Date.now()}@example.com`;

describe.skipIf(!ready)("RLS · memoria personal del asesor (user_memory)", () => {
  let admin: SupabaseClient;
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let userAId = "";
  let userBId = "";
  let factAId = "";

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

    // MISMO HOGAR: A crea el hogar y mete a B como miembro activo. Todo lo demás que A registre
    // (gastos, metas, deudas) va a ser visible para B — su memoria personal NO.
    const { data: hid } = await clientA.rpc("ensure_household", { p_name: "Hogar de prueba" });
    if (hid) {
      await admin
        .from("household_members")
        .insert({ household_id: hid, user_id: userBId, role: "member", status: "active" });
    }

    const { data } = await clientA
      .from("user_memory")
      .insert({ user_id: userAId, fact: "Su esposa se llama Fernanda", category: "familia" })
      .select("id")
      .single();
    factAId = data?.id ?? "";
  });

  afterAll(async () => {
    if (!ready) return;
    if (userAId) await admin.auth.admin.deleteUser(userAId);
    if (userBId) await admin.auth.admin.deleteUser(userBId);
  });

  it("A puede guardar y leer su propia memoria", async () => {
    expect(factAId).not.toBe("");
    const { data } = await clientA.from("user_memory").select("*");
    expect((data ?? []).find((f) => f.id === factAId)).toBeTruthy();
  });

  it("B —del MISMO hogar— no ve la memoria de A", async () => {
    const { data } = await clientB.from("user_memory").select("*");
    expect((data ?? []).find((f) => f.id === factAId)).toBeUndefined();
  });

  it("B no puede editar el recuerdo de A", async () => {
    const { data } = await clientB
      .from("user_memory")
      .update({ fact: "hackeado" })
      .eq("id", factAId)
      .select();
    expect(data ?? []).toHaveLength(0);
  });

  it("B no puede borrar el recuerdo de A", async () => {
    const { data } = await clientB.from("user_memory").delete().eq("id", factAId).select();
    expect(data ?? []).toHaveLength(0);
    // Y sigue ahí para A.
    const { data: mio } = await clientA.from("user_memory").select("id").eq("id", factAId);
    expect(mio ?? []).toHaveLength(1);
  });

  it("B no puede escribir un recuerdo A NOMBRE de A", async () => {
    const { error } = await clientB
      .from("user_memory")
      .insert({ user_id: userAId, fact: "Odia a su jefe", category: "trabajo" });
    expect(error).not.toBeNull();
  });

  it("el cliente anónimo no lee nada", async () => {
    const anon = createClient(URL!, ANON!, { auth: { persistSession: false } });
    const { data } = await anon.from("user_memory").select("*");
    expect(data ?? []).toHaveLength(0);
  });

  it("A puede borrar TODA su memoria y queda vacía", async () => {
    await clientA
      .from("user_memory")
      .insert({ user_id: userAId, fact: "Trabaja por su cuenta", category: "trabajo" });
    const { error } = await clientA.from("user_memory").delete().eq("user_id", userAId);
    expect(error).toBeNull();
    const { data } = await clientA.from("user_memory").select("*");
    expect(data ?? []).toHaveLength(0);
  });
});

/**
 * Plan EFECTIVO del hogar (`effective_plan`, migración 20261026000001) contra un Supabase REAL.
 *
 * B-2: un miembro activo del hogar de un titular Max+ caía en el muro de «sin plan» porque los
 * muros leían solo su `profiles.plan`. Con su sesión no puede leer el plan del titular (la única
 * policy de lectura de `profiles` es la propia), así que el plan efectivo lo calcula una función
 * SECURITY DEFINER. Este archivo prueba sus reglas y su guardia:
 *  · hereda solo de un titular cuyo plan incluye hogar (max), solo con membresía `active`;
 *  · gana el mayor entre lo propio y lo heredado, sobre TODAS las membresías activas;
 *  · con sesión solo se consulta el plan propio; anon no puede ejecutarla.
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
const stamp = Date.now();

type Plan = "ninguno" | "esencial" | "pro" | "max";
type Rol = "owner" | "adult" | "member" | "viewer";
type Estado = "active" | "invited" | "removed";
type Usuario = { id: string; client: SupabaseClient };

describe.skipIf(!ready)("RLS · plan efectivo del hogar (effective_plan)", () => {
  let admin: SupabaseClient;
  const creados: string[] = [];
  let n = 0;

  /** Un usuario con sesión propia y el plan dado (el plan lo pone service-role, como el webhook). */
  async function usuario(plan: Plan): Promise<Usuario> {
    const email = `effplan-${stamp}-${n++}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: pw,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`no se pudo crear el usuario: ${error?.message}`);
    creados.push(data.user.id);
    await ponerPlan(data.user.id, plan);
    const client = createClient(URL!, ANON!, { auth: { persistSession: false } });
    const s = await client.auth.signInWithPassword({ email, password: pw });
    if (s.error) throw new Error(`no se pudo iniciar sesión: ${s.error.message}`);
    return { id: data.user.id, client };
  }

  async function ponerPlan(id: string, plan: Plan) {
    const { error } = await admin.from("profiles").update({ plan }).eq("id", id);
    if (error) throw new Error(`no se pudo poner el plan: ${error.message}`);
  }

  /** Un hogar con su titular como miembro owner activo (lo que deja ensure_household). */
  async function hogar(ownerId: string): Promise<string> {
    const { data, error } = await admin
      .from("households")
      .insert({ owner_id: ownerId, name: "Hogar de prueba" })
      .select("id")
      .single();
    if (error || !data) throw new Error(`no se pudo crear el hogar: ${error?.message}`);
    await miembro(data.id, ownerId, "owner", "active");
    return data.id as string;
  }

  async function miembro(householdId: string, userId: string, role: Rol, status: Estado) {
    const { error } = await admin
      .from("household_members")
      .upsert(
        { household_id: householdId, user_id: userId, role, status },
        { onConflict: "household_id,user_id" },
      );
    if (error) throw new Error(`no se pudo agregar el miembro: ${error.message}`);
  }

  /** El plan efectivo visto con la sesión de la propia persona. */
  async function efectivo(u: Usuario): Promise<string | null> {
    const { data, error } = await u.client.rpc("effective_plan");
    expect(error).toBeNull();
    return data as string | null;
  }

  beforeAll(() => {
    admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } });
  });

  afterAll(async () => {
    if (!ready) return;
    // households y household_members borran en cascada desde auth.users.
    for (const id of creados) await admin.auth.admin.deleteUser(id);
  });

  it("un miembro activo de un titular Max+ hereda max", async () => {
    const titular = await usuario("max");
    const m = await usuario("ninguno");
    await miembro(await hogar(titular.id), m.id, "adult", "active");
    expect(await efectivo(m)).toBe("max");
  });

  it("el rol no importa: member y viewer también heredan", async () => {
    const titular = await usuario("max");
    const h = await hogar(titular.id);
    const member = await usuario("ninguno");
    const viewer = await usuario("ninguno");
    await miembro(h, member.id, "member", "active");
    await miembro(h, viewer.id, "viewer", "active");
    expect(await efectivo(member)).toBe("max");
    expect(await efectivo(viewer)).toBe("max");
  });

  it("un titular sin plan con hogar (pro) no hereda nada: queda el plan propio", async () => {
    const titular = await usuario("pro");
    const m = await usuario("esencial");
    await miembro(await hogar(titular.id), m.id, "adult", "active");
    expect(await efectivo(m)).toBe("esencial");
  });

  it("si el titular baja de max, el miembro pierde la herencia en la siguiente consulta", async () => {
    const titular = await usuario("max");
    const m = await usuario("ninguno");
    await miembro(await hogar(titular.id), m.id, "adult", "active");
    expect(await efectivo(m)).toBe("max");
    await ponerPlan(titular.id, "pro");
    expect(await efectivo(m)).toBe("ninguno");
    await ponerPlan(titular.id, "ninguno");
    expect(await efectivo(m)).toBe("ninguno");
  });

  it("invited y removed no heredan", async () => {
    const titular = await usuario("max");
    const h = await hogar(titular.id);
    const invitado = await usuario("ninguno");
    const removido = await usuario("pro");
    await miembro(h, invitado.id, "adult", "invited");
    await miembro(h, removido.id, "adult", "removed");
    expect(await efectivo(invitado)).toBe("ninguno");
    expect(await efectivo(removido)).toBe("pro");
  });

  it("si el titular borra su cuenta, el miembro vuelve a su plan propio", async () => {
    const titular = await usuario("max");
    const m = await usuario("ninguno");
    await miembro(await hogar(titular.id), m.id, "adult", "active");
    expect(await efectivo(m)).toBe("max");
    const { error } = await admin.auth.admin.deleteUser(titular.id);
    expect(error).toBeNull();
    expect(await efectivo(m)).toBe("ninguno");
  });

  it("gana el mayor: plan propio pro con titular max da max", async () => {
    const titular = await usuario("max");
    const m = await usuario("pro");
    await miembro(await hogar(titular.id), m.id, "adult", "active");
    expect(await efectivo(m)).toBe("max");
  });

  it("sin hogar, el plan efectivo es el propio (también el del propio titular)", async () => {
    const solo = await usuario("esencial");
    expect(await efectivo(solo)).toBe("esencial");
    const titular = await usuario("max");
    await hogar(titular.id);
    expect(await efectivo(titular)).toBe("max");
  });

  it("en varios hogares gana el máximo, aunque también sea owner de su propio hogar", async () => {
    const titularMax = await usuario("max");
    const titularPro = await usuario("pro");
    const m = await usuario("ninguno");
    // Su propio hogar (lo crea ensure_household la primera vez que invita a alguien).
    await hogar(m.id);
    await miembro(await hogar(titularPro.id), m.id, "adult", "active");
    await miembro(await hogar(titularMax.id), m.id, "member", "active");
    expect(await efectivo(m)).toBe("max");
  });

  it("con sesión no se puede consultar el plan de otro: devuelve null", async () => {
    const titular = await usuario("max");
    const m = await usuario("ninguno");
    await miembro(await hogar(titular.id), m.id, "adult", "active");
    const deOtro = await m.client.rpc("effective_plan", { p_user: titular.id });
    expect(deOtro.error).toBeNull();
    expect(deOtro.data).toBeNull();
    const propio = await m.client.rpc("effective_plan", { p_user: m.id });
    expect(propio.data).toBe("max");
  });

  it("el miembro sigue sin poder leer el profiles del titular", async () => {
    const titular = await usuario("max");
    const m = await usuario("ninguno");
    await miembro(await hogar(titular.id), m.id, "adult", "active");
    const { data } = await m.client.from("profiles").select("id, plan").eq("id", titular.id);
    expect(data ?? []).toHaveLength(0);
  });

  it("service-role puede consultar cualquier id (assertTokenBudget)", async () => {
    const titular = await usuario("max");
    const m = await usuario("ninguno");
    await miembro(await hogar(titular.id), m.id, "adult", "active");
    const { data, error } = await admin.rpc("effective_plan", { p_user: m.id });
    expect(error).toBeNull();
    expect(data).toBe("max");
  });

  it("anon no puede ejecutarla", async () => {
    const titular = await usuario("max");
    const anon = createClient(URL!, ANON!, { auth: { persistSession: false } });
    const { data, error } = await anon.rpc("effective_plan", { p_user: titular.id });
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});

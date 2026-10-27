/**
 * Plan del TITULAR del hogar activo (`household_owner_plan`, migración 20261026000002) contra
 * un Supabase REAL. Es lo que define el cupo del hogar: lo que paga el titular, no el plan de
 * quien mira ni el plan efectivo del titular.
 *
 * Reglas que se prueban:
 *  · sin parámetros: el hogar sale de la sesión; solo con membresía `active` devuelve algo;
 *  · el hogar activo es el de resolveActiveMembership (owner primero, si no el más antiguo);
 *  · un titular Pro+ que es miembro de un hogar Max+ ajeno ve `pro` (su hogar), no `max`;
 *  · anon no puede ejecutarla.
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

describe.skipIf(!ready)("RLS · plan del titular del hogar (household_owner_plan)", () => {
  let admin: SupabaseClient;
  const creados: string[] = [];
  let n = 0;

  /** Un usuario con sesión propia y el plan dado (el plan lo pone service-role, como el webhook). */
  async function usuario(plan: Plan): Promise<Usuario> {
    const email = `ownerplan-${stamp}-${n++}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: pw,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`no se pudo crear el usuario: ${error?.message}`);
    creados.push(data.user.id);
    const up = await admin.from("profiles").update({ plan }).eq("id", data.user.id);
    if (up.error) throw new Error(`no se pudo poner el plan: ${up.error.message}`);
    const client = createClient(URL!, ANON!, { auth: { persistSession: false } });
    const s = await client.auth.signInWithPassword({ email, password: pw });
    if (s.error) throw new Error(`no se pudo iniciar sesión: ${s.error.message}`);
    return { id: data.user.id, client };
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

  async function planTitular(u: Usuario): Promise<string | null> {
    const { data, error } = await u.client.rpc("household_owner_plan");
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

  it("el titular ve su propio plan", async () => {
    const titular = await usuario("max");
    await hogar(titular.id);
    expect(await planTitular(titular)).toBe("max");
  });

  it("un adult activo ve el plan del titular, no el suyo", async () => {
    const titular = await usuario("max");
    const adult = await usuario("ninguno");
    await miembro(await hogar(titular.id), adult.id, "adult", "active");
    expect(await planTitular(adult)).toBe("max");
  });

  it("si el titular tiene Pro+, el adult ve pro aunque él tenga max", async () => {
    const titular = await usuario("pro");
    const adult = await usuario("max");
    await miembro(await hogar(titular.id), adult.id, "adult", "active");
    expect(await planTitular(adult)).toBe("pro");
  });

  it("member y viewer activos también ven el plan del titular", async () => {
    const titular = await usuario("max");
    const h = await hogar(titular.id);
    const member = await usuario("ninguno");
    const viewer = await usuario("esencial");
    await miembro(h, member.id, "member", "active");
    await miembro(h, viewer.id, "viewer", "active");
    expect(await planTitular(member)).toBe("max");
    expect(await planTitular(viewer)).toBe("max");
  });

  it("invited y removed (sin otra membresía activa) → null", async () => {
    const titular = await usuario("max");
    const h = await hogar(titular.id);
    const invitado = await usuario("pro");
    const removido = await usuario("pro");
    await miembro(h, invitado.id, "adult", "invited");
    await miembro(h, removido.id, "adult", "removed");
    expect(await planTitular(invitado)).toBeNull();
    expect(await planTitular(removido)).toBeNull();
  });

  it("usuario sin hogar → null", async () => {
    const solo = await usuario("max");
    expect(await planTitular(solo)).toBeNull();
  });

  it("titular Pro+ que es miembro de un hogar Max+ ajeno → pro (su hogar gana, owner primero)", async () => {
    const titularMax = await usuario("max");
    const titularPro = await usuario("pro");
    // La membresía en el hogar Max+ es MÁS ANTIGUA que su propio hogar: aun así gana el
    // hogar donde es owner, igual que en resolveActiveMembership.
    await miembro(await hogar(titularMax.id), titularPro.id, "adult", "active");
    await hogar(titularPro.id);
    expect(await planTitular(titularPro)).toBe("pro");
  });

  it("sin hogar propio, en dos hogares ajenos → el de la membresía más antigua", async () => {
    const titularPro = await usuario("pro");
    const titularMax = await usuario("max");
    const m = await usuario("ninguno");
    await miembro(await hogar(titularPro.id), m.id, "adult", "active");
    await miembro(await hogar(titularMax.id), m.id, "adult", "active");
    expect(await planTitular(m)).toBe("pro");
  });

  it("anon no puede ejecutarla", async () => {
    const anon = createClient(URL!, ANON!, { auth: { persistSession: false } });
    const { data, error } = await anon.rpc("household_owner_plan");
    expect(error).not.toBeNull();
    expect(data).toBeNull();
  });
});

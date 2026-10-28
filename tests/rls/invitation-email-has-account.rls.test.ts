/**
 * ¿El correo de la invitación ya tiene cuenta? (`invitation_email_has_account`, migración
 * 20261027000001) contra un Supabase REAL. La usa /invitacion/aceptar SIN sesión para poner
 * «Iniciar sesión y unirme» como botón principal.
 *
 * Reglas que se prueban:
 *  · pendiente y vigente, correo con cuenta → true (sin importar mayúsculas);
 *  · pendiente y vigente, correo sin cuenta → false;
 *  · expirada, aceptada o revocada → false aunque el correo tenga cuenta;
 *  · token inexistente → false, nunca un error;
 *  · funciona con anon (quien abre el enlace no tiene sesión).
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

type Estado = "pending" | "accepted" | "revoked";

describe.skipIf(!ready)("RLS · invitation_email_has_account", () => {
  let admin: SupabaseClient;
  let anon: SupabaseClient;
  let householdId: string;
  let titularId: string;
  const creados: string[] = [];
  let n = 0;

  async function cuenta(): Promise<string> {
    const email = `invcuenta-${stamp}-${n++}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: pw,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`no se pudo crear el usuario: ${error?.message}`);
    creados.push(data.user.id);
    return email;
  }

  /** Una invitación del hogar de prueba; devuelve su token. */
  async function invitacion(
    email: string,
    { status = "pending", expirada = false }: { status?: Estado; expirada?: boolean } = {},
  ): Promise<string> {
    const { data, error } = await admin
      .from("household_invitations")
      .insert({
        household_id: householdId,
        email,
        invited_by: titularId,
        status,
        ...(expirada ? { expires_at: new Date(Date.now() - 86_400_000).toISOString() } : {}),
      })
      .select("token")
      .single();
    if (error || !data) throw new Error(`no se pudo crear la invitación: ${error?.message}`);
    return data.token as string;
  }

  async function tieneCuenta(token: string, client: SupabaseClient = anon) {
    const { data, error } = await client.rpc("invitation_email_has_account", { p_token: token });
    expect(error).toBeNull();
    return data as boolean;
  }

  beforeAll(async () => {
    if (!ready) return;
    admin = createClient(URL!, SERVICE!, { auth: { persistSession: false } });
    anon = createClient(URL!, ANON!, { auth: { persistSession: false } });
    const { data, error } = await admin.auth.admin.createUser({
      email: `invtitular-${stamp}@example.com`,
      password: pw,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`no se pudo crear el titular: ${error?.message}`);
    titularId = data.user.id;
    creados.push(titularId);
    const h = await admin
      .from("households")
      .insert({ owner_id: titularId, name: "Hogar de prueba" })
      .select("id")
      .single();
    if (h.error || !h.data) throw new Error(`no se pudo crear el hogar: ${h.error?.message}`);
    householdId = h.data.id as string;
  });

  afterAll(async () => {
    if (!ready) return;
    // households (y sus invitaciones) borran en cascada desde auth.users.
    for (const id of creados) await admin.auth.admin.deleteUser(id);
  });

  it("pendiente y el correo tiene cuenta → true", async () => {
    expect(await tieneCuenta(await invitacion(await cuenta()))).toBe(true);
  });

  it("el correo invitado en otras mayúsculas también cuenta → true", async () => {
    const email = await cuenta();
    expect(await tieneCuenta(await invitacion(email.toUpperCase()))).toBe(true);
  });

  it("pendiente y el correo no tiene cuenta → false", async () => {
    expect(await tieneCuenta(await invitacion(`sin-cuenta-${stamp}@example.com`))).toBe(false);
  });

  it("expirada → false aunque el correo tenga cuenta", async () => {
    expect(await tieneCuenta(await invitacion(await cuenta(), { expirada: true }))).toBe(false);
  });

  it("aceptada o revocada → false aunque el correo tenga cuenta", async () => {
    expect(await tieneCuenta(await invitacion(await cuenta(), { status: "accepted" }))).toBe(false);
    expect(await tieneCuenta(await invitacion(await cuenta(), { status: "revoked" }))).toBe(false);
  });

  it("token inexistente → false, sin error", async () => {
    expect(await tieneCuenta("00000000-0000-4000-8000-000000000000")).toBe(false);
  });

  it("con sesión (authenticated) también responde", async () => {
    const email = await cuenta();
    const token = await invitacion(email);
    const client = createClient(URL!, ANON!, { auth: { persistSession: false } });
    const s = await client.auth.signInWithPassword({ email, password: pw });
    expect(s.error).toBeNull();
    expect(await tieneCuenta(token, client)).toBe(true);
  });
});

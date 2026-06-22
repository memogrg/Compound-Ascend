/**
 * Seed del usuario de prueba E2E para CI (Supabase efímero del runner).
 * Crea (idempotente) el usuario y lo deja con sesión lista para el smoke.
 * Usa service-role del Supabase LOCAL del runner — nunca toca producción.
 *
 * Env requeridas (las exporta el job de CI desde `supabase status -o env`):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   E2E_EMAIL, E2E_PASSWORD
 */
import { createClient } from "@supabase/supabase-js";

/** Quita comillas y espacios envolventes (defensa ante exports tipo KEY="val"). */
const clean = (v) => v?.trim().replace(/^["']|["']$/g, "");

const url = clean(process.env.SUPABASE_URL);
const serviceKey = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
const email = process.env.E2E_EMAIL ?? "e2e@ci.local";
const password = process.env.E2E_PASSWORD;

if (!url || !serviceKey || !password) {
  console.error("Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / E2E_PASSWORD");
  process.exit(1);
}

if (!/^https?:\/\//i.test(url)) {
  // Causa típica: el valor llegó con comillas literales desde GITHUB_ENV (issue #94).
  console.error(`SUPABASE_URL inválida (debe empezar con http(s)://). Recibido: ${JSON.stringify(url)}`);
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data: created, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { display_name: "E2E Bot" },
});

let userId = created?.user?.id;
if (error) {
  if (!/already (been )?registered|exists/i.test(error.message)) {
    console.error("createUser falló:", error.message);
    process.exit(1);
  }
  // Ya existe: recupera su id paginando la lista.
  const { data: list } = await admin.auth.admin.listUsers();
  userId = list?.users.find((u) => u.email === email)?.id;
  console.log("Usuario E2E ya existía, reutilizado.");
} else {
  console.log("Usuario E2E creado.");
}

if (!userId) {
  console.error("No se pudo resolver el id del usuario E2E.");
  process.exit(1);
}

// Marca onboarding completo para que /dashboard no redirija a /bienvenida.
await admin.from("profiles").upsert(
  { id: userId, display_name: "E2E Bot", onboarding_completed: true },
  { onConflict: "id" },
);

// Una fuente de ingreso mínima para que el dashboard tenga datos: sin ella,
// health.hasData es false e /dashboard renderiza el EmptyState en vez del HERO
// ("Flujo de caja mensual"), y el smoke falla. amount_monthly_base alimenta
// directamente incomeMonthly (moneda CRC = display por defecto, sin FX).
const { data: memberships } = await admin
  .from("household_members")
  .select("household_id, role")
  .eq("user_id", userId)
  .eq("status", "active")
  .order("created_at", { ascending: true });
const householdId =
  memberships?.find((m) => m.role === "owner")?.household_id ?? memberships?.[0]?.household_id ?? null;

const { data: existingIncome } = await admin
  .from("income_sources")
  .select("id")
  .eq("user_id", userId)
  .limit(1);
if (!existingIncome || existingIncome.length === 0) {
  const { error: incomeError } = await admin.from("income_sources").insert({
    user_id: userId,
    household_id: householdId,
    name: "Salario E2E",
    income_type: "activo",
    amount: 1_000_000,
    currency: "CRC",
    frequency: "mensual",
    is_fixed: true,
    owner_scope: "usuario",
    include_in_budget: true,
    amount_monthly_base: 1_000_000,
  });
  if (incomeError) {
    console.error("Seed de ingreso falló:", incomeError.message);
    process.exit(1);
  }
  console.log("Ingreso E2E creado.");
}

console.log("Seed E2E listo:", email);

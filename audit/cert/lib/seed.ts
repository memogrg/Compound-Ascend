/**
 * Service-role seeding for the cert harness — mirrors the pattern of `sim/harness.ts`
 * `createSimUser` (create user → sign in → ensure_household → pin currency/tz), plus
 * `onboarding_completed` so the real-UI login lands on /dashboard (not /bienvenida).
 *
 * Phase 2 seeds ONLY the user + onboarding. Journey preconditions (a debt to pay, a
 * holding to buy) are deferred to Phase 5/6 and MUST be built on the app's own
 * services/app-driver — never raw service-role INSERTs — so a half-written row can't
 * produce a false red or mask a real bug.
 *
 * Untyped client on purpose: this is test-only plumbing (like scripts/seed-e2e-user.mjs),
 * kept free of any `@/*` app import so the Playwright process never loads server-only code.
 */
import WebSocket from "ws";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { TEST } from "./env";

// supabase-js initializes Realtime in createClient and needs a global WebSocket
// (native on Node 22+, absent on older). Same defense as sim/setup.ts.
const g = globalThis as unknown as { WebSocket?: unknown };
if (!g.WebSocket) g.WebSocket = WebSocket;

/** Known password so the setup spec can type it into the REAL login form. */
export const CERT_PASSWORD = "CertUser1234!seguro";

/** Single currency (CRC) → convertCurrency is identity, FX-independent. Same as the sim. */
export const CERT_CURRENCY = "CRC";

export interface CertUser {
  userId: string;
  email: string;
  password: string;
  householdId: string | null;
}

/** A service-role admin client against the TEST project (never prod). */
export function certAdmin(): SupabaseClient {
  return createClient(TEST.url, TEST.serviceKey, { auth: { persistSession: false } });
}

/**
 * Create + seed a fresh synthetic user in the TEST project. `runId` keeps the email
 * unique per run so reruns never collide. Returns the ids the journeys need for the
 * service-role confirmation reads.
 *
 * `opts.onboarding` (default true): seed the profile as onboarding-completed so the
 * real-UI login lands on /dashboard. Pass `false` for the onboarding journey — the user
 * is left NOT onboarded so the app's gate redirects it to the wizard (/bienvenida), and
 * the wizard itself writes the DNA + flips onboarding_completed (asserted afterwards).
 */
export async function createCertUser(
  runId: string,
  opts: { onboarding?: boolean } = {},
): Promise<CertUser> {
  const onboarding = opts.onboarding ?? true;
  const admin = certAdmin();
  const email = `cert-${runId}@example.com`;

  const created = await admin.auth.admin.createUser({
    email,
    password: CERT_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: "Cert Bot" },
  });
  if (created.error || !created.data.user) {
    throw new Error(`[cert] createUser falló: ${created.error?.message ?? "sin usuario"}`);
  }
  const userId = created.data.user.id;

  // Sign in a scoped (anon-key) client to call ensure_household AS the user
  // (SECURITY DEFINER on auth.uid()) and to pin its settings under RLS.
  const scoped = createClient(TEST.url, TEST.anonKey, { auth: { persistSession: false } });
  const signIn = await scoped.auth.signInWithPassword({ email, password: CERT_PASSWORD });
  if (signIn.error) throw new Error(`[cert] signInWithPassword falló: ${signIn.error.message}`);

  const eh = await scoped.rpc("ensure_household", { p_name: "Casa Cert" });
  if (eh.error) throw new Error(`[cert] ensure_household falló: ${eh.error.message}`);

  const upd = await scoped
    .from("user_settings")
    .update({ primary_currency: CERT_CURRENCY, timezone: "UTC" })
    .eq("user_id", userId);
  if (upd.error) throw new Error(`[cert] user_settings.update falló: ${upd.error.message}`);

  // Onboarding done → /dashboard renders instead of redirecting to /bienvenida.
  // For the onboarding journey we DON'T set this (nor display_name): the wizard writes
  // both, and we assert the wizard's values afterwards (proof the DNA persisted).
  if (onboarding) {
    const prof = await admin
      .from("profiles")
      .update({ onboarding_completed: true, display_name: "Cert Bot" })
      .eq("id", userId);
    if (prof.error) throw new Error(`[cert] profiles.update falló: ${prof.error.message}`);
  }

  const householdId = await resolveHouseholdId(admin, userId);

  return { userId, email, password: CERT_PASSWORD, householdId };
}

/** Same rule as getActiveHouseholdId: owner household if any, else oldest active. */
export async function resolveHouseholdId(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("household_members")
    .select("household_id, role")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (!data || data.length === 0) return null;
  const owned = data.find((m: { role: string }) => m.role === "owner");
  return (owned ?? data[0])?.household_id ?? null;
}

/** Cascade-delete the synthetic user (and all its rows) from the TEST project. */
export async function deleteCertUser(userId: string): Promise<void> {
  await certAdmin().auth.admin.deleteUser(userId);
}

/** A persisted row as the confirmation read cares about it. */
export interface ConfirmedRow {
  amount: number;
  currency: string;
  household_id: string | null;
  label: string | null;
}

/** The income SOURCE lands in budget_items (kind income). Matched by user + name. */
export async function findIncomeRow(
  admin: SupabaseClient,
  userId: string,
  name: string,
): Promise<ConfirmedRow | null> {
  const { data } = await admin
    .from("budget_items")
    .select("amount, currency, household_id, name")
    .eq("user_id", userId)
    .eq("name", name)
    .limit(1);
  const row = data?.[0];
  if (!row) return null;
  return {
    amount: Number(row.amount),
    currency: String(row.currency),
    household_id: row.household_id ?? null,
    label: row.name ?? null,
  };
}

/**
 * The expense lands in transactions (kind gasto). Web stores the typed name in
 * merchant_or_source, so does mobile — but match either field in JS (no PostgREST
 * `.or` quoting) to stay robust across surfaces.
 */
export async function findExpenseRow(
  admin: SupabaseClient,
  userId: string,
  name: string,
): Promise<ConfirmedRow | null> {
  const { data } = await admin
    .from("transactions")
    .select("amount, currency, household_id, merchant_or_source, description, kind")
    .eq("user_id", userId)
    .eq("kind", "gasto")
    .limit(50);
  const row = (data ?? []).find(
    (r: { merchant_or_source: string | null; description: string | null }) =>
      r.merchant_or_source === name || r.description === name,
  );
  if (!row) return null;
  return {
    amount: Number(row.amount),
    currency: String(row.currency),
    household_id: row.household_id ?? null,
    label: row.merchant_or_source ?? row.description ?? null,
  };
}

/** DNA persisted by the onboarding wizard (profiles + personal_profiles). */
export interface ProfileConfirmation {
  onboardingCompleted: boolean;
  displayName: string | null;
  profileCompletion: number | null;
  financialNucleus: string | null;
}

/**
 * Read what the onboarding wizard wrote: `profiles` (onboarding flag + name + completion)
 * and the `personal_profiles` DNA row (financial_nucleus). Used by the onboarding journey
 * to prove the DATA persisted — not just the boolean flag.
 */
export async function findProfile(
  admin: SupabaseClient,
  userId: string,
): Promise<ProfileConfirmation | null> {
  const { data: prof } = await admin
    .from("profiles")
    .select("onboarding_completed, display_name, profile_completion")
    .eq("id", userId)
    .limit(1);
  const p = prof?.[0];
  if (!p) return null;
  const { data: pp } = await admin
    .from("personal_profiles")
    .select("financial_nucleus")
    .eq("user_id", userId)
    .limit(1);
  return {
    onboardingCompleted: Boolean(p.onboarding_completed),
    displayName: p.display_name ?? null,
    profileCompletion: p.profile_completion == null ? null : Number(p.profile_completion),
    financialNucleus: pp?.[0]?.financial_nucleus ?? null,
  };
}

/**
 * Sum of confirmed expenses (transactions, kind gasto) for the user in the CURRENT month
 * — the same period the dashboard's "Flujo del mes" derives from. Used as the BD gate that
 * the expense is REFLECTED in the period total (not the ambiguous scraped number).
 */
export async function periodExpenseTotal(
  admin: SupabaseClient,
  userId: string,
  monthStartISO: string,
): Promise<number> {
  const { data } = await admin
    .from("transactions")
    .select("amount, kind, occurred_on")
    .eq("user_id", userId)
    .eq("kind", "gasto")
    .gte("occurred_on", monthStartISO)
    .limit(500);
  return (data ?? []).reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0);
}

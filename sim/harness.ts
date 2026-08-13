/**
 * DB harness (same pattern as `tests/rls/isolation.test.ts`): create a synthetic
 * user in the TEST project, sign in, seed the household, pin a deterministic
 * single currency + UTC timezone, and hand back an injected `AuthContext` whose
 * `db` is the RLS-scoped signed-in client. Reset = cascade `deleteUser`.
 *
 * NEVER production: the caller gates on `SIM_DB_READY` (all `SUPABASE_TEST_*`
 * present) before constructing a harness.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { AuthContext } from "@/lib/auth/auth-context";
import { TEST_ENV } from "./env";
import type { EventLog } from "./event-log";

const PASSWORD = "SimUser1234!seguro";

export interface SimUser {
  ctx: AuthContext;
  email: string;
  /** Cascade-delete the synthetic user (and all its rows) from the TEST project. */
  teardown(): Promise<void>;
}

/**
 * Create + sign in a fresh synthetic user and seed its household + currency.
 * `nowStamp` (real wall clock) makes the email unique per run so parallel/rerun
 * invocations never collide; the virtual clock governs the simulated timeline.
 */
export async function createSimUser(opts: {
  seed: number;
  currency: string;
  nowStamp: number;
  log: EventLog;
}): Promise<SimUser> {
  const { url, anonKey, serviceKey } = TEST_ENV;
  const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });
  const email = `sim-${opts.seed}-${opts.nowStamp}@example.com`;

  const created = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw new Error(`createUser falló: ${created.error?.message ?? "sin usuario"}`);
  }
  const userId = created.data.user.id;

  const db = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
  const signIn = await db.auth.signInWithPassword({ email, password: PASSWORD });
  if (signIn.error) throw new Error(`signInWithPassword falló: ${signIn.error.message}`);

  const ctx: AuthContext = { db, userId };

  // Household: the signup trigger creates profiles + user_settings but NOT a
  // household. ensure_household (SECURITY DEFINER, auth.uid()) seeds it
  // idempotently as the signed-in user.
  const eh = await db.rpc("ensure_household", { p_name: "Casa Sim" });
  if (eh.error) throw new Error(`ensure_household falló: ${eh.error.message}`);

  // Determinism: pin the primary currency (single-currency run → convertCurrency
  // is identity, FX-rate-independent) and timezone UTC (userToday == the virtual
  // UTC date). If the row is missing the update no-ops and the defaults still hold.
  const upd = await db
    .from("user_settings")
    .update({ primary_currency: opts.currency, timezone: "UTC" })
    .eq("user_id", userId);
  if (upd.error) throw new Error(`user_settings.update falló: ${upd.error.message}`);

  opts.log.record("info", `usuario sintético creado (${email}) · household + moneda ${opts.currency} + tz UTC`);

  return {
    ctx,
    email,
    teardown: async () => {
      await admin.auth.admin.deleteUser(userId);
    },
  };
}

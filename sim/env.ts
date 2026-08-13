/**
 * TEST-only Supabase credentials for the simulation harness. NEVER production.
 * The whole runner is gated on all three being present; without them the slice
 * self-skips (same contract as `tests/rls`), so `npm test` and this runner stay
 * green on a machine with no test DB.
 */
export const TEST_ENV = {
  url: process.env.SUPABASE_TEST_URL ?? "",
  anonKey: process.env.SUPABASE_TEST_ANON_KEY ?? "",
  serviceKey: process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? "",
} as const;

/** True only when all three TEST creds are present — the gate for the runner. */
export const SIM_DB_READY = Boolean(TEST_ENV.url && TEST_ENV.anonKey && TEST_ENV.serviceKey);

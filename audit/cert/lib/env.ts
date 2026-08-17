/**
 * Test-DB credentials + the fail-fast guard for the cert E2E harness.
 *
 * Loads `.env.local` from the repo root (same file `next dev` reads) exactly like
 * Next would — WITHOUT overriding anything already in process.env — so this module
 * sees both the TEST creds (`SUPABASE_TEST_*`) and the PROD url
 * (`NEXT_PUBLIC_SUPABASE_URL`). The harness NEVER runs against prod: `assertTestDb()`
 * aborts unless all three TEST creds are present AND the TEST url differs from prod.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Repo root. `npm run cert:e2e` always runs from the package dir, and Playwright keeps
 * that cwd in the config and every worker — so process.cwd() is the repo root. (Avoids
 * import.meta.url, which Playwright's CJS config loader can't evaluate.)
 */
export const REPO_ROOT = process.cwd();

/**
 * Minimal .env loader (no dependency on Next internals): parse KEY=VALUE lines and set
 * them into process.env WITHOUT overriding anything already set — same precedence Next
 * uses. Populates the Playwright process so the guard/seed/config can read the TEST creds
 * and the prod url. Idempotent per worker.
 */
function loadEnvFile(file: string): void {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || key in process.env) continue;
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

loadEnvFile(join(REPO_ROOT, ".env.local"));

export const TEST = {
  url: process.env.SUPABASE_TEST_URL ?? "",
  anonKey: process.env.SUPABASE_TEST_ANON_KEY ?? "",
  serviceKey: process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? "",
} as const;

/** The prod url baked into .env.local — the thing we must never point the browser at. */
export const PROD_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/** Supabase project ref = the sub-domain of a hosted project url (issued auth cookie is `sb-<ref>-auth-token`). */
export function projectRef(url: string): string {
  try {
    return new URL(url).host.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

/**
 * Fail-fast: refuse to run unless the three TEST creds exist AND the TEST url is a
 * DIFFERENT project than prod. Called at the very top of the setup spec, before any
 * user is created or any page is opened.
 */
export function assertTestDb(): void {
  const missing = (
    [
      ["SUPABASE_TEST_URL", TEST.url],
      ["SUPABASE_TEST_ANON_KEY", TEST.anonKey],
      ["SUPABASE_TEST_SERVICE_ROLE_KEY", TEST.serviceKey],
    ] as const
  )
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(
      `[cert] Faltan credenciales de la BD de PRUEBA: ${missing.join(", ")}. ` +
        `El harness solo corre contra SUPABASE_TEST_* (nunca prod).`,
    );
  }
  if (PROD_SUPABASE_URL && projectRef(TEST.url) === projectRef(PROD_SUPABASE_URL)) {
    throw new Error(
      `[cert] SUPABASE_TEST_URL apunta al MISMO proyecto que NEXT_PUBLIC_SUPABASE_URL (prod). ` +
        `Abortado: el harness nunca debe tocar producción.`,
    );
  }
}

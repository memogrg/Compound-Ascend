/**
 * Setup project (runs once before the journeys): fail-fast guard → seed the ephemeral
 * user → REAL-UI login on both surfaces → save storageState → write the run context.
 *
 * The cookie assertion is the EXPLICIT proof that the dev server's env override worked:
 * the browser was authenticated against the TEST project (cookie `sb-<testRef>-…`) and
 * NOT prod. Login is a server action, so the Supabase call is server-side — the issued
 * auth cookie is the observable that proves which DB the dev server used.
 */
import { test as setup, expect, type BrowserContext } from "@playwright/test";
import { assertTestDb, TEST, PROD_SUPABASE_URL, projectRef } from "./lib/env";
import { IPHONE } from "./lib/devices";
import { createCertUser } from "./lib/seed";
import { writeContext, WEB_STORAGE, MOBILE_STORAGE, AUTH_DIR, ensureDir } from "./lib/context";
import { loginWeb, loginMobile } from "./pods/login";

/** Names of every cookie + localStorage key the context holds (Supabase uses `sb-<ref>-…`). */
async function authKeyNames(context: BrowserContext): Promise<string[]> {
  const state = await context.storageState();
  const cookieNames = state.cookies.map((c) => c.name);
  const lsNames = state.origins.flatMap((o) => o.localStorage.map((e) => e.name));
  return [...cookieNames, ...lsNames];
}

/** Assert the session was issued by the TEST project and not prod. */
async function assertAuthedAgainstTest(
  context: BrowserContext,
  testRef: string,
  prodRef: string,
): Promise<void> {
  const names = await authKeyNames(context);
  const hasTest = names.some((n) => n.startsWith(`sb-${testRef}-`));
  const hasProd = Boolean(prodRef) && names.some((n) => n.startsWith(`sb-${prodRef}-`));
  expect(
    hasTest,
    `El navegador debía autenticarse contra TEST (cookie sb-${testRef}-*). Claves: ${names.join(", ") || "(ninguna)"}`,
  ).toBeTruthy();
  expect(
    hasProd,
    `¡Sesión de PROD detectada (sb-${prodRef}-*)! El dev server NO está apuntando a la BD de prueba.`,
  ).toBeFalsy();
}

setup("guard + seed + logins reales (web + móvil) + storageState", async ({ page, browser }) => {
  setup.setTimeout(180_000);

  // Never prod: aborts if TEST creds are missing or point at the prod project.
  assertTestDb();

  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const testRef = projectRef(TEST.url);
  const prodRef = projectRef(PROD_SUPABASE_URL);

  const user = await createCertUser(runId);
  ensureDir(AUTH_DIR);

  // 1) WEB login on the default (desktop) context.
  await loginWeb(page, { email: user.email, password: user.password });
  await assertAuthedAgainstTest(page.context(), testRef, prodRef);
  await page.context().storageState({ path: WEB_STORAGE });

  // 2) MOBILE login on an emulated iPhone context.
  const mctx = await browser.newContext({ ...IPHONE });
  try {
    const mpage = await mctx.newPage();
    await loginMobile(mpage, { email: user.email, password: user.password });
    await assertAuthedAgainstTest(mctx, testRef, prodRef);
    await mctx.storageState({ path: MOBILE_STORAGE });
  } finally {
    await mctx.close();
  }

  writeContext({
    runId,
    userId: user.userId,
    email: user.email,
    password: user.password,
    householdId: user.householdId,
    testRef,
    prodRef,
  });
});

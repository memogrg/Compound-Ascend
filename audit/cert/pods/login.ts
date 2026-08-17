/**
 * Real-UI login (NOT a programmatic session): the setup project drives the actual
 * /login and /m/login forms so the harness also certifies the login flow, and the
 * journeys run on a real browser session (storageState). Selectors centralized here.
 */
import { type Page } from "@playwright/test";

/** Left the /m/login route for the mobile home (/m or any /m/* except /m/login). */
function isMobileHome(url: URL): boolean {
  const p = url.pathname;
  return p === "/m" || (p.startsWith("/m/") && !p.startsWith("/m/login"));
}

export interface Credentials {
  email: string;
  password: string;
}

/**
 * Web login (/login → /dashboard). Keeps the smoke's 3-try retry: in dev the first
 * submit can be swallowed (server action recompiled in flight). `#password` (not
 * getByLabel) because the visibility toggle's "Mostrar contraseña" collides with the
 * label substring — see TESTID-CANDIDATES.md.
 */
export async function loginWeb(page: Page, creds: Credentials): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle"); // wait for useActionState hydration
  await page.getByLabel("Correo").fill(creds.email);
  await page.locator("#password").fill(creds.password);
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    try {
      await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
      return;
    } catch {
      if (attempt === 2) throw new Error("[cert] login web no navegó tras 3 intentos");
      await page.waitForTimeout(1000);
    }
  }
}

/**
 * Mobile login (/m/login → /m). The mobile form has no visibility toggle, so the
 * accessible labels are unambiguous.
 */
export async function loginMobile(page: Page, creds: Credentials): Promise<void> {
  await page.goto("/m/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Correo").fill(creds.email);
  await page.getByLabel("Contraseña").fill(creds.password);
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    try {
      await page.waitForURL((url) => isMobileHome(url), { timeout: 20_000 });
      return;
    } catch {
      if (attempt === 2) throw new Error("[cert] login móvil no navegó tras 3 intentos");
      await page.waitForTimeout(1000);
    }
  }
}

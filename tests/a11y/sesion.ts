/**
 * Inicio de sesión compartido por los specs de accesibilidad.
 *
 * Estaba dentro de `routes.spec.ts`; se extrajo tal cual —sin cambios de comportamiento—
 * cuando apareció el segundo spec, para no tener dos copias del mismo login divergiendo.
 */
import { expect, type Page } from "@playwright/test";

/** Una sola sesión para todas las rutas con auth: se reutiliza vía `storageState`. */
export async function iniciarSesion(page: Page): Promise<void> {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  expect(email, "falta E2E_EMAIL").toBeTruthy();
  expect(password, "falta E2E_PASSWORD").toBeTruthy();

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Correo").fill(email!);
  // #password y no getByLabel: el toggle de visibilidad también matchea "Contraseña".
  await page.locator("#password").fill(password!);
  for (let intento = 0; intento < 3; intento++) {
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    try {
      await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
      return;
    } catch {
      if (intento === 2) throw new Error("Login no navegó tras 3 intentos");
      await page.waitForTimeout(1000);
    }
  }
}

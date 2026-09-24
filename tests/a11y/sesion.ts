/**
 * Inicio de sesión compartido por los specs de accesibilidad.
 *
 * Estaba dentro de `routes.spec.ts`; se extrajo tal cual —sin cambios de comportamiento—
 * cuando apareció el segundo spec, para no tener dos copias del mismo login divergiendo.
 *
 * Desde el `globalSetup` esto corre UNA vez por corrida y el resultado se guarda en
 * `ESTADO_SESION`. Antes lo llamaba el `beforeAll` de cada spec: nueve specs, nueve logins.
 * Contra el servidor CONGELADO eso es fatal — con el reloj parado la ventana del limitador
 * de tasa no rota nunca, así que el bucket `auth` se agota y no se recupera. El síntoma no
 * era un 429 sino «Login no navegó tras 3 intentos», que parece un problema de selectores.
 * Ver `qa/README.md`.
 */
import { expect, type Page } from "@playwright/test";

/**
 * Dónde vive la sesión guardada. Fuera del control de versiones (`.gitignore`): son cookies
 * de un usuario real, aunque sea el de pruebas.
 */
export const ESTADO_SESION = ".auth/a11y.json";

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

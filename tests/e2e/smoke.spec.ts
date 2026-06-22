/**
 * Smoke E2E (plan F6): login → dashboard carga → crear un gasto → ver
 * patrimonio. Usuario de prueba sintético del sandbox local.
 */
import { test, expect } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL ?? "demo@sandbox.local";
const PASSWORD = process.env.E2E_PASSWORD ?? "Sandbox123!";

test("login → dashboard → crear gasto → patrimonio", async ({ page }) => {
  test.setTimeout(120_000);
  // 1) Login
  await page.goto("/login");
  // El form de login usa useActionState: espera la hidratación antes de
  // interactuar (un submit pre-hidratación se pierde).
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Correo").fill(EMAIL);
  await page.getByLabel("Contraseña").fill(PASSWORD);
  // El primer submit puede perderse en dev (accion recompilada en vuelo):
  // un reintento lo cubre. Hallazgo anotado en docs/revision/06-cobertura.md.
  for (let intento = 0; intento < 3; intento++) {
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    try {
      await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
      break;
    } catch {
      if (intento === 2) throw new Error("Login no navego tras 3 intentos");
      await page.waitForTimeout(1000);
    }
  }

  // 2) Dashboard carga con datos (streaming incluido).
  // El label se ve en mayúsculas por CSS (text-transform), pero el texto del
  // DOM es "Flujo de caja mensual"; getByText matchea el DOM, no el render.
  await expect(page.getByText(/flujo de caja mensual/i)).toBeVisible({ timeout: 20_000 });

  // 3) Crear un gasto desde el tab Gastos (frascos)
  await page.goto("/gastos");
  await page.getByRole("button", { name: "Registrar gasto" }).click();
  const modal = page.getByRole("dialog", { name: "Registrar gasto" });
  await modal.getByPlaceholder("Ej.: Supermercado, gasolina…").fill("Gasto e2e smoke");
  await modal.getByPlaceholder("0").fill("1234");
  await modal.getByRole("button", { name: /Registrar gasto/ }).click();
  await expect(page.getByText("Gasto registrado")).toBeVisible({ timeout: 15_000 });

  // 4) Patrimonio renderiza el portafolio (sección en streaming)
  await page.goto("/patrimonio");
  await expect(page.getByText("Mi patrimonio")).toBeVisible();
  await expect(page.getByText(/VOO|Principales posiciones|Cartera/).first()).toBeVisible({
    timeout: 30_000,
  });
});

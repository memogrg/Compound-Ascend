/**
 * Smoke E2E (plan F6): login → dashboard carga → crear un gasto → ver
 * patrimonio → el campo multilínea del chat. Usuario de prueba sintético del sandbox local.
 *
 * El paso del chat va DENTRO de este recorrido y no como test aparte a propósito: el login tiene
 * un reintento por 3 porque en dev el primer submit se pierde, y repetirlo duplicaría justo la
 * parte más frágil. Reusar la sesión cuesta segundos y no agrega ruido rojo.
 */
import { test, expect } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL ?? "demo@sandbox.local";
const PASSWORD = process.env.E2E_PASSWORD ?? "Sandbox123!";

test("login → dashboard → crear gasto → patrimonio → chat multilínea", async ({ page }) => {
  test.setTimeout(120_000);
  // 1) Login
  await page.goto("/login");
  // El form de login usa useActionState: espera la hidratación antes de
  // interactuar (un submit pre-hidratación se pierde).
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Correo").fill(EMAIL);
  // #password (no getByLabel): el toggle de visibilidad tiene aria-label
  // "Mostrar contraseña", que también matchea el substring "Contraseña" y
  // rompe el strict mode de Playwright con 2 elementos.
  await page.locator("#password").fill(PASSWORD);
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
  // El rediseño (panel pilares Norte) muestra el pilar "Flujo del mes".
  await expect(page.getByText("Flujo del mes")).toBeVisible({ timeout: 20_000 });

  // 3) Crear un gasto desde el tab Gastos (frascos) — ahora usa el mismo composer
  //    que Transacciones (bloqueado a gasto). Comercio + monto → Guardar.
  await page.goto("/gastos");
  await page.getByRole("button", { name: "Registrar gasto" }).click();
  const modal = page.getByRole("dialog", { name: "Registrar gasto" });
  await modal.getByPlaceholder("Automercado, Uber, Netflix…").fill("Gasto e2e smoke");
  await modal.getByPlaceholder("0").fill("1234");
  // La categoría es obligatoria en registro manual: elegí el sobre "(general)" del primer frasco.
  await modal.getByRole("button", { name: /\(general\)/ }).first().click();
  await modal.getByRole("button", { name: /Guardar/ }).click();
  await expect(page.getByText("Gasto registrado")).toBeVisible({ timeout: 15_000 });

  // 4) Patrimonio renderiza el portafolio (sección en streaming)
  await page.goto("/patrimonio");
  await expect(page.getByText("Mi patrimonio")).toBeVisible();
  await expect(page.getByText(/VOO|Principales posiciones|Cartera/).first()).toBeVisible({
    timeout: 30_000,
  });

  // 5) CAMPO MULTILÍNEA DEL CHAT (#603). Es teclado + layout: no hay forma de cubrirlo en unit,
  //    y es justo donde una regresión pasa desapercibida (un Enter que deja de enviar, o un salto
  //    de línea que se ve aplastado en la burbuja).
  await page.goto("/asistente");
  // TODO acotado a `.ac-page` (el tab): el panel flotante se monta en TODAS las rutas del
  // dashboard (AppShell → CoachPanel) y renderiza la misma <AssistantConversation> siempre — el
  // estado `open` solo cambia clases CSS, no desmonta. Sin acotar hay dos campos con la misma
  // etiqueta y dos copias del mismo hilo: strict mode roto y conteos al doble.
  const tab = page.locator(".ac-page");
  const campo = tab.getByLabel("Mensaje para My Agent C+");
  await expect(campo).toBeVisible({ timeout: 20_000 });
  // Es un textarea, no un input: si alguien lo revierte, todo lo de abajo pierde sentido.
  expect(await campo.evaluate((el) => el.tagName)).toBe("TEXTAREA");

  const burbujasPropias = tab.locator(".coach-msg.me .coach-bubble");
  const antes = await burbujasPropias.count();
  const altoInicial = (await campo.boundingBox())?.height ?? 0;

  // Shift+Enter y Ctrl+Enter hacen SALTO DE LÍNEA y no envían.
  await campo.click();
  await campo.pressSequentially("linea uno");
  await campo.press("Shift+Enter");
  await campo.pressSequentially("linea dos");
  await campo.press("Control+Enter");
  await campo.pressSequentially("linea tres");
  await expect(campo).toHaveValue("linea uno\nlinea dos\nlinea tres");
  expect(await burbujasPropias.count()).toBe(antes); // nada se envió por el camino

  // AUTO-RESIZE: con tres líneas el campo tiene que haber crecido.
  const altoCrecido = (await campo.boundingBox())?.height ?? 0;
  expect(altoCrecido).toBeGreaterThan(altoInicial);

  // Enter SIN modificador envía. La burbuja del usuario se pinta de inmediato (optimista), así
  // que esto no depende de que la IA conteste — importante porque el smoke corre sin garantía
  // de credenciales de IA.
  await campo.press("Enter");
  await expect(burbujasPropias).toHaveCount(antes + 1, { timeout: 15_000 });

  const enviada = burbujasPropias.last();
  // Los saltos SOBREVIVEN el viaje por el estado y el render…
  expect(await enviada.textContent()).toContain("linea uno\nlinea dos\nlinea tres");
  // …y se VEN, que es cosa del CSS: sin pre-wrap el navegador los colapsa a un espacio.
  expect(await enviada.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe("pre-wrap");

  // Y al enviar, el campo vuelve a una línea.
  await expect(campo).toHaveValue("");
  expect((await campo.boundingBox())?.height ?? 0).toBeLessThan(altoCrecido);
});

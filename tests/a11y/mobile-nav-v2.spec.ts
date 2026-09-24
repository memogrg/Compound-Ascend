/**
 * El drawer y las pestañas de núcleo de `/m` bajo la bandera. Portón, no inventario.
 *
 * Requiere el servidor construido con `NEXT_PUBLIC_NAV_V2=1`; con la bandera apagada los
 * tests se saltan solos (misma razón que en `command-palette.spec.ts`: los specs de
 * `tests/a11y/` quieren builds opuestos y `npm run test:a11y` los corre juntos).
 *
 *   NEXT_PUBLIC_NAV_V2=1 npm run build
 *   QA_FREEZE=… npm run qa:start
 *   E2E_EMAIL=… E2E_PASSWORD=… npx playwright test -c playwright.a11y.config.ts \
 *     tests/a11y/mobile-nav-v2.spec.ts
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Browser } from "@playwright/test";

import { ESTADO_SESION } from "./sesion";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * Las reglas que la sección `/m` de `qa/a11y-baseline.md` ya reporta. El portón es de
 * INCLUSIÓN: el delta no puede traer una regla que no estuviera antes. `meta-viewport` sale
 * del escalado bloqueado del layout móvil, que es una decisión de producto, no de este delta.
 */
const REGLAS_M = new Set(["color-contrast", "aria-hidden-focus", "meta-viewport"]);

/** `/m` es un teléfono: no se mide a otro ancho. */
const ANCHO = { width: 390, height: 900 };

let banderaEncendida = false;

/**
 * La bandera se MIDE, no se supone. Ya no hace login —la sesión la deja el `globalSetup`—
 * pero sí abre una página: sin esta sonda `banderaEncendida` se quedaría en `false` y TODOS
 * los casos de este archivo se saltarían en silencio, con la suite en verde sin haber
 * probado nada.
 */
test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: ESTADO_SESION });
  const page = await ctx.newPage();
  await page.goto("/m", { waitUntil: "networkidle", timeout: 60_000 });
  // El botón buscador del topbar v2 solo existe bajo bandera: es el detector más barato.
  banderaEncendida = (await page.locator("button.tb2-search").count()) > 0;
  await ctx.close();
});

test.beforeEach(() => {
  test.skip(!banderaEncendida, "requiere NEXT_PUBLIC_NAV_V2=1 en el build del servidor");
});

async function abrirMovil(browser: Browser, ruta: string) {
  const ctx = await browser.newContext({
    storageState: ESTADO_SESION,
    viewport: ANCHO,
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await page.goto(ruta, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(600);
  return { ctx, page };
}

test("el drawer muestra los 5 núcleos y Configuración", async ({ browser }) => {
  const { ctx, page } = await abrirMovil(browser, "/m");

  await page.getByRole("button", { name: "Abrir menú" }).click();
  const grupos = page.locator(".m-menu-glabel");
  await expect(grupos).toHaveText([
    "Hoy",
    "Flujo",
    "Planes",
    "Patrimonio",
    "Asesor",
    "Configuración",
  ]);

  // Todo destino ofrecido es de `/m`: un enlace a la web sacaría de la app.
  const hrefs = await page
    .locator(".m-menu-item")
    .evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
  expect(hrefs.length).toBeGreaterThan(10);
  expect(
    hrefs.filter((h) => h !== "/m" && !h.startsWith("/m/")),
    "destinos del drawer que NO son de /m",
  ).toEqual([]);
  // Suscripción no se ofrece: su camino acaba en Stripe (Apple 3.1.1).
  expect(hrefs).not.toContain("/suscripcion");

  await ctx.close();
});

test("las pestañas del núcleo navegan y marcan la activa", async ({ browser }) => {
  const { ctx, page } = await abrirMovil(browser, "/m/deudas");

  const tabs = page.getByRole("navigation", { name: "Secciones de Planes" });
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole("link")).toHaveText(["Metas", "Deudas", "Fondos"]);
  await expect(tabs.getByRole("link", { name: "Deudas" })).toHaveAttribute("aria-current", "page");

  // Son RUTAS, no paneles: no hay tablist que un lector anuncie con flechas.
  expect(await page.locator('[role="tablist"]').count(), "no debería haber tablist").toBe(0);

  await tabs.getByRole("link", { name: "Metas" }).click();
  await page.waitForURL(/\/m\/metas/, { timeout: 20_000 });
  const tabs2 = page.getByRole("navigation", { name: "Secciones de Planes" });
  await expect(tabs2.getByRole("link", { name: "Metas" })).toHaveAttribute("aria-current", "page");
  await expect(tabs2.getByRole("link", { name: "Deudas" })).not.toHaveAttribute(
    "aria-current",
    "page",
  );

  await ctx.close();
});

test("el eyebrow sale del modelo, y Asesor no tiene barra", async ({ browser }) => {
  // Donde el núcleo y la pantalla se llaman distinto, el eyebrow es el NÚCLEO y no la
  // cadena que pasaba la página («Control» en Deudas).
  const a = await abrirMovil(browser, "/m/deudas");
  await expect(a.page.locator(".m-topbar .ov").first()).toHaveText("Planes");
  await a.ctx.close();

  // Y donde dirían lo mismo, no se pinta: «PATRIMONIO» sobre «Patrimonio» solo repite.
  const { ctx, page } = await abrirMovil(browser, "/m/patrimonio");
  await expect(page.locator(".m-topbar .m-hd-title")).toHaveText("Patrimonio");
  expect(await page.locator(".m-topbar .ov").count(), "eyebrow repetido").toBe(0);
  await ctx.close();

  // Asesor tiene una sola pantalla: una pestaña sola no es una barra.
  const b = await abrirMovil(browser, "/m/asistente");
  expect(await b.page.locator("nav.mn2-tabs").count()).toBe(0);
  await b.ctx.close();
});

test("axe sobre /m y /m/gastos: 0 critical y ninguna regla nueva", async ({ browser }) => {
  for (const ruta of ["/m", "/m/gastos", "/m/patrimonio"]) {
    const { ctx, page } = await abrirMovil(browser, ruta);
    const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();

    const criticas = r.violations.filter((v) => v.impact === "critical");
    expect(
      criticas.map((v) => v.id),
      `${ruta}: violaciones critical`,
    ).toEqual([]);

    const nuevas = r.violations.map((v) => v.id).filter((id) => !REGLAS_M.has(id));
    expect(nuevas, `${ruta}: reglas fuera de la línea base de /m`).toEqual([]);

    console.log(
      `${ruta}: ${r.violations.reduce((s, v) => s + v.nodes.length, 0)} nodos · ` +
        `${r.violations.map((v) => `${v.id}(${v.nodes.length})`).join(" ")}`,
    );
    await ctx.close();
  }
});

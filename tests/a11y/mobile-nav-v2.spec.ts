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

import { apareceA, irA } from "./navegar";
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
  await irA(page, "/m/gastos", ".m-shell");
  // `button.tb2-search` es del topbar de la WEB y no existe en el shell móvil: con esa
  // sonda estos cuatro casos se saltaban incluso con la bandera encendida — verde sin
  // haber probado nada, que es justo lo que la sonda venía a evitar. El detector móvil son
  // las pestañas de núcleo (`.mn2-tabs`), que `mobile-header` solo pinta bajo bandera. Se
  // mira en `/m/gastos` y no en `/m`: el Inicio no lleva pestañas de núcleo.
  // Se ESPERA un rato corto: las pestañas son cliente, y contar al instante las daba por
  // ausentes en CI aunque la bandera estuviera encendida.
  banderaEncendida = await apareceA(page, ".mn2-tabs");
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
  // `/m` (Inicio) no lleva pestañas de núcleo, así que el ancla común es el shell móvil.
  await irA(page, ruta, ".m-shell");
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
  // `toHaveCount` y no `expect(await …count())`: la aserción web REINTENTA. Lo de arriba
  // era una foto instantánea, y este spec mide un header que se termina de decidir en el
  // cliente — con la foto se leía el estado servido, no el final.
  await expect(page.locator('[role="tablist"]'), "no debería haber tablist").toHaveCount(0);

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
  // Conteo DIRECTO otra vez: el parpadeo se arregló en el origen —el esqueleto ya no adivina
  // el texto— y no hay ningún estado intermedio que esperar. Si vuelve, este caso lo caza en
  // la primera foto.
  //
  // `:not(.ov-reserva)` porque lo que se prohíbe es un eyebrow con TEXTO que repita el
  // título. El hueco vacío que reserva el esqueleto lleva la misma clase `.ov` —tiene que
  // llevarla, o no mediría lo mismo— y contarlo haría fallar el caso por el arreglo.
  expect(await page.locator(".m-topbar .ov:not(.ov-reserva)").count(), "eyebrow repetido").toBe(0);
  await ctx.close();

  // Asesor tiene una sola pantalla: una pestaña sola no es una barra.
  const b = await abrirMovil(browser, "/m/asistente");
  await expect(b.page.locator("nav.mn2-tabs")).toHaveCount(0);
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

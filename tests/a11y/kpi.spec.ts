/**
 * Las primitivas de KPI sobre `/dev/ui`.
 *
 * **El número pintado no existe como texto.** NumberFlow renderiza dentro de un shadow root
 * en el que CADA posición contiene los diez dígitos apilados (`0123456789`), y el que se ve
 * se elige con un `transform`. El `textContent` de ese shadow root es literalmente
 * «₡0123456789.0123456789…»: no se puede leer de ahí qué cifra muestra, ni con `innerText`
 * (el host devuelve cadena vacía). Consecuencias, las dos importantes:
 *
 *  - La coincidencia carácter a carácter con `formatMoney` se prueba en el FORMATEADOR
 *    —`tests/unit/kpi.test.tsx`, que compara la salida de `Intl` con la de `format.ts` para
 *    ocho valores—, porque es lo que NumberFlow recibe y reparte entre las posiciones.
 *  - Acá se comprueba lo que sí es observable en el navegador: el texto accesible (el
 *    `sr-only`, que es la única cifra escrita del DOM) y la GEOMETRÍA del elemento — cuántas
 *    posiciones de dígito hay, y si están girando.
 *
 * `/dev/ui` vive bajo `(dashboard)`: exige sesión, y devuelve 404 en producción.
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Browser, type Page } from "@playwright/test";

import { iniciarSesion } from "./sesion";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const RUTA = "/dev/ui";

/** Lo que muestra el hero al montar. Debe salir, carácter a carácter, de `formatMoney`. */
const HERO_INICIAL = "₡1.234.567";
const HERO_ALTERNO = "₡987.450";

let estadoSesion: Awaited<ReturnType<Awaited<ReturnType<Browser["newContext"]>>["storageState"]>>;

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await iniciarSesion(page);
  estadoSesion = await ctx.storageState();
  await ctx.close();
});

async function abrir(browser: Browser, movimiento = true) {
  const ctx = await browser.newContext({
    storageState: estadoSesion,
    viewport: { width: 1280, height: 1000 },
    reducedMotion: movimiento ? "no-preference" : "reduce",
  });
  const page = await ctx.newPage();
  const avisos: string[] = [];
  // La hidratación se queja por consola, no por excepción: si no se escucha, no se entera nadie.
  page.on("console", (m) => {
    const t = m.text();
    if (/hydrat|did not match|server.*client/i.test(t)) avisos.push(t);
  });
  await page.goto(RUTA, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(800);
  return { ctx, page, avisos };
}

/**
 * Cuántas posiciones de dígito tiene pintadas el hero.
 *
 * Es la huella observable de la cifra: ₡1.234.567 son 7 dígitos y ₡987.450 son 6. Si el
 * elemento no se hubiera actualizado, seguirían siendo 7 aunque el `sr-only` ya dijera otra
 * cosa — que es exactamente el fallo que este test tiene que poder ver.
 *
 * El selector atraviesa el shadow root abierto: Playwright lo hace por defecto.
 */
async function digitosPintados(page: Page): Promise<number> {
  return page.locator(".kpi-hero-cifra number-flow-react .digit").count();
}

/** Los dígitos que están girando ahora mismo. Con movimiento reducido deben ser 0. */
async function digitosGirando(page: Page): Promise<number> {
  return page.locator(".kpi-hero-cifra number-flow-react .digit.is-spinning").count();
}

test("el hero anuncia el número entero y lo pinta con tantos dígitos como tiene", async ({
  browser,
}) => {
  const { ctx, page } = await abrir(browser);
  await page.locator(".kpi-hero").scrollIntoViewIfNeeded();
  // La ÚNICA cifra escrita del DOM. Es la que lee un lector de pantalla, y sale de
  // `formatMoney` sin intermediarios.
  await expect(page.locator(".kpi-hero-cifra .sr-only")).toHaveText(HERO_INICIAL);
  // Y lo pintado le corresponde: ₡1.234.567 son siete dígitos.
  expect(await digitosPintados(page)).toBe(7);
  await ctx.close();
});

test("«Simular cambio» cambia la cifra, no solo el texto accesible", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  await page.getByRole("button", { name: "Simular cambio" }).scrollIntoViewIfNeeded();
  expect(await digitosPintados(page)).toBe(7);

  await page.getByRole("button", { name: "Simular cambio" }).click();

  await expect(page.locator(".kpi-hero-cifra .sr-only")).toHaveText(HERO_ALTERNO);
  // Lo pintado tiene que moverse con el estado. Comprobar solo el `sr-only` dejaría pasar
  // justo el fallo que se busca: React actualiza y el elemento se queda con el valor viejo.
  await expect.poll(() => digitosPintados(page), { timeout: 5_000 }).toBe(6);
  await ctx.close();
});

test("con movimiento reducido la cifra aparece ya escrita", async ({ browser }) => {
  const { ctx, page } = await abrir(browser, false);
  await page.getByRole("button", { name: "Simular cambio" }).scrollIntoViewIfNeeded();
  await page.getByRole("button", { name: "Simular cambio" }).click();

  // Sin `poll`: inmediatamente después del clic el número ya es el nuevo y nada gira.
  expect(await digitosPintados(page)).toBe(6);
  expect(await digitosGirando(page)).toBe(0);
  await expect(page.locator(".kpi-hero-cifra .sr-only")).toHaveText(HERO_ALTERNO);
  await ctx.close();
});

test("el chip de variación no confía solo en el color", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  const chips = page.locator(".kpi-delta");
  await expect(chips.first()).toBeVisible();
  const n = await chips.count();
  for (let i = 0; i < n; i++) {
    const texto = await chips.nth(i).innerText();
    // Flecha + palabra: quien no distingue rojo de verde lee lo mismo.
    expect(texto).toMatch(/[↑↓→]/);
    expect(texto).toMatch(/sube|baja|sin cambio/);
  }
  await ctx.close();
});

test("el mismo signo lleva tono opuesto según la métrica", async ({ browser }) => {
  // Ingresos +₡120.000 es bueno; Gastos +₡84.000 es malo. Es la regla que justifica
  // `describirDelta`, y acá se comprueba pintada.
  const { ctx, page } = await abrir(browser);
  const tono = (etiqueta: string) =>
    page
      .locator(".kpi-card", { hasText: etiqueta })
      .locator(".kpi-delta")
      .getAttribute("data-tono");
  expect(await tono("Ingresos")).toBe("bueno");
  expect(await tono("Gastos")).toBe("malo");
  await ctx.close();
});

test("el medidor se anuncia como meter con su rango", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  const meter = page.locator(".kpi-hero [role='meter']");
  await expect(meter).toHaveAttribute("aria-valuenow", "43");
  await expect(meter).toHaveAttribute("aria-valuemin", "0");
  await expect(meter).toHaveAttribute("aria-valuemax", "100");
  await expect(meter).toHaveAttribute("aria-label", /Presupuesto/);
  await ctx.close();
});

test("la sparkline es decorativa: no la anuncia nadie", async ({ browser }) => {
  // El dato está en la cifra de al lado. Una sparkline «accesible» solo añadiría ruido.
  const { ctx, page } = await abrir(browser);
  await expect(page.locator(".kpi-spark").first()).toHaveAttribute("aria-hidden", "true");
  await ctx.close();
});

test("la hidratación no protesta", async ({ browser }) => {
  const { ctx, page, avisos } = await abrir(browser);
  await page.locator(".kpi-hero").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  expect(avisos, avisos.join("\n")).toHaveLength(0);
  await ctx.close();
});

test("axe no encuentra nada en la sección KPI", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  const r = await new AxeBuilder({ page }).withTags(TAGS).include(".kpi-hero").analyze();
  const tarjetas = await new AxeBuilder({ page }).withTags(TAGS).include(".kpi-card").analyze();
  const todas = [...r.violations, ...tarjetas.violations];
  expect(todas.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}`).join("\n")).toBe("");
  await ctx.close();
});

/**
 * El calendario de gasto y los presets de rango, sobre `/dev/ui`.
 *
 * Lo que solo se ve corriendo: que la rejilla sea UNA sola parada de Tab, que las flechas
 * muevan el foco de verdad, que `Enter` fije el día, y que los chips recorten la serie Y la
 * tabla a la vez.
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Browser } from "@playwright/test";

import { iniciarSesion } from "./sesion";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

let estadoSesion: Awaited<ReturnType<Awaited<ReturnType<Browser["newContext"]>>["storageState"]>>;

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await iniciarSesion(page);
  estadoSesion = await ctx.storageState();
  await ctx.close();
});

async function abrir(browser: Browser, tema: "light" | "dark" = "light") {
  const ctx = await browser.newContext({
    storageState: estadoSesion,
    viewport: { width: 1280, height: 1000 },
    colorScheme: tema,
    reducedMotion: "reduce",
  });
  await ctx.addInitScript(
    ([k, v]) => {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* storage bloqueado */
      }
    },
    ["ca-theme", tema] as [string, string],
  );
  const page = await ctx.newPage();
  await page.goto("/dev/ui", { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(800);
  await page.locator(".cal-grid").scrollIntoViewIfNeeded();
  return { ctx, page };
}

test("la rejilla es UNA sola parada de Tab", async ({ browser }) => {
  // Con 30 días, tabular treinta veces para cruzar el calendario es inaceptable.
  const { ctx, page } = await abrir(browser);
  const tabulables = await page.locator(".cal-dia[tabindex='0']").count();
  expect(tabulables).toBe(1);
  expect(await page.locator(".cal-dia[tabindex='-1']").count()).toBeGreaterThan(20);
  await ctx.close();
});

test("las flechas mueven el foco dentro de la rejilla", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  await page.locator(".cal-dia[tabindex='0']").focus();
  const primero = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));

  await page.keyboard.press("ArrowRight");
  const segundo = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  expect(segundo).not.toBe(primero);

  // Abajo salta una semana entera, no un día.
  await page.keyboard.press("ArrowDown");
  const tercero = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  expect(tercero).not.toBe(segundo);
  await ctx.close();
});

test("Enter fija el día y lo anuncia", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  await page.locator(".cal-dia[tabindex='0']").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cal-dia[aria-selected='true']")).toHaveCount(1);
  await ctx.close();
});

test("cada día dice en palabras cuánto se gastó", async ({ browser }) => {
  // El color no es el único canal: la etiqueta lleva el día, el importe y los movimientos.
  const { ctx, page } = await abrir(browser);
  const etiquetas = await page
    .locator(".cal-dia")
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  expect(
    etiquetas.some((e) => /sin gasto/.test(e)),
    "algún día sin gasto",
  ).toBe(true);
  expect(
    etiquetas.some((e) => /movimiento/.test(e)),
    "algún día con movimientos",
  ).toBe(true);
  await ctx.close();
});

test("los días futuros se distinguen de los días sin gasto", async ({ browser }) => {
  // Colapsarlos haría que el mes en curso pareciera un mes de ahorro ejemplar.
  const { ctx, page } = await abrir(browser);
  expect(await page.locator(".cal-dia[data-futuro='true']").count()).toBeGreaterThan(0);
  expect(await page.locator(".cal-dia[data-vacio='true']").count()).toBeGreaterThan(0);
  await ctx.close();
});

test("los presets recortan la serie y la tabla a la vez", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  const grupo = page.locator("[role='radiogroup'][aria-label='Rango del gráfico']");
  await grupo.scrollIntoViewIfNeeded();

  const filas = () =>
    page.locator(".cf").filter({ has: grupo }).locator("table.cf-tabla tbody tr").count();

  await expect(grupo.locator("[aria-checked='true']")).toHaveText("1A");
  expect(await filas()).toBe(12);

  // Por TECLADO, que es el camino que el `radiogroup` promete: una parada de Tab y flechas
  // para recorrer. De paso evita la barra superior fija, que tras el scroll se monta sobre
  // los chips y deja el clic esperando para siempre a que el punto quede libre.
  await grupo.locator("[aria-checked='true']").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(grupo.locator("[aria-checked='true']")).toHaveText("6M");
  expect(await filas()).toBe(6);

  // Desde «6M», que es el primero, una flecha a la izquierda da la vuelta hasta «Todo».
  await grupo.locator("[aria-checked='true']").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(grupo.locator("[aria-checked='true']")).toHaveText("Todo");
  expect(await filas()).toBe(36);
  await ctx.close();
});

test("los presets son un radiogroup, no botones sueltos", async ({ browser }) => {
  // Son una elección entre opciones excluyentes: así el lector anuncia «2 de 3» y las
  // flechas recorren el grupo.
  const { ctx, page } = await abrir(browser);
  const grupo = page.locator("[role='radiogroup'][aria-label='Rango del gráfico']");
  await expect(grupo.getByRole("radio")).toHaveCount(4);
  await expect(grupo.locator("[aria-checked='true']")).toHaveCount(1);
  // Una sola parada de Tab en el grupo, como manda el patrón.
  await expect(grupo.locator("[tabindex='0']")).toHaveCount(1);
  await ctx.close();
});

for (const tema of ["light", "dark"] as const) {
  test(`axe no encuentra nada en el calendario ni en los presets (${tema})`, async ({
    browser,
  }) => {
    const { ctx, page } = await abrir(browser, tema);
    const r = await new AxeBuilder({ page })
      .withTags(TAGS)
      .include(".cal")
      .include(".cf-rangos")
      .analyze();
    expect(r.violations.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}`).join("\n")).toBe("");
    await ctx.close();
  });
}

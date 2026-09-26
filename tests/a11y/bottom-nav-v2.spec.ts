/**
 * La barra inferior de la web estrecha, en un navegador de verdad.
 *
 * Los ítems y el activo se prueban en `tests/unit/bottom-nav-items.test.ts`; acá va lo que
 * solo se ve corriendo: que la barra no tape el contenido ni el botón del asesor, que
 * `aria-current` se mueva al navegar de verdad, y que el periodo sobreviva al toque.
 *
 * Se salta si la bandera está apagada: con `NAV_V2` off la barra es la de siempre y este
 * spec no tendría nada que comprobar.
 */
import { test, expect, type Browser } from "@playwright/test";

import { irA } from "./navegar";
import { ESTADO_SESION } from "./sesion";

async function abrir(browser: Browser, url = "/dashboard") {
  const ctx = await browser.newContext({
    storageState: ESTADO_SESION,
    viewport: { width: 390, height: 844 },
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  // La barra ES lo que mide este spec: se espera ella, no un hueco en la red.
  await irA(page, url, ".bottom-nav");
  return { ctx, page };
}

/** Con la bandera apagada la barra tiene seis ítems; con ella, cinco. */
async function v2Encendida(page: import("@playwright/test").Page): Promise<boolean> {
  return (await page.locator(".bottom-nav .bn-item").count()) === 5;
}

test("cinco núcleos, y el de la ruta marcado", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  test.skip(!(await v2Encendida(page)), "NAV_V2 apagada");

  await expect(page.locator(".bottom-nav .bn-item span")).toHaveText([
    "Hoy",
    "Flujo",
    "Planes",
    "Patrimonio",
    "Asesor",
  ]);
  await expect(page.locator(".bottom-nav [aria-current='page']")).toHaveCount(1);
  await expect(page.locator(".bottom-nav [aria-current='page']")).toContainText("Hoy");
  await ctx.close();
});

test("navegar mueve el activo", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  test.skip(!(await v2Encendida(page)), "NAV_V2 apagada");

  await page.locator(".bottom-nav a").nth(1).click();
  await page.waitForURL(/mi-base-financiera/, { timeout: 30_000 });
  await expect(page.locator(".bottom-nav [aria-current='page']")).toContainText("Flujo");
  await ctx.close();
});

test("el periodo viaja con el toque", async ({ browser }) => {
  // Si alguien está mirando agosto y toca «Planes», sigue mirando agosto.
  const { ctx, page } = await abrir(browser, "/dashboard?period=2026-08");
  test.skip(!(await v2Encendida(page)), "NAV_V2 apagada");

  const hrefs = await page
    .locator(".bottom-nav a")
    .evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
  for (const h of hrefs) expect(h, h).toContain("period=2026-08");

  await page.locator(".bottom-nav a").nth(2).click();
  await page.waitForURL(/control-financiero/, { timeout: 30_000 });
  expect(page.url()).toContain("period=2026-08");
  await ctx.close();
});

test("la barra no tapa el contenido ni el botón del asesor", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  const barra = await page.locator(".bottom-nav").boundingBox();
  const fab = await page.locator(".coach-fab").boundingBox();
  expect(barra, "la barra no se pintó").not.toBeNull();
  expect(fab, "el FAB no se pintó").not.toBeNull();

  // El FAB termina por encima de donde empieza la barra.
  expect(fab!.y + fab!.height).toBeLessThanOrEqual(barra!.y);
  // Y el contenido reserva al menos el alto de la barra.
  const pad = await page
    .locator(".content")
    .evaluate((e) => Number.parseFloat(getComputedStyle(e).paddingBottom));
  expect(pad).toBeGreaterThanOrEqual(barra!.height);
  await ctx.close();
});

test("a 390 los íconos del topbar van en la fila del título y el periodo debajo", async ({
  browser,
}) => {
  const { ctx, page } = await abrir(browser);
  test.skip(!(await v2Encendida(page)), "NAV_V2 apagada");

  const titulo = await page.locator(".page-title").boundingBox();
  const iconos = await page.locator(".topbar-actions").boundingBox();
  const periodo = await page.locator(".tb2-period").boundingBox();
  expect(titulo && iconos && periodo).toBeTruthy();

  // Los íconos comparten banda vertical con el bloque del título…
  expect(iconos!.y).toBeLessThan(titulo!.y + titulo!.height);
  // …y el periodo va entero por debajo de los dos.
  expect(periodo!.y).toBeGreaterThanOrEqual(iconos!.y + iconos!.height - 1);
  expect(periodo!.width).toBeGreaterThan(300);
  await ctx.close();
});

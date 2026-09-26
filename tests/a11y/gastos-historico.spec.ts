/**
 * La tarjeta «Histórico de gastos» de `/gastos`, que pasó a usar el núcleo.
 *
 * Lo que solo se ve corriendo: que el presupuesto sea una serie MENSUAL en escalón y no un
 * total del rango pintado como línea horizontal, que el mes a medias se marque, y que los
 * rótulos de los KPI confiesen el rango que están sumando.
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Browser } from "@playwright/test";

import { ESTADO_SESION } from "./sesion";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function abrir(browser: Browser, ruta: string, ancho = 1280) {
  const ctx = await browser.newContext({
    storageState: ESTADO_SESION,
    viewport: { width: ancho, height: 1200 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await page.goto(ruta, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}

/** La tarjeta del histórico, y su SVG. */
async function tarjetaHistorico(page: import("@playwright/test").Page) {
  const titulo = page.getByText("Histórico de gastos").first();
  await expect(titulo).toHaveCount(1);
  const tarjeta = titulo.locator("xpath=ancestor::*[contains(@class,'card')][1]");
  await tarjeta.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  return tarjeta;
}

/** Los importes que muestra el tooltip en tres puntos de la serie. */
async function leerTooltips(
  page: import("@playwright/test").Page,
  tarjeta: ReturnType<typeof tarjetaHistorico> extends Promise<infer T> ? T : never,
) {
  const svg = tarjeta.locator(".recharts-surface");
  await expect(svg).toHaveCount(1);
  const caja = await svg.boundingBox();
  expect(caja, "el svg no tiene caja").not.toBeNull();
  const filas: string[] = [];
  for (const f of [0.2, 0.5, 0.85]) {
    await page.mouse.move(caja!.x + caja!.width * f, caja!.y + caja!.height * 0.5);
    await page.waitForTimeout(320);
    const tip = page.locator(".cf-tip");
    if ((await tip.count()) > 0) filas.push((await tip.innerText()).replace(/\n/g, " | "));
  }
  expect(filas.length, "el tooltip no apareció en ningún punto").toBeGreaterThan(0);
  return filas;
}

const aNumero = (s: string) => Number(s.replace(/[^\d]/g, ""));

test("el presupuesto es una serie mensual en escalón, no un total del rango", async ({
  browser,
}) => {
  // Antes se pintaba UNA línea horizontal con la suma del rango: con «3m», tres meses de
  // presupuesto contra el gasto de cada mes suelto.
  const { ctx, page } = await abrir(browser, "/gastos?range=3m");
  const tarjeta = await tarjetaHistorico(page);
  const filas = await leerTooltips(page, tarjeta);

  const presupuestos = filas
    .map((f) => /Presupuesto \| (₡[\d.]+)/.exec(f)?.[1])
    .filter((x): x is string => Boolean(x))
    .map(aNumero);
  expect(presupuestos.length, `no se leyeron presupuestos de: ${filas.join(" // ")}`).toBe(3);
  // Si fuera una línea horizontal, los tres serían idénticos. Basta con que el último
  // difiera para demostrar que cada mes lleva el suyo.
  expect(new Set(presupuestos).size, `presupuestos: ${presupuestos.join(", ")}`).toBeGreaterThan(1);
  await ctx.close();
});

test("el escalón del mes en curso coincide con el presupuesto de Mi Base Financiera", async ({
  browser,
}) => {
  // El mismo dinero, contado igual en las dos pantallas. Antes `/gastos` mostraba el total
  // del rango donde Mi Base mostraba el del mes, y las dos decían «presupuesto».
  const { ctx, page } = await abrir(browser, "/gastos?range=3m");
  const tarjeta = await tarjetaHistorico(page);
  const filas = await leerTooltips(page, tarjeta);
  const ultimo = filas[filas.length - 1]!;
  const delGrafico = aNumero(/Presupuesto \| (₡[\d.]+)/.exec(ultimo)?.[1] ?? "0");
  expect(delGrafico, `del tooltip: ${ultimo}`).toBeGreaterThan(0);

  await page.goto("/mi-base-financiera", { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);
  // En Mi Base la tarjeta se llama «Gastos presup.», no «Gasto planificado»: son dos
  // pantallas distintas para el mismo número, y ese desajuste de nombres es justo lo que
  // hacía tan fácil no notar que tampoco contaban lo mismo.
  const planificado = page.getByText("Gastos presup.", { exact: true }).first();
  await expect(planificado).toHaveCount(1);
  // El PADRE directo: la tarjeta no tiene una clase estable que buscar por ancestro, y un
  // `contains(@class,'metric')` que no matchea deja el test colgado hasta el timeout en vez
  // de fallar diciendo qué pasó.
  const tarjetaBase = planificado.locator("xpath=..");
  const textoBase = await tarjetaBase.innerText();
  const delBase = aNumero(/₡[\d.]+/.exec(textoBase)?.[0] ?? "0");

  expect(delBase, `Mi Base dice: ${textoBase.replace(/\n/g, " ")}`).toBeGreaterThan(0);
  expect(delGrafico, `gráfico ${delGrafico} vs Mi Base ${delBase}`).toBe(delBase);
  await ctx.close();
});

test("el mes a medias se marca «parcial» y lo dice en palabras", async ({ browser }) => {
  const { ctx, page } = await abrir(browser, "/gastos?range=3m");
  const tarjeta = await tarjetaHistorico(page);

  // El rótulo, que es lo que oye quien no ve el trazo punteado.
  const enCurso = tarjeta.locator(".cf-en-curso");
  await expect(enCurso).toHaveCount(1);
  expect(await enCurso.innerText()).toMatch(/en curso · día \d+ de \d+/);

  // Y el tooltip del último punto.
  const filas = await leerTooltips(page, tarjeta);
  expect(filas[filas.length - 1], `último tooltip: ${filas.join(" // ")}`).toContain("parcial");

  // Un solo aro: el punto de unión del tramo en curso NO lleva aro, que ya está cerrado.
  // El ratón se retira primero: mientras está encima, Recharts pinta sus `activeDot`, que
  // también son círculos y contaminaban la cuenta (salían 3).
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  const aros = tarjeta.locator("circle[fill='var(--surface)'][stroke='var(--neg)']");
  expect(await aros.count()).toBe(1);
  await ctx.close();
});

for (const [rango, esperado] of [
  ["1m", "del mes"],
  ["3m", "de 3 meses"],
  ["6m", "de 6 meses"],
] as const) {
  test(`los KPI confiesan el rango: ${rango} → «${esperado}»`, async ({ browser }) => {
    const { ctx, page } = await abrir(browser, `/gastos?range=${rango}`);
    const planificado = page.getByText(/Gasto planificado/i).first();
    await expect(planificado).toHaveCount(1);
    const tarjeta = planificado.locator("xpath=ancestor::*[contains(@class,'card')][1]");
    expect(await tarjeta.innerText()).toContain(esperado);
    await ctx.close();
  });
}

test("axe no encuentra nada nuevo en la tarjeta", async ({ browser }) => {
  const { ctx, page } = await abrir(browser, "/gastos?range=3m");
  await tarjetaHistorico(page);
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  // La línea base de `/gastos` ya reporta contraste; el portón es de INCLUSIÓN.
  const conocidas = new Set(["color-contrast", "nested-interactive", "aria-hidden-focus"]);
  const nuevas = r.violations.filter((v) => !conocidas.has(v.id));
  expect(nuevas.map((v) => `${v.id} ×${v.nodes.length}`).join("\n")).toBe("");
  await ctx.close();
});

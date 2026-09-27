/**
 * La tarjeta «Composición de gastos» del panel, que no muestra gastos.
 *
 * Suma `budget_items` —el presupuesto del mes— y lo presenta bajo un título de gasto con el
 * subtítulo «al mes». Quien la lee entiende «esto es lo que llevás gastado», y en la cuenta de
 * demo la diferencia entre las dos cifras es de medio millón de colones: ₡1.726.097 de
 * presupuesto contra ₡1.167.030 de gasto real a mitad de mes.
 *
 * El caso de abajo fija el HECHO —de dónde sale el número— antes de tocar el rótulo, para que
 * el cambio de texto no se apoye en una suposición. Y una vez cambiado, fija el rótulo.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";

import { ESTADO_SESION } from "./sesion";

async function abrir(browser: Browser, ruta: string, ancho = 1280) {
  const ctx = await browser.newContext({
    storageState: ESTADO_SESION,
    viewport: { width: ancho, height: 1400 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await page.goto(ruta, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator(".dl-fila, .dl-vacio").first().waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(1000);
  return { ctx, page };
}

const aNumero = (s: string) => Number(s.replace(/[^\d]/g, ""));

/** El total del centro de la dona del panel, y su subtítulo. */
async function centroDelPanel(page: Page) {
  const dona = page.locator(".dl").first();
  const filas = await dona.locator(".dl-monto").allTextContents();
  return {
    suma: filas.map(aNumero).reduce((a, b) => a + b, 0),
    sub: (await dona.locator(".donut-sub").innerText()).trim(),
    titulo: (await page.locator(".card-title").first().innerText()).trim(),
  };
}

test("el total de la tarjeta del panel es el PRESUPUESTO del mes, no el gasto", async ({
  browser,
}) => {
  // Se comparan las tres cifras del MISMO reloj congelado: la de la tarjeta, el presupuesto
  // que declara Mi Base Financiera y el gasto real que declara la misma pantalla. No se
  // escriben montos a mano: lo que se afirma es a cuál de las dos se parece.
  const { ctx, page } = await abrir(browser, "/dashboard");
  const { suma } = await centroDelPanel(page);
  expect(suma, "la tarjeta del panel no sumó nada").toBeGreaterThan(0);
  await ctx.close();

  const ctx2 = await browser.newContext({
    storageState: ESTADO_SESION,
    viewport: { width: 1280, height: 1400 },
  });
  const p2 = await ctx2.newPage();
  await p2.goto("/mi-base-financiera", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await p2.getByText("Gastos presup.", { exact: true }).first().waitFor({ timeout: 30_000 });
  await p2.waitForTimeout(1200);
  const presupuesto = aNumero(
    /₡[\d.]+/.exec(
      await p2.getByText("Gastos presup.", { exact: true }).first().locator("xpath=..").innerText(),
    )?.[0] ?? "0",
  );
  const real = aNumero(
    /₡[\d.]+/.exec(
      await p2.getByText("Gastos reales", { exact: true }).first().locator("xpath=..").innerText(),
    )?.[0] ?? "0",
  );
  await ctx2.close();

  expect(presupuesto, "no se leyó el presupuesto del mes").toBeGreaterThan(0);
  expect(real, "no se leyó el gasto real del mes").toBeGreaterThan(0);
  // La premisa del caso: en esta cuenta las dos cifras NO coinciden, o no probaría nada.
  expect(presupuesto, `presupuesto ${presupuesto} · real ${real}`).not.toBe(real);

  expect(suma, `tarjeta ${suma} · presupuesto ${presupuesto} · real ${real}`).toBe(presupuesto);
});

test("y por eso el rótulo dice presupuesto, con su período", async ({ browser }) => {
  // Regla de la casa: toda cifra visible lleva rótulo de PERÍODO y de NATURALEZA. El título
  // decía «gastos» y el subtítulo «al mes»: el período estaba, la naturaleza estaba al revés.
  const { ctx, page } = await abrir(browser, "/dashboard");
  const { titulo, sub } = await centroDelPanel(page);
  expect(titulo, `título: ${titulo}`).toBe("Presupuesto del mes por bloque");
  expect(sub, `subtítulo: ${sub}`).toBe("presupuesto");
  // Y no queda ningún «gasto» suelto en la tarjeta que vuelva a prometer lo que no muestra.
  const tarjeta = page
    .locator(".dl")
    .first()
    .locator("xpath=ancestor::*[contains(@class,'card')][1]");
  expect((await tarjeta.innerText()).toLowerCase(), "sigue diciendo «gastos»").not.toContain(
    "composición de gastos",
  );
  await ctx.close();
});

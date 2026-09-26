/**
 * La leyenda de las donas, en un navegador de verdad.
 *
 * El reparto de porcentajes se prueba puro en `tests/unit/leyenda-dona.test.ts`. Acá va lo
 * que solo se ve corriendo, que es donde estaban los tres defectos: el nombre truncado, la
 * leyenda pegada al lado en una tarjeta estrecha, y el monto sin porcentaje.
 */
import { expect, test, type Browser, type Locator } from "@playwright/test";

import { ESTADO_SESION } from "./sesion";

/** Las rutas con tarjeta de dona. `/patrimonio` lleva tres: portafolio y las dos de asignación. */
const RUTAS = ["/dashboard", "/gastos", "/mi-rich-life", "/patrimonio"] as const;

async function abrir(browser: Browser, ruta: string, ancho: number) {
  const ctx = await browser.newContext({
    storageState: ESTADO_SESION,
    viewport: { width: ancho, height: 1200 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await page.goto(ruta, { waitUntil: "domcontentloaded", timeout: 60_000 });
  // Se espera el ELEMENTO, no un hueco en la red: la dona es `dynamic({ssr:false})` y hasta
  // que carga hay un esqueleto sin nada. (Cuando entre el ayudante compartido de
  // `tests/a11y/navegar.ts` —rama de CI— esto pasa a ser `irA(page, ruta, ".dl")`.)
  //
  // Vale una fila O el estado vacío: la cuenta de demo tiene ₡0 invertido, así que las dos
  // donas de `/patrimonio` salen legítimamente vacías. Esperar solo `.dl-fila` ahí agotaba
  // el minuto y el fallo parecía de la dona.
  await page.locator(".dl-fila, .dl-vacio").first().waitFor({ state: "visible", timeout: 60_000 });
  return { ctx, page };
}

const aNumero = (s: string) => Number(s.replace(/[^\d]/g, ""));

/** ¿El texto de este elemento cabe en su caja, o el navegador lo está recortando? */
async function estaTruncado(el: Locator): Promise<boolean> {
  return el.evaluate((n) => n.scrollWidth > n.clientWidth + 1);
}

for (const ruta of RUTAS) {
  test(`${ruta}: ningún nombre de la leyenda se trunca a 1280`, async ({ browser }) => {
    const { ctx, page } = await abrir(browser, ruta, 1280);
    const nombres = page.locator(".dl-nombre");
    const n = await nombres.count();
    if (n === 0) {
      // Sin datos no hay nombres que truncar, pero sí hay algo que afirmar: que la tarjeta
      // dice por qué está vacía en vez de pintar una dona rota. Pasa en `/patrimonio` con la
      // cuenta de demo, que tiene ₡0 invertido.
      await expect(page.locator(".dl-vacio").first()).toBeVisible();
      await ctx.close();
      return;
    }
    const cortados: string[] = [];
    for (let i = 0; i < n; i++) {
      const el = nombres.nth(i);
      if (await estaTruncado(el)) cortados.push((await el.innerText()).trim());
    }
    expect(cortados.join(" · "), "nombres recortados").toBe("");
    await ctx.close();
  });

  test(`${ruta}: los porcentajes de cada dona suman exactamente 100`, async ({ browser }) => {
    const { ctx, page } = await abrir(browser, ruta, 1280);
    const donas = page.locator(".dl");
    const cuantas = await donas.count();
    expect(cuantas, "no hay donas en esta ruta").toBeGreaterThan(0);
    let medidas = 0;
    for (let i = 0; i < cuantas; i++) {
      const pcts = await donas.nth(i).locator(".dl-pct").allTextContents();
      // Tarjeta vacía: no hay nada que repartir. Se comprueba que sea EL estado vacío y no
      // una leyenda que se quedó sin pintar.
      if (pcts.length === 0) {
        await expect(donas.nth(i).locator(".dl-vacio")).toHaveCount(1);
        continue;
      }
      const suma = pcts.map(aNumero).reduce((a, b) => a + b, 0);
      expect(suma, `dona ${i} de ${ruta}: ${pcts.join(" + ")}`).toBe(100);
      medidas += 1;
    }
    console.log(`${ruta}: ${medidas} de ${cuantas} donas con datos`);
    await ctx.close();
  });
}

test("a 390 la leyenda va DEBAJO de la dona, no a su lado", async ({ browser }) => {
  const { ctx, page } = await abrir(browser, "/gastos", 390);
  const anillo = page.locator('.dl-caja [role="img"]').first();
  const lista = page.locator(".dl-lista").first();
  const a = await anillo.boundingBox();
  const l = await lista.boundingBox();
  expect(a, "la dona no tiene caja").not.toBeNull();
  expect(l, "la leyenda no tiene caja").not.toBeNull();
  // Debajo: el borde superior de la leyenda queda por debajo del inferior de la dona.
  expect(l!.y, `dona ${a!.y}+${a!.height} · leyenda ${l!.y}`).toBeGreaterThanOrEqual(
    a!.y + a!.height - 1,
  );
  await ctx.close();
});

test("a 1280 en una tarjeta ancha la leyenda va AL LADO", async ({ browser }) => {
  // El complemento del anterior: el corte es del contenedor, así que tiene que cortar de
  // verdad en los dos sentidos. Sin esto, «siempre debajo» pasaría el test de arriba.
  const { ctx, page } = await abrir(browser, "/mi-rich-life", 1280);
  const anillo = page.locator('.dl-caja [role="img"]').first();
  const lista = page.locator(".dl-lista").first();
  const a = (await anillo.boundingBox())!;
  const l = (await lista.boundingBox())!;
  expect(l.x, `dona en x=${a.x}+${a.width} · leyenda en x=${l.x}`).toBeGreaterThan(
    a.x + a.width - 1,
  );
  await ctx.close();
});

test("cada fila dice nombre, porcentaje y monto, con el monto a la derecha", async ({
  browser,
}) => {
  const { ctx, page } = await abrir(browser, "/gastos", 1280);
  const fila = page.locator(".dl-fila").first();
  await expect(fila.locator(".dl-nombre")).toHaveCount(1);
  await expect(fila.locator(".dl-pct")).toHaveCount(1);
  await expect(fila.locator(".dl-monto")).toHaveCount(1);
  expect(await fila.locator(".dl-pct").innerText()).toMatch(/^\d+ %$/);
  expect(await fila.locator(".dl-monto").innerText()).toMatch(/[₡$]/);

  // Los montos de todas las filas terminan en la MISMA x: si no, la columna no se puede
  // comparar de un vistazo, que es para lo que existe alinearla a la derecha.
  const montos = page.locator(".dl-lista").first().locator(".dl-monto");
  const cuantos = await montos.count();
  expect(cuantos).toBeGreaterThan(1);
  const derechas: number[] = [];
  for (let i = 0; i < cuantos; i++) {
    const b = (await montos.nth(i).boundingBox())!;
    derechas.push(Math.round(b.x + b.width));
  }
  expect(new Set(derechas).size, `bordes derechos: ${derechas.join(", ")}`).toBe(1);

  // Y con cifras de ancho fijo, o los miles no quedan uno debajo de otro.
  const variante = await montos.first().evaluate((n) => getComputedStyle(n).fontVariantNumeric);
  expect(variante).toContain("tabular-nums");
  await ctx.close();
});

test("el sobrante del panel se dice, no desaparece", async ({ browser }) => {
  // `/dashboard` muestra cinco categorías. Antes cortaba en cinco EN SILENCIO; ahora la fila
  // «Otras N» lleva su monto y su porcentaje, y por eso la columna sigue sumando 100.
  const { ctx, page } = await abrir(browser, "/dashboard", 1280);
  const resto = page.locator(".dl-fila-resto");
  const n = await resto.count();
  // Si la cuenta de demo tuviera cinco categorías o menos no habría sobrante, y el caso no
  // tendría nada que decir — pero entonces tampoco habría corte, y eso sí se afirma.
  const filas = await page.locator(".dl").first().locator(".dl-fila").count();
  if (n === 0) {
    expect(filas, "sin fila de sobrante, tiene que estar todo").toBeLessThanOrEqual(5);
  } else {
    expect(n).toBe(1);
    expect(await resto.first().locator(".dl-nombre").innerText()).toMatch(/^Otras \d+$/);
    expect(aNumero(await resto.first().locator(".dl-monto").innerText())).toBeGreaterThan(0);
  }
  await ctx.close();
});

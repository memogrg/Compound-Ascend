/**
 * El reparto de la dona del panel: anillo y leyenda, a los tres anchos de captura.
 *
 * Lo que se fija no es una foto del resultado a cada ancho —eso ya lo hace el diff visual— sino la
 * REGLA: la leyenda va al lado del anillo cuando el contenedor mide 420 px o más, y debajo cuando
 * no. El corte es del contenedor y no de la ventana, porque la misma tarjeta se estrecha en
 * `dash-split` y ocupa todo el ancho en móvil; una aserción por viewport acertaría en uno y
 * mentiría en otro.
 *
 * Y dos invariantes que valen a cualquier ancho: las dos cajas no se solapan, y ninguna se sale de
 * la tarjeta. Lo segundo es el defecto de la decisión 48 en su forma geométrica — a 1280 el rótulo
 * del mes en curso se salía de la tarjeta y nadie lo veía hasta mirar una captura.
 */
import { expect, test, type Browser } from "@playwright/test";

import { congelarReloj } from "./reloj";
import { ESTADO_SESION } from "./sesion";

/** El mismo número que la consulta de contenedor de `charts-core.css`. */
const CORTE = 420;
const ANCHOS = [390, 768, 1280] as const;

async function abrirPanel(browser: Browser, ancho: number) {
  const ctx = await browser.newContext({
    storageState: ESTADO_SESION,
    viewport: { width: ancho, height: 1600 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await congelarReloj(page);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded", timeout: 60_000 });
  // La dona es `dynamic(..., { ssr: false })`: hasta que llega su chunk no hay ni anillo ni filas.
  await page.locator(".cf-leyenda-lado .dl-fila").first().waitFor({ timeout: 60_000 });
  return { ctx, page };
}

for (const ancho of ANCHOS) {
  test(`a ${ancho} la dona del panel reparte según su CONTENEDOR, no según la ventana`, async ({
    browser,
  }) => {
    const { ctx, page } = await abrirPanel(browser, ancho);

    const marco = page.locator("figure.cf").filter({ hasText: "Presupuesto del mes" }).first();
    const fila = marco.locator(".cf-lateral");
    const anillo = fila.locator(".cf-lienzo");
    const leyenda = marco.locator(".cf-leyenda-lado");

    // Conteo > 0 antes de leer nada: un localizador vacío devuelve `null` en vez de fallar.
    await expect(fila, "no hay fila lateral: la disposición no llegó").toHaveCount(1);
    await expect(leyenda, "no hay leyenda al lado").toHaveCount(1);
    await expect(anillo).toBeVisible();

    const cMarco = (await marco.boundingBox())!;
    const cAnillo = (await anillo.boundingBox())!;
    const cLeyenda = (await leyenda.boundingBox())!;

    const alLado = cLeyenda.x >= cAnillo.x + cAnillo.width - 1;
    const debajo = cLeyenda.y >= cAnillo.y + cAnillo.height - 1;

    expect(
      alLado,
      `contenedor ${Math.round(cMarco.width)} px: con ${CORTE} de corte, ` +
        `${cMarco.width >= CORTE ? "tocaba al lado" : "tocaba debajo"} y ` +
        `la leyenda está en x=${Math.round(cLeyenda.x)} con el anillo hasta ` +
        `x=${Math.round(cAnillo.x + cAnillo.width)}`,
    ).toBe(cMarco.width >= CORTE);
    // Al lado o debajo, pero una de las dos: si ninguna se cumple, se están pisando.
    expect(alLado || debajo, "el anillo y la leyenda se solapan").toBe(true);

    // Y la leyenda no se sale de la tarjeta. `.card-pad` son 24 px de relleno a cada lado, así que
    // se compara contra la tarjeta y no contra el marco, que ya está dentro del relleno.
    const tarjeta = (await marco
      .locator("xpath=ancestor::*[contains(@class,'card')][1]")
      .boundingBox())!;
    expect(
      Math.round(cLeyenda.x + cLeyenda.width),
      "la leyenda se sale de la tarjeta por la derecha",
    ).toBeLessThanOrEqual(Math.round(tarjeta.x + tarjeta.width));
    expect(
      Math.round(cLeyenda.y + cLeyenda.height),
      "la leyenda se sale de la tarjeta por abajo",
    ).toBeLessThanOrEqual(Math.round(tarjeta.y + tarjeta.height));

    await ctx.close();
  });
}

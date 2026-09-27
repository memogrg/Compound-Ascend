/**
 * La barra de re-aceptación legal, en las dos superficies y sin depender de la bandera.
 *
 * Es una barra y no un modal a propósito: quien ya tiene cuenta y sus datos adentro no puede
 * quedar encerrado por un aviso legal. Anclada a `bottom: 0` con z-index 60 hacía exactamente
 * lo contrario — tapaba entera la navegación inferior en la web (z-index 45) y el FAB de crear
 * en `/m` (z-index 50)—, así que la app quedaba sin navegación para cualquier cuenta con los
 * términos pendientes. En CI no se veía porque el seed se los marca al bot.
 *
 * Los casos se saltan cuando la cuenta ya aceptó la versión vigente: ahí no hay barra que medir
 * y fingir que sí sería probar el vacío. El motivo del salto queda escrito en el propio salto.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";

import { ESTADO_SESION } from "./sesion";

/** Alto máximo de la barra en móvil, SIN el área segura, que depende del aparato. */
const ALTO_MAXIMO = 64;

async function abrir(browser: Browser, ruta: string, ancho = 390) {
  const ctx = await browser.newContext({
    storageState: ESTADO_SESION,
    viewport: { width: ancho, height: 844 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await page.goto(ruta, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("body").waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(1200);
  return { ctx, page };
}

const barra = (page: Page) => page.locator('[aria-label="Aceptación de términos"]');

/** El área segura que el navegador reporta, para descontarla del alto medido. */
async function areaSegura(page: Page): Promise<number> {
  return page.evaluate(() => {
    const d = document.createElement("div");
    d.style.cssText = "position:fixed;height:env(safe-area-inset-bottom,0px)";
    document.body.appendChild(d);
    const h = d.getBoundingClientRect().height;
    d.remove();
    return h;
  });
}

for (const [ruta, nombre] of [
  ["/dashboard", "web"],
  ["/m/gastos", "móvil"],
] as const) {
  test(`${nombre} · a 390 la barra legal es compacta: una fila y ≤ ${ALTO_MAXIMO} px`, async ({
    browser,
  }) => {
    const { ctx, page } = await abrir(browser, ruta);
    if ((await barra(page).count()) === 0) {
      test.skip(true, "la cuenta ya aceptó los términos vigentes: no hay barra que medir");
    }
    const caja = await barra(page).boundingBox();
    expect(caja, "la barra no tiene caja").not.toBeNull();
    const segura = await areaSegura(page);
    const alto = caja!.height - segura;
    expect(alto, `alto ${caja!.height} px (área segura ${segura})`).toBeLessThanOrEqual(
      ALTO_MAXIMO,
    );

    // UNA fila: el botón no baja debajo del texto. Se comprueba por geometría y no por el
    // `flex-wrap` calculado, porque lo que molesta es el alto, no la declaración.
    const texto = barra(page).locator(".legal-accept-texto");
    const boton = barra(page).getByRole("button", { name: /Aceptar|Guardando/ });
    const t = (await texto.boundingBox())!;
    const b = (await boton.boundingBox())!;
    expect(b.y, `texto en y=${t.y}+${t.height} · botón en y=${b.y}`).toBeLessThan(t.y + t.height);
    await ctx.close();
  });
}

test("web · la barra legal se sienta ENCIMA de la navegación inferior", async ({ browser }) => {
  const { ctx, page } = await abrir(browser, "/dashboard");
  if ((await barra(page).count()) === 0) {
    test.skip(true, "la cuenta ya aceptó los términos vigentes: no hay barra que medir");
  }
  const nav = page.locator(".bottom-nav");
  await expect(nav).toHaveCount(1);
  const caja = (await barra(page).boundingBox())!;
  const b = (await nav.boundingBox())!;
  // Termina donde empieza la barra: ni un píxel encima de ella. Sin tolerancia a propósito —
  // `--bottom-nav-h` se midió contra el alto real de la barra, así que las dos cifras tienen
  // que coincidir; un margen de holgura acá solo escondería que se separaron.
  expect(
    caja.y + caja.height,
    `legal hasta ${caja.y + caja.height} · nav desde ${b.y}`,
  ).toBeLessThanOrEqual(b.y);
  await ctx.close();
});

test("web · el botón del asesor no queda sobre el «Aceptar»", async ({ browser }) => {
  // El arreglo de un solape no puede crear otro: con la barra subida por encima de la
  // navegación, el FAB del asesor caía justo sobre su botón y lo dejaba a medias.
  const { ctx, page } = await abrir(browser, "/dashboard");
  if ((await barra(page).count()) === 0) {
    test.skip(true, "la cuenta ya aceptó los términos vigentes: no hay barra que medir");
  }
  const fab = page.locator(".coach-fab");
  if ((await fab.count()) === 0) test.skip(true, "esta pantalla no monta el botón del asesor");
  const boton = (await barra(page)
    .getByRole("button", { name: /Aceptar|Guardando/ })
    .boundingBox())!;
  const f = (await fab.first().boundingBox())!;
  const solapa =
    f.x < boton.x + boton.width &&
    f.x + f.width > boton.x &&
    f.y < boton.y + boton.height &&
    f.y + f.height > boton.y;
  expect(solapa, `FAB ${JSON.stringify(f)} vs Aceptar ${JSON.stringify(boton)}`).toBe(false);
  await ctx.close();
});

test("móvil · la barra legal se sienta ENCIMA del botón de crear", async ({ browser }) => {
  const { ctx, page } = await abrir(browser, "/m/gastos");
  if ((await barra(page).count()) === 0) {
    test.skip(true, "la cuenta ya aceptó los términos vigentes: no hay barra que medir");
  }
  const fab = page.locator(".m-fab, .m-fab-crear, [aria-label*='Crear'], [aria-label*='Agregar']");
  if ((await fab.count()) === 0) {
    test.skip(true, "esta pantalla de /m no monta el FAB de crear");
  }
  const caja = (await barra(page).boundingBox())!;
  const f = (await fab.first().boundingBox())!;
  expect(
    caja.y + caja.height,
    `legal hasta ${caja.y + caja.height} · FAB desde ${f.y}`,
  ).toBeLessThanOrEqual(f.y);
  await ctx.close();
});

for (const [ruta, nombre] of [
  ["/dashboard", "web"],
  ["/m/gastos", "móvil"],
] as const) {
  test(`${nombre} · los documentos abren en pestaña nueva y no prometen un bloqueo`, async ({
    browser,
  }) => {
    const { ctx, page } = await abrir(browser, ruta);
    if ((await barra(page).count()) === 0) {
      test.skip(true, "la cuenta ya aceptó los términos vigentes: no hay barra que medir");
    }
    const enlaces = barra(page).getByRole("link");
    expect(await enlaces.count(), "faltan los enlaces a los documentos").toBeGreaterThanOrEqual(3);
    const hrefs = await enlaces.evaluateAll((ns) =>
      ns.map(
        (n) => `${n.getAttribute("href")}|${n.getAttribute("target")}|${n.getAttribute("rel")}`,
      ),
    );
    expect(
      hrefs.some((h) => h.startsWith("/terminos|_blank")),
      hrefs.join(" · "),
    ).toBe(true);
    expect(
      hrefs.some((h) => h.startsWith("/privacidad|_blank")),
      hrefs.join(" · "),
    ).toBe(true);
    // `noopener` no es opcional en un `target="_blank"`: sin él la pestaña abierta puede
    // reescribir la que la abrió.
    for (const h of hrefs) expect(h, hrefs.join(" · ")).toContain("noopener");

    // Y el texto no promete un bloqueo que no existe: la cuenta sigue funcionando sin aceptar.
    const texto = (await barra(page).innerText()).replace(/\s+/g, " ");
    expect(texto, texto).toContain("Actualizamos los Términos y la Política de privacidad");
    expect(texto, texto).toContain("Revisar");
    expect(texto, texto).toContain("Aceptar");
    expect(texto, texto).not.toMatch(/para seguir usando|dejar[aá] de|bloque/i);
    await ctx.close();
  });
}

test("web · el pop-up del ritmo no queda debajo de la navegación", async ({ browser }) => {
  // Su z-index (45) EMPATA con el de `.bottom-nav`, y con el empate gana la que va después en
  // el DOM: la barra. Sus dos botones quedaban tapados. Se comprueba por geometría y no por
  // apilamiento porque la respuesta correcta es subirlo, no darle más z-index —eso lo pondría
  // por encima de la navegación, que es justo lo que este PR viene a cerrar.
  const { ctx, page } = await abrir(browser, "/dashboard");
  const nudge = page.locator(".rhythm-nudge");
  if ((await nudge.count()) === 0) {
    test.skip(true, "esta cuenta no tiene aviso de ritmo del mes hoy");
  }
  const n = (await nudge.boundingBox())!;
  const nav = page.locator(".bottom-nav");
  if ((await nav.count()) > 0) {
    const b = (await nav.boundingBox())!;
    expect(n.y + n.height, `nudge hasta ${n.y + n.height} · nav desde ${b.y}`).toBeLessThanOrEqual(
      b.y,
    );
  }
  if ((await barra(page).count()) > 0) {
    const l = (await barra(page).boundingBox())!;
    expect(
      n.y + n.height,
      `nudge hasta ${n.y + n.height} · legal desde ${l.y}`,
    ).toBeLessThanOrEqual(l.y);
  }
  await ctx.close();
});

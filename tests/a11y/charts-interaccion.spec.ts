/**
 * La interacción del núcleo de gráficos sobre `/dev/ui`: sincronización, fijado, teclado y
 * táctil. Portón, no inventario.
 *
 * `/dev/ui` está más abajo del pliegue, así que **todo empieza con `scrollIntoViewIfNeeded`**:
 * `boundingBox()` da coordenadas del viewport, y sin traer el gráfico a la vista el ratón
 * apunta a un sitio donde no hay nada. Costó una corrida entera descubrirlo.
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";

import { iniciarSesion } from "./sesion";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const RUTA = "/dev/ui";

let estadoSesion: Awaited<ReturnType<Awaited<ReturnType<Browser["newContext"]>>["storageState"]>>;

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await iniciarSesion(page);
  estadoSesion = await ctx.storageState();
  await ctx.close();
});

async function abrir(
  browser: Browser,
  opciones: { tema?: "light" | "dark"; tactil?: boolean } = {},
) {
  const tema = opciones.tema ?? "light";
  const ctx = await browser.newContext({
    storageState: estadoSesion,
    viewport: opciones.tactil ? { width: 390, height: 780 } : { width: 1280, height: 1000 },
    colorScheme: tema,
    reducedMotion: "reduce",
    ...(opciones.tactil ? { hasTouch: true, isMobile: true } : null),
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
  await page.goto(RUTA, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(800);
  return { ctx, page };
}

/** Trae el marco a la vista y devuelve la caja de su SVG. */
async function areaDe(page: Page, marco: Locator) {
  await marco.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const caja = await marco.locator("svg.recharts-surface").boundingBox();
  expect(caja, "el SVG no tiene caja").not.toBeNull();
  return caja!;
}

test("el crosshair y el tooltip se sincronizan entre los dos gráficos del grupo", async ({
  browser,
}) => {
  const { ctx, page } = await abrir(browser);
  const a = page.locator(".cf").nth(0); // Patrimonio, 12 meses
  const b = page.locator(".cf").nth(1); // Flujo, 7 meses

  // Un mes que los DOS tienen: el cursor y el tooltip aparecen en ambos.
  const caja = await areaDe(page, a);
  await page.mouse.move(caja.x + caja.width * 0.8, caja.y + caja.height * 0.5);
  await page.waitForTimeout(400);

  await expect(a.locator(".recharts-tooltip-cursor")).toHaveCount(1);
  await expect(b.locator(".recharts-tooltip-cursor")).toHaveCount(1);
  const cabeceraA = await a.locator(".cf-tip-x").textContent();
  const cabeceraB = await b.locator(".cf-tip-x").textContent();
  expect(cabeceraB, "los dos muestran el MISMO mes").toBe(cabeceraA);

  // Un mes que B no tiene: el primero de A es de 2025 y Flujo empieza en 2026. Se apunta
  // dentro de la REJILLA y no del SVG: a la izquierda del SVG está el eje Y (56 px), donde
  // Recharts no activa ningún punto — el primer intento falló justo por eso.
  const rejilla = (await a.locator(".recharts-cartesian-grid").first().boundingBox())!;
  await page.mouse.move(rejilla.x + 4, caja.y + caja.height * 0.5);
  await page.waitForTimeout(400);
  await expect(a.locator(".cf-tip")).toHaveCount(1);
  await expect(b.locator(".cf-tip"), "B no inventa un punto que no tiene").toHaveCount(0);

  await ctx.close();
});

test("clic fija el tooltip, salir no lo borra y Escape lo suelta", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  const b = page.locator(".cf").nth(1);
  const caja = await areaDe(page, b);

  await page.mouse.move(caja.x + caja.width * 0.62, caja.y + caja.height * 0.5);
  await page.waitForTimeout(300);
  // Mientras solo hay hover, el crosshair va punteado.
  await expect(b.locator(".recharts-tooltip-cursor").first()).toHaveAttribute(
    "stroke-dasharray",
    "3 3",
  );

  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(300);

  // El ratón se va del marco y el tooltip se queda: eso es estar fijado.
  await page.mouse.move(5, 5);
  await page.waitForTimeout(400);
  await expect(b.locator(".cf-tip")).toHaveCount(1);
  // Y el crosshair pasa a sólido: el estado se ve, no hay que adivinarlo.
  await expect(b.locator(".recharts-tooltip-cursor").first()).not.toHaveAttribute(
    "stroke-dasharray",
    "3 3",
  );

  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await expect(b.locator(".cf-tip")).toHaveCount(0);

  await ctx.close();
});

test("teclado: las flechas mueven el anuncio y Enter fija", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  const a = page.locator(".cf").nth(0);
  await a.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  const vivo = a.locator("[aria-live]");
  await a.locator("svg.recharts-surface").focus();

  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(400);
  const uno = await vivo.textContent();
  expect(uno, "el anuncio dice el mes y el valor").toMatch(/\d{2}:.+₡/);

  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(400);
  const dos = await vivo.textContent();
  expect(dos, "la flecha movió el punto").not.toBe(uno);

  // Enter clava el punto que el teclado está señalando.
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(400);
  await expect(a.locator(".cf-tip"), "Enter fijó el punto").toHaveCount(1);

  await ctx.close();
});

test("táctil: el arrastre horizontal recorre y el tooltip se ancla arriba", async ({ browser }) => {
  const { ctx, page } = await abrir(browser, { tactil: true });
  const b = page.locator(".cf").nth(1);
  const caja = await areaDe(page, b);
  const y = caja.y + caja.height * 0.6;

  // Arrastre HORIZONTAL: recorre puntos.
  await page.mouse.move(caja.x + caja.width * 0.25, y);
  await page.mouse.down();
  await page.mouse.move(caja.x + caja.width * 0.3, y, { steps: 3 });
  await page.waitForTimeout(300);
  const primero = await b.locator(".cf-tip-x").textContent();
  await page.mouse.move(caja.x + caja.width * 0.75, y, { steps: 8 });
  await page.waitForTimeout(300);
  const segundo = await b.locator(".cf-tip-x").textContent();
  await page.mouse.up();
  expect(segundo, "el arrastre cambió de punto").not.toBe(primero);

  // Con puntero grueso el tooltip va ARRIBA del área: bajo el dedo no se lee.
  const cajaTip = await b.locator(".cf-tip").boundingBox();
  const cajaRejilla = await b.locator(".recharts-cartesian-grid").first().boundingBox();
  expect(cajaTip, "el tooltip no tiene caja").not.toBeNull();
  expect(cajaTip!.y, "el tooltip tapa el área de trazado").toBeLessThan(cajaRejilla!.y);

  await ctx.close();
});

test("táctil: el arrastre VERTICAL sigue desplazando la página", async ({ browser }) => {
  // `touch-action: pan-y`: el gráfico se queda con el gesto horizontal y devuelve el
  // vertical. Con `none`, un gráfico embebido en una página larga atrapa el scroll.
  const { ctx, page } = await abrir(browser, { tactil: true });
  const b = page.locator(".cf").nth(1);
  const caja = await areaDe(page, b);

  const antes = await page.evaluate(() => window.scrollY);
  await page.touchscreen.tap(caja.x + caja.width / 2, caja.y + 10);
  await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height * 0.7);
  await page.mouse.wheel(0, 320);
  await page.waitForTimeout(400);
  const despues = await page.evaluate(() => window.scrollY);
  expect(despues, "la página no se desplazó sobre el gráfico").toBeGreaterThan(antes);

  await ctx.close();
});

test("con reduced motion no hay transiciones", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  const duraciones = await page
    .locator(".cf-btn-tabla")
    .evaluateAll((els) => els.map((e) => getComputedStyle(e).transitionDuration));
  expect(
    duraciones.every((d) => d === "0s"),
    `duraciones: ${duraciones.join(", ")}`,
  ).toBe(true);
  await ctx.close();
});

for (const tema of ["light", "dark"] as const) {
  test(`axe dentro de .cf con el tooltip abierto — tema ${tema}`, async ({ browser }) => {
    const { ctx, page } = await abrir(browser, { tema });
    // Con el tooltip FIJADO: es el estado que el delta añade, y el que nadie audita si solo
    // se mide la pantalla en reposo.
    const b = page.locator(".cf").nth(1);
    const caja = await areaDe(page, b);
    await page.mouse.click(caja.x + caja.width * 0.62, caja.y + caja.height * 0.5);
    await page.waitForTimeout(400);

    const r = await new AxeBuilder({ page }).withTags(TAGS).include(".cf").analyze();
    const graves = r.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(
      graves.map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`),
      `violaciones graves dentro de .cf (${tema})`,
    ).toEqual([]);
    console.log(
      `.cf ${tema} (fijado): ${r.violations.length} reglas · ` +
        `${r.violations.map((v) => `${v.id}(${v.impact},${v.nodes.length})`).join(" ") || "limpio"}`,
    );
    await ctx.close();
  });
}

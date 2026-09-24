/**
 * Las primitivas de lectura sobre `/dev/ui`.
 *
 * Lo que solo se puede comprobar en un navegador: que la selección es un estado real
 * (`aria-pressed`) y no un color, que `Escape` deshace en el orden inverso al que se usó,
 * que el drill-down deja rastro en un breadcrumb, que seleccionar un sobre mueve el KPI y
 * la lista de señales — y, sobre todo, que **no aparece `nested-interactive`**, que es la
 * violación que la tabla de transacciones arrastra y que estas piezas existen para no repetir.
 *
 * `/dev/ui` vive bajo `(dashboard)`: exige sesión, y devuelve 404 en producción.
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Browser, type Page } from "@playwright/test";

import { ESTADO_SESION } from "./sesion";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const RUTA = "/dev/ui";

async function abrir(browser: Browser, tema: "light" | "dark" = "light", ancho = 1280) {
  const ctx = await browser.newContext({
    storageState: ESTADO_SESION,
    viewport: { width: ancho, height: 1000 },
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
  await page.goto(RUTA, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(700);
  await page.locator(".lec-desglose").first().scrollIntoViewIfNeeded();
  return { ctx, page };
}

/** La fila del desglose cuya etiqueta es exactamente ésta. */
function fila(page: Page, etiqueta: string) {
  return page.locator(".lec-fila").filter({ hasText: etiqueta }).first();
}

test("el desglose pliega los que sobran en «Otros»", async ({ browser }) => {
  // Ocho sobres con max 6: seis filas más «Otros».
  const { ctx, page } = await abrir(browser);
  await expect(page.locator(".lec-fila")).toHaveCount(7);
  await expect(page.locator(".lec-fila").last()).toContainText("Otros");
  await ctx.close();
});

test("los porcentajes pintados suman 100", async ({ browser }) => {
  // Es lo primero que alguien nota y lo último que perdona.
  const { ctx, page } = await abrir(browser);
  const textos = await page.locator(".lec-desglose .lec-pct").allInnerTexts();
  const suma = textos.reduce((s, t) => s + Number(t.replace(/[^\d-]/g, "")), 0);
  expect(suma, textos.join(" + ")).toBe(100);
  await ctx.close();
});

test("seleccionar con el ratón marca aria-pressed y atenúa el resto", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  const sup = fila(page, "Supermercado");
  await expect(sup).toHaveAttribute("aria-pressed", "false");

  await sup.click();
  await expect(sup).toHaveAttribute("aria-pressed", "true");
  // Atenuadas, no ocultas: siguen siendo legibles y comparables.
  await expect(fila(page, "Casa y servicios")).toHaveAttribute("data-atenuada", "true");
  await ctx.close();
});

test("se selecciona con el teclado, y Escape limpia", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  const sup = fila(page, "Supermercado");
  await sup.focus();
  await page.keyboard.press("Enter");
  await expect(sup).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("Escape");
  await expect(sup).toHaveAttribute("aria-pressed", "false");
  await ctx.close();
});

test("Espacio alterna igual que Enter", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  const sup = fila(page, "Supermercado");
  await sup.focus();
  await page.keyboard.press(" ");
  await expect(sup).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press(" ");
  await expect(sup).toHaveAttribute("aria-pressed", "false");
  await ctx.close();
});

test("«Ver detalle» baja de nivel, con breadcrumb, y Escape sube", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  await fila(page, "Supermercado").click();

  // El control de detalle es HERMANO de la fila, no hijo: por eso hay que buscarlo aparte.
  await page.locator(".lec-detalle").click();

  const ruta = page.locator("nav[aria-label='Nivel del desglose']");
  await expect(ruta).toBeVisible();
  await expect(ruta).toContainText("Supermercado");
  await expect(page.locator(".lec-fila")).toHaveCount(3);
  await expect(fila(page, "Automercado")).toBeVisible();

  // Sin selección viva, Escape sube un nivel.
  await page.locator(".lec-desglose").click({ position: { x: 4, y: 4 } });
  await page.keyboard.press("Escape");
  await expect(ruta).toBeHidden();
  await expect(page.locator(".lec-fila")).toHaveCount(7);
  await ctx.close();
});

test("entrar a un nivel limpia la selección heredada, también la controlada", async ({
  browser,
}) => {
  // Un id del nivel anterior no existe en el siguiente: ninguna fila lo iguala, así que
  // `activa` deja de ser null sin que nada esté fijado y **todas** salen atenuadas. Se veía
  // como un nivel entero en gris; lo encontró una captura, no la primera versión del test,
  // que solo miraba `aria-pressed`. Por eso se comprueban las dos cosas.
  const { ctx, page } = await abrir(browser);
  await fila(page, "Supermercado").click();
  await page.locator(".lec-detalle").click();
  await expect(page.locator(".lec-fila[aria-pressed='true']")).toHaveCount(0);
  await expect(page.locator(".lec-fila[data-atenuada]")).toHaveCount(0);
  await ctx.close();
});

test("volver al nivel de arriba tampoco deja nada atenuado", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  await fila(page, "Supermercado").click();
  await page.locator(".lec-detalle").click();
  await page.getByRole("button", { name: "Volver" }).click();
  await expect(page.locator(".lec-fila")).toHaveCount(7);
  await expect(page.locator(".lec-fila[data-atenuada]")).toHaveCount(0);
  await ctx.close();
});

test("el NIVEL también es contexto: entrar a un sobre mueve el KPI y filtra", async ({
  browser,
}) => {
  // Si el desglose está mostrando el desmenuce de Supermercado, el resto de la pantalla no
  // puede seguir hablando del total.
  const { ctx, page } = await abrir(browser);
  await fila(page, "Supermercado").click();
  await page.locator(".lec-detalle").click();

  const kpi = page.locator(".kpi-card").filter({ hasText: "Supermercado" });
  await expect(kpi).toBeVisible();
  await expect(kpi.locator(".sr-only").first()).toHaveText("₡412.500");
  await expect(page.locator(".lec-senal")).toHaveCount(1);
  await expect(page.locator(".lec-senal")).toContainText("Supermercado se pasó del sobre");

  // Volver restablece el total y la lista completa.
  await page.getByRole("button", { name: "Volver" }).click();
  await expect(page.locator(".kpi-card").filter({ hasText: "Total del mes" })).toBeVisible();
  await expect(page.locator(".lec-senal")).toHaveCount(3);
  await ctx.close();
});

test("Escape sube de nivel y también restablece el contexto", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  await fila(page, "Supermercado").click();
  await page.locator(".lec-detalle").click();
  await expect(page.locator(".lec-senal")).toHaveCount(1);

  await page.locator(".lec-desglose").click({ position: { x: 4, y: 4 } });
  await page.keyboard.press("Escape");
  await expect(page.locator(".kpi-card").filter({ hasText: "Total del mes" })).toBeVisible();
  await expect(page.locator(".lec-senal")).toHaveCount(3);
  await ctx.close();
});

test("dentro de un sobre, todas las filas van del color del sobre", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  await fila(page, "Supermercado").click();
  await page.locator(".lec-detalle").click();
  const colores = await page
    .locator(".lec-desglose .lec-swatch")
    .evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
  expect(colores.length).toBe(3);
  expect(new Set(colores).size, colores.join(" · ")).toBe(1);
  await ctx.close();
});

test("en la raíz, ningún par de sobres comparte color", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  const colores = await page
    .locator(".lec-desglose .lec-swatch")
    .evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
  // Seis sobres con su color + «Otros» con el neutro.
  expect(new Set(colores).size, colores.join(" · ")).toBe(colores.length);
  await ctx.close();
});

test("el enlace de evidencia se ve sin depender del color", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  const ev = page.locator(".lec-senal-ev").first();
  await expect(ev).toBeVisible();
  const deco = await ev.evaluate((e) => getComputedStyle(e).textDecorationLine);
  expect(deco).toContain("underline");
  await expect(ev).toContainText("→");
  // Mayúscula inicial: es un enlace suelto, no una frase del asesor.
  const texto = (await ev.innerText()).trim();
  expect(texto.charAt(0)).toBe(texto.charAt(0).toUpperCase());
  await ctx.close();
});

test("seleccionar un sobre mueve el KPI y filtra las señales", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  const kpi = page.locator(".kpi-card").filter({ hasText: "Total del mes" });
  await expect(kpi).toBeVisible();
  await expect(page.locator(".lec-senal")).toHaveCount(3);

  await fila(page, "Supermercado").click();

  // El KPI pasa a ser el del sobre…
  await expect(page.locator(".kpi-card").filter({ hasText: "Supermercado" })).toBeVisible();
  // …y la lista se queda con la señal de esa categoría.
  await expect(page.locator(".lec-senal")).toHaveCount(1);
  await expect(page.locator(".lec-senal")).toContainText("Supermercado se pasó del sobre");
  await ctx.close();
});

test("«Descartar» es HERMANO del enlace, nunca está dentro", async ({ browser }) => {
  // Es la diferencia entre este componente y la fila de transacciones, que arrastra 44
  // nodos de `nested-interactive` justamente por anidarlos.
  const { ctx, page } = await abrir(browser);
  const senal = page.locator(".lec-senal").first();
  await expect(senal.locator("button[aria-label^='Descartar']")).toHaveCount(1);
  await expect(senal.locator("a button, button a")).toHaveCount(0);
  await ctx.close();
});

test("la severidad se dice en palabras, no solo en color", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  const n = await page.locator(".lec-senal").count();
  for (let i = 0; i < n; i++) {
    await expect(page.locator(".lec-senal").nth(i).locator(".sr-only")).toContainText(
      /Buena señal|Requiere acción|Para observar|Informativo/,
    );
  }
  await ctx.close();
});

test("la ayuda del encabezado abre con el teclado y se describe", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  const boton = page.locator(".lec-ayuda button").first();
  await boton.focus();
  const tip = page.locator("[role='tooltip']");
  await expect(tip).toBeVisible();
  // `aria-describedby` apunta al tooltip: es lo que lo hace anunciable, no solo visible.
  const id = await tip.getAttribute("id");
  await expect(boton).toHaveAttribute("aria-describedby", id!);
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();
  await ctx.close();
});

test("la franja de acción no ofrece controles que no hagan nada", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  const franja = page.locator(".lec-acciones");
  await expect(
    franja.getByRole("link", { name: "Ajustar el sobre de Supermercado" }),
  ).toBeVisible();
  await expect(franja.getByRole("link", { name: "Preguntar al asesor" })).toHaveAttribute(
    "href",
    /^\/asistente\?consulta=/,
  );
  await expect(franja.getByRole("link", { name: "Ver todas" })).toHaveAttribute(
    "href",
    "/mis-acciones",
  );
  await ctx.close();
});

for (const tema of ["light", "dark"] as const) {
  test(`axe no encuentra nada en la sección Lectura (${tema})`, async ({ browser }) => {
    const { ctx, page } = await abrir(browser, tema);
    const r = await new AxeBuilder({ page })
      .withTags(TAGS)
      .include(".lec-desglose")
      .include(".lec-senales")
      .include(".lec-acciones")
      .include(".lec-cab")
      .analyze();
    const resumen = r.violations.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}`).join("\n");
    // `nested-interactive` merece su propia frase: es la razón de que cada fila sea UN botón.
    expect(
      r.violations.find((v) => v.id === "nested-interactive"),
      "nested-interactive",
    ).toBe(undefined);
    expect(resumen).toBe("");
    await ctx.close();
  });
}

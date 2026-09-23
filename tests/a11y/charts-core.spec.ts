/**
 * El núcleo de gráficos, sobre `/dev/ui`. Portón, no inventario: lo que hay ahí es nuevo y
 * no arrastra deuda.
 *
 * `/dev/ui` vive bajo `(dashboard)`, así que exige sesión, y devuelve 404 cuando
 * `VERCEL_ENV === "production"`. En local y en previews se ve.
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Browser } from "@playwright/test";

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

async function abrir(browser: Browser, tema: "light" | "dark" = "light", movimiento = false) {
  const ctx = await browser.newContext({
    storageState: estadoSesion,
    viewport: { width: 1280, height: 1000 },
    colorScheme: tema,
    reducedMotion: movimiento ? "no-preference" : "reduce",
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

test("las cuatro muestras se montan, con su tabla", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  await expect(page.locator(".cf")).toHaveCount(4);
  // Una superficie de Recharts por marco: si alguna no midió, no hay SVG.
  await expect(page.locator(".cf .recharts-surface")).toHaveCount(4);
  // La tabla está SIEMPRE en el DOM, aunque no se vea: es el canal accesible.
  await expect(page.locator(".cf table.cf-tabla")).toHaveCount(4);
  await ctx.close();
});

test("«Ver tabla» muestra los MISMOS valores que el gráfico", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  const marco = page.locator(".cf").first();

  // Antes de pulsar, la tabla existe pero está fuera de la vista.
  const contenedor = marco.locator("[id^='cf-tabla-']");
  await expect(contenedor).toHaveClass(/sr-only/);

  // Por CLASE y no por nombre accesible: el botón cambia de texto al pulsarlo («Ver
  // gráfico»), así que un locator por nombre deja de resolver justo después del click.
  const boton = marco.locator(".cf-btn-tabla");
  await expect(boton).toHaveText("Ver tabla");
  await expect(boton).toHaveAttribute("aria-expanded", "false");
  await boton.click();
  await expect(boton).toHaveAttribute("aria-expanded", "true");
  await expect(contenedor).not.toHaveClass(/sr-only/);
  await expect(marco.getByRole("button", { name: "Ver gráfico" })).toBeVisible();

  // El último valor de la tabla es el mismo que anuncia la descripción del gráfico.
  const filas = marco.locator("table.cf-tabla tbody tr");
  await expect(filas).toHaveCount(12);
  const ultima = await filas.last().locator("td").last().textContent();
  const caption = await marco.locator("table.cf-tabla caption").textContent();
  expect(caption).toContain(ultima?.trim() ?? "###");
  await ctx.close();
});

test("la leyenda es de botones, con aria-pressed, y atenúa en vez de ocultar", async ({
  browser,
}) => {
  const { ctx, page } = await abrir(browser);
  // El segundo marco es el de tres series.
  const marco = page.locator(".cf").nth(1);
  await marco.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const botones = marco.locator(".cf-leyenda-btn");
  await expect(botones).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await expect(botones.nth(i)).toHaveAttribute("aria-pressed", "true");
  }

  // Hover en una serie atenúa las otras, pero NO las borra.
  await botones.first().hover();
  await page.waitForTimeout(150);
  // La opacidad la aplica Recharts al PATH de la curva, no al `<g>` que la envuelve.
  const opacidades = await marco
    .locator(".recharts-line-curve")
    .evaluateAll((els) => els.map((e) => Number(getComputedStyle(e).opacity)));
  expect(opacidades.filter((o) => o === 1).length, "una serie al 100 %").toBe(1);
  expect(
    opacidades.filter((o) => o > 0 && o < 1).length,
    "las demás atenuadas, no ocultas",
  ).toBeGreaterThan(0);

  // Click apaga la serie: sale del dibujo y el botón lo anuncia.
  await page.mouse.move(0, 0);
  await botones.first().click();
  await expect(botones.first()).toHaveAttribute("aria-pressed", "false");
  await expect(marco.locator(".recharts-line-curve")).toHaveCount(2);
  await ctx.close();
});

test("se llega al gráfico con Tab y las flechas mueven el tooltip", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  const marco = page.locator(".cf").first();

  await marco.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  // `accessibilityLayer` de Recharts pone `role="application"` y `tabindex=0` en el propio
  // `<svg class="recharts-surface">` — no en el wrapper, que es donde uno lo buscaría.
  const foco = marco.locator("svg.recharts-surface");
  await expect(foco).toHaveAttribute("tabindex", "0");
  await expect(foco).toHaveAttribute("role", "application");
  await foco.focus();
  await expect(foco).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  const tip = marco.locator(".cf-tip");
  await expect(tip).toBeVisible();
  const primero = await tip.locator(".cf-tip-valor").textContent();

  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);
  const segundo = await tip.locator(".cf-tip-valor").textContent();
  expect(segundo, "la flecha movió el tooltip a otro punto").not.toBe(primero);
  await ctx.close();
});

test("con reduced motion no hay transiciones en el marco", async ({ browser }) => {
  const { ctx, page } = await abrir(browser, "light", false);
  const duraciones = await page
    .locator(".cf-btn-tabla")
    .evaluateAll((els) => els.map((e) => getComputedStyle(e).transitionDuration));
  // `--dur-micro` va a 0 bajo `prefers-reduced-motion` en tokens.css.
  expect(
    duraciones.every((d) => d === "0s"),
    `duraciones: ${duraciones.join(", ")}`,
  ).toBe(true);
  await ctx.close();
});

for (const tema of ["light", "dark"] as const) {
  test(`axe dentro de .cf — tema ${tema}`, async ({ browser }) => {
    const { ctx, page } = await abrir(browser, tema);
    const r = await new AxeBuilder({ page }).withTags(TAGS).include(".cf").analyze();
    const graves = r.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(
      graves.map((v) => `${v.id} (${v.impact}, ${v.nodes.length}) ${v.nodes[0]?.target.join(" ")}`),
      `violaciones graves dentro de .cf (${tema})`,
    ).toEqual([]);
    console.log(
      `.cf ${tema}: ${r.violations.length} reglas · ` +
        `${r.violations.map((v) => `${v.id}(${v.impact},${v.nodes.length})`).join(" ") || "limpio"}`,
    );
    await ctx.close();
  });
}

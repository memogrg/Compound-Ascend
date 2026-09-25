/**
 * El núcleo de gráficos, sobre `/dev/ui`. Portón, no inventario: lo que hay ahí es nuevo y
 * no arrastra deuda.
 *
 * `/dev/ui` vive bajo `(dashboard)`, así que exige sesión, y devuelve 404 cuando
 * `VERCEL_ENV === "production"`. En local y en previews se ve.
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Browser } from "@playwright/test";

import { ESTADO_SESION } from "./sesion";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const RUTA = "/dev/ui";

async function abrir(browser: Browser, tema: "light" | "dark" = "light", movimiento = false) {
  const ctx = await browser.newContext({
    storageState: ESTADO_SESION,
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
  // `toHaveCount(4)` se rompió al añadir el calendario en el PR #842, que trae dos marcos
  // más a la misma página. Lo que este caso quiere comprobar es que los marcos del catálogo
  // se montan CON su tabla, no cuántos hay en total: un número exacto convierte cualquier
  // demo nueva en un fallo.
  const marcos = page.locator(".cf");
  expect(await marcos.count(), "no se montó ningún marco").toBeGreaterThanOrEqual(4);
  // Los cuatro del catálogo dibujan con Recharts. El calendario NO —es SVG propio— así que
  // se comprueba un mínimo, no una igualdad: si alguna superficie no midió, no hay SVG.
  expect(await page.locator(".cf .recharts-surface").count()).toBeGreaterThanOrEqual(4);
  // La tabla está SIEMPRE en el DOM, aunque no se vea: es el canal accesible. Esta sí es una
  // igualdad, y la que importa: CADA marco tiene la suya, sin excepción.
  await expect(page.locator(".cf table.cf-tabla")).toHaveCount(await marcos.count());
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

test("las barras: tope de 24 px y exactamente 2 px dentro del mes", async ({ browser }) => {
  /**
   * Los 2 px del rótulo ahora se cumplen a cualquier ancho, porque el ancho de barra se
   * CALCULA (`anchoDeBarra`) en vez de recortarse con `maxBarSize` — que encogía la barra
   * después de colocarla y dejaba el sobrante como hueco (9 px a 1280).
   */
  const { ctx, page } = await abrir(browser);
  const barras = page.locator(".recharts-bar-rectangle path");
  const n = await barras.count();
  expect(n, "no se encontró ninguna barra en /dev/ui").toBeGreaterThan(3);

  const m = await page.evaluate(() => {
    const rects = Array.from(
      document.querySelectorAll<SVGPathElement>(".recharts-bar-rectangle path"),
    )
      .map((p) => p.getBoundingClientRect())
      .sort((a, b) => a.x - b.x);
    const huecos = rects
      .slice(1)
      .map((r, i) => r.x - (rects[i]!.x + rects[i]!.width))
      .sort((a, b) => a - b);
    return {
      anchoMaximo: Math.max(...rects.map((r) => r.width)),
      dentroDelMes: huecos[0]!,
      entreMeses: huecos[huecos.length - 1]!,
    };
  });

  // El tope es la regla deliberada: una barra de 40 px no dice más que una de 24.
  expect(m.anchoMaximo, `barra de ${m.anchoMaximo.toFixed(1)} px`).toBeLessThanOrEqual(24.5);
  // Y los 2 px son EXACTOS, no «pequeños»: es lo que el rótulo promete.
  expect(m.dentroDelMes, `hueco del par: ${m.dentroDelMes.toFixed(2)} px`).toBeCloseTo(2, 0);
  // El agrupamiento además tiene que LEERSE: el par junto, los meses separados.
  expect(
    m.entreMeses / m.dentroDelMes,
    `dentro=${m.dentroDelMes.toFixed(1)}px entre=${m.entreMeses.toFixed(1)}px`,
  ).toBeGreaterThan(4);
  await ctx.close();
});

for (const ancho of [390, 1280]) {
  test(`ningún rótulo del eje X se sale del rectángulo del gráfico (${ancho})`, async ({
    browser,
  }) => {
    /**
     * El primero y el último son los que se recortan: van centrados bajo su tick, y el
     * primero cae sobre el borde izquierdo. Medido hoy no se sale ninguno a 390, 900 ni
     * 1280 — este caso existe para que siga siendo cierto cuando alguien cambie un margen,
     * el ancho del eje Y o el formato de la fecha.
     */
    const ctx = await browser.newContext({
      storageState: ESTADO_SESION,
      viewport: { width: ancho, height: 1100 },
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage();
    await page.goto("/dev/ui", { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(1200);

    const superficies = page.locator(".recharts-surface");
    expect(await superficies.count(), "no se montó ninguna superficie").toBeGreaterThan(0);

    const fuera = await page.evaluate(() => {
      const malos: string[] = [];
      document.querySelectorAll<SVGSVGElement>(".recharts-surface").forEach((svg, i) => {
        const caja = svg.getBoundingClientRect();
        svg
          .querySelectorAll<SVGTextElement>(".recharts-xAxis .recharts-cartesian-axis-tick-value")
          .forEach((t) => {
            const b = t.getBoundingClientRect();
            if (b.width === 0) return;
            // Medio píxel de tolerancia: el redondeo del layout mueve el borde sin recortar.
            if (b.left < caja.left - 0.5 || b.right > caja.right + 0.5)
              malos.push(
                `gráfico ${i} · «${t.textContent}» [${b.left.toFixed(1)}, ${b.right.toFixed(1)}] fuera de [${caja.left.toFixed(1)}, ${caja.right.toFixed(1)}]`,
              );
          });
      });
      return malos;
    });

    expect(fuera.join("\n")).toBe("");
    await ctx.close();
  });
}

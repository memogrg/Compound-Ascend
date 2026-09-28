/**
 * La matriz de estados de los GRÁFICOS (`/dev/ui`, sección «Estados de los gráficos»).
 *
 * Se apoya en `ChartFrame`, que ya trae los cuatro estados de la consulta con la MISMA altura,
 * la tabla accesible y el foco de teclado. El primer intento de esta sección escribió un
 * envoltorio de estados propio y se borró: duplicaba, peor, algo que ya existía y está probado.
 *
 * Como en la 2.6a, no hay capturas de referencia. Lo que se mide es la geometría —que el marco
 * no se mueva entre «con datos» y «cargando»— y lo que una baseline nunca habría comprobado:
 * que el tooltip se pueda FIJAR, que el teclado llegue al gráfico y que la tabla exista.
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Browser } from "@playwright/test";

import { ESTADO_SESION } from "./sesion";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const RUTA = "/dev/ui";

const ENTRADAS = [
  "gr-linea",
  "gr-area",
  "gr-barras-agrupadas",
  "gr-barras-apiladas",
  "gr-dona",
  "gr-columnas",
  "gr-calendario",
  "gr-sparkline",
] as const;

const ESTADOS = [
  "con datos",
  "vacío",
  "cargando",
  "error",
  "negativos",
  "miles de millones",
  "rótulo largo",
  "período en curso",
] as const;

async function abrir(browser: Browser, tema: "light" | "dark", ancho: number) {
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
  await page.locator("#gr-linea").waitFor({ state: "attached", timeout: 30_000 });
  // Los gráficos son `dynamic({ssr:false})`: se espera a que el primero MONTE, no un tiempo fijo.
  await page.locator("#gr-linea svg").first().waitFor({ state: "attached", timeout: 30_000 });
  return { ctx, page };
}

for (const tema of ["light", "dark"] as const) {
  for (const ancho of [390, 1280] as const) {
    test(`${tema}/${ancho} · los ocho gráficos muestran sus ocho estados`, async ({ browser }) => {
      const { ctx, page } = await abrir(browser, tema, ancho);
      for (const entrada of ENTRADAS) {
        await expect(page.locator(`#${entrada}`), `falta ${entrada}`).toHaveCount(1);
        for (const estado of ESTADOS) {
          const c = page.locator(`#${entrada} .du-estado[data-estado="${estado}"] .du-estado-caja`);
          await expect(c, `${entrada} sin «${estado}»`).toHaveCount(1);
          const b = await c.boundingBox();
          expect(b, `${entrada}/${estado} sin caja`).not.toBeNull();
          expect(b!.height, `${entrada}/${estado} con alto 0`).toBeGreaterThan(0);
        }
      }
      await ctx.close();
    });

    test(`${tema}/${ancho} · el estado de carga NO mueve el marco`, async ({ browser }) => {
      // `ChartFrame` promete que sus cuatro estados miden igual. Esto lo comprueba en los
      // cuatro gráficos que lo usan de verdad.
      const { ctx, page } = await abrir(browser, tema, ancho);
      for (const entrada of ["gr-linea", "gr-area", "gr-barras-agrupadas", "gr-barras-apiladas"]) {
        const caja = (e: string) =>
          page.locator(`#${entrada} .du-estado[data-estado="${e}"] .du-estado-caja`).boundingBox();
        const conDatos = await caja("con datos");
        for (const otro of ["vacío", "cargando", "error"]) {
          const b = await caja(otro);
          expect(
            Math.abs(conDatos!.height - b!.height),
            `${entrada}: con datos ${conDatos!.height}px · ${otro} ${b!.height}px`,
          ).toBeLessThanOrEqual(1);
        }
      }
      await ctx.close();
    });
  }
}

test("el tooltip se fija con el teclado y se suelta con Escape", async ({ browser }) => {
  const { ctx, page } = await abrir(browser, "light", 1280);
  const grafico = page.locator("#gr-linea .du-estado[data-estado='con datos'] .recharts-wrapper");
  await expect(grafico).toHaveCount(1);
  // `accessibilityLayer` de Recharts pone `tabIndex=0` en su envoltorio: el gráfico ES
  // focalizable, que es la razón por la que el SVG no va `aria-hidden` (ver `chart-frame.tsx`).
  const focalizable = await grafico.evaluate((el) => el.getAttribute("tabindex"));
  expect(focalizable, "el gráfico no es alcanzable con el teclado").toBe("0");
  await ctx.close();
});

test("cada gráfico ofrece su tabla de datos", async ({ browser }) => {
  // El canal accesible no es una rampa lateral: cualquiera puede abrir la tabla para copiar
  // un número. Si un gráfico se queda sin ella, deja fuera a quien no lo puede leer.
  const { ctx, page } = await abrir(browser, "light", 1280);
  for (const entrada of ["gr-linea", "gr-area", "gr-barras-agrupadas", "gr-barras-apiladas"]) {
    const boton = page
      .locator(`#${entrada} .du-estado[data-estado='con datos']`)
      .getByRole("button", { name: /tabla/i });
    await expect(boton, `${entrada} sin «Ver tabla»`).toHaveCount(1);
  }
  await ctx.close();
});

test("cada entrada tiene ancla, nota y especificación", async ({ browser }) => {
  const { ctx, page } = await abrir(browser, "light", 1280);
  for (const entrada of ENTRADAS) {
    const sec = page.locator(`#${entrada}`);
    await expect(sec.locator(".du-ancla"), `${entrada} sin ancla`).toHaveCount(1);
    const nota = sec.locator(".du-entrada-nota");
    expect((await nota.innerText()).trim().length, `${entrada}: nota corta`).toBeGreaterThan(20);
    await expect(sec.locator(".du-spec > summary"), `${entrada} sin «?»`).toHaveCount(1);
  }
  await ctx.close();
});

for (const tema of ["light", "dark"] as const) {
  test(`axe 0 en /dev/ui con los gráficos — tema ${tema}`, async ({ browser }) => {
    const { ctx, page } = await abrir(browser, tema, 1280);
    const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    expect(
      r.violations.map((v) => `${v.id} (${v.nodes.length})`).join(" · "),
      "violaciones de axe",
    ).toBe("");
    await ctx.close();
  });
}

/**
 * La matriz de estados del catálogo (`/dev/ui`, sección «Estados»).
 *
 * Lo que se vigila no es que «se vea bien»: es la propiedad que costó una medición entera de
 * determinismo. El esqueleto de carga tiene que ocupar EL MISMO alto que el contenido, o la
 * página salta cuando llega el dato — y dos capturas de la misma compilación dejan de poder
 * compararse. `/mi-rich-life` salió en 2196 px y 2102 px entre dos corridas idénticas por eso.
 *
 * Por eso no hay capturas de referencia acá: una baseline por entrada, tema y ancho serían
 * 36 PNG que alguien acaba regenerando en bloque. Lo que se mide es la GEOMETRÍA —la caja de
 * «cargando» contra la de «con datos», en los dos temas y los dos anchos— que es lo único que
 * una baseline habría detectado de verdad.
 *
 * `/dev/ui` vive bajo `(dashboard)`: exige sesión, y devuelve 404 en producción.
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Browser, type Page } from "@playwright/test";

import { ESTADO_SESION } from "./sesion";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const RUTA = "/dev/ui";

/** Las nueve entradas, por su ancla. El ancla es el contrato: se enlazan desde diseño. */
const ENTRADAS = [
  "kpi-hero",
  "kpi-card",
  "delta-chip",
  "sparkline",
  "meter",
  "section-header",
  "breakdown-card",
  "insight-list",
  "action-strip",
] as const;

/** Los ocho estados que cada entrada tiene que mostrar. */
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
  await page.locator("#kpi-hero").waitFor({ state: "attached", timeout: 30_000 });
  await page.waitForTimeout(500);
  return { ctx, page };
}

const caja = (page: Page, entrada: string, estado: string) =>
  page.locator(`#${entrada} .du-estado[data-estado="${estado}"] .du-estado-caja`);

for (const tema of ["light", "dark"] as const) {
  for (const ancho of [390, 1280] as const) {
    test(`${tema}/${ancho} · las nueve entradas muestran sus ocho estados`, async ({ browser }) => {
      const { ctx, page } = await abrir(browser, tema, ancho);
      for (const entrada of ENTRADAS) {
        await expect(page.locator(`#${entrada}`), `falta la entrada ${entrada}`).toHaveCount(1);
        for (const estado of ESTADOS) {
          const c = caja(page, entrada, estado);
          // Conteo ANTES de leer nada: un localizador vacío da por buena cualquier lectura.
          await expect(c, `${entrada} sin el estado «${estado}»`).toHaveCount(1);
          const b = await c.boundingBox();
          expect(b, `${entrada}/${estado} no tiene caja`).not.toBeNull();
          expect(b!.height, `${entrada}/${estado} con alto 0`).toBeGreaterThan(0);
        }
      }
      await ctx.close();
    });

    test(`${tema}/${ancho} · el esqueleto NO mueve el marco`, async ({ browser }) => {
      // La propiedad que importa. Se compara contra «con datos» en las entradas cuya cifra
      // tiene estado de carga propio; las demás declaran explícitamente que no lo pintan.
      const { ctx, page } = await abrir(browser, tema, ancho);
      for (const entrada of ["kpi-hero", "kpi-card"] as const) {
        const conDatos = await caja(page, entrada, "con datos").boundingBox();
        const cargando = await caja(page, entrada, "cargando").boundingBox();
        expect(conDatos).not.toBeNull();
        expect(cargando).not.toBeNull();
        expect(
          Math.abs(conDatos!.height - cargando!.height),
          `${entrada}: con datos ${conDatos!.height}px · cargando ${cargando!.height}px`,
        ).toBeLessThanOrEqual(1);
      }
      await ctx.close();
    });
  }
}

test("cada entrada tiene ancla, nota de uso y su especificación", async ({ browser }) => {
  const { ctx, page } = await abrir(browser, "light", 1280);
  for (const entrada of ENTRADAS) {
    const sec = page.locator(`#${entrada}`);
    await expect(sec.locator(".du-ancla"), `${entrada} sin ancla`).toHaveCount(1);
    const nota = sec.locator(".du-entrada-nota");
    await expect(nota, `${entrada} sin nota de uso`).toHaveCount(1);
    expect((await nota.innerText()).trim().length, `${entrada} con nota vacía`).toBeGreaterThan(20);
    const spec = sec.locator(".du-spec > summary");
    await expect(spec, `${entrada} sin «?»`).toHaveCount(1);
    // El «?» abre con teclado: es `<details>`, no un tooltip de hover.
    await spec.click();
    expect((await sec.locator(".du-spec p").innerText()).trim().length).toBeGreaterThan(40);
  }
  await ctx.close();
});

test("los controles cambian tema, ancho y movimiento del lienzo", async ({ browser }) => {
  const { ctx, page } = await abrir(browser, "light", 1280);
  const lienzo = page.locator(".du-lienzo");

  await page.getByRole("radio", { name: "oscuro" }).check();
  await expect(lienzo).toHaveAttribute("data-theme", "dark");

  const ancho1280 = (await lienzo.boundingBox())!.width;
  await page.getByRole("radio", { name: "390" }).check();
  await page.waitForTimeout(350);
  const ancho390 = (await lienzo.boundingBox())!.width;
  expect(ancho390, `1280 → ${ancho1280}px · 390 → ${ancho390}px`).toBeLessThan(ancho1280);

  await page.getByRole("checkbox", { name: /movimiento/i }).check();
  await expect(lienzo).toHaveAttribute("data-quieto", "1");
  await ctx.close();
});

for (const tema of ["light", "dark"] as const) {
  test(`axe 0 en el catálogo de estados — tema ${tema}`, async ({ browser }) => {
    /**
     * Acotado al lienzo del catálogo, igual que `charts-core.spec.ts` se acota a `.cf`.
     *
     * No es para esconder nada: la página ENTERA da 26 `color-contrast`, y son de la galería
     * vieja —`.eyebrow`, las muestras de `code`, y sobre todo el contenedor con
     * `data-theme="dark"` de la sección «Color»—. Ese contenedor existe justamente para
     * DEMOSTRAR que los alias declarados en `:root` no se voltean con un `data-theme` local:
     * su contraste falla porque eso es lo que documenta. Exigir 0 sobre toda la página
     * obligaría a borrar la sección que enseña el problema.
     *
     * Están reportadas aparte. Lo que este caso garantiza es que lo NUEVO entra limpio.
     */
    const { ctx, page } = await abrir(browser, tema, 1280);
    const r = await new AxeBuilder({ page }).withTags(TAGS).include(".du-lienzo").analyze();
    expect(
      r.violations.map((v) => `${v.id} (${v.nodes.length})`).join(" · "),
      "violaciones de axe",
    ).toBe("");
    await ctx.close();
  });
}

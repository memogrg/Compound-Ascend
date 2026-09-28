/**
 * La simulación de dicromacia, medida sobre los PÍXELES QUE PINTA EL NAVEGADOR.
 *
 * Es la diferencia entre este caso y `contraste-paleta.test.ts`. Aquel calcula la simulación en
 * JS y comprueba que la paleta cumple; este aplica el filtro SVG de verdad, hace una captura y
 * lee los colores del PNG. Si el navegador interpretara el filtro en otro espacio —por ejemplo
 * si alguien escribiera `color-interpolation-filters="sRGB"`— las dos medidas se separarían, y
 * el validador seguiría diciendo que todo está bien.
 *
 * La lectura del PNG se hace en la propia página con un `<canvas>`, el mismo truco que
 * `scripts/qa/diff.mjs`: traer una librería de imágenes para esto sería añadir una dependencia a
 * un repo que ya trae un navegador entero.
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Browser, type Page } from "@playwright/test";

import { ESTADO_SESION } from "./sesion";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const VISIONES = ["protanopia", "deuteranopia", "tritanopia"] as const;
/** El mismo piso que el validador. Si uno cambia, el otro tiene que cambiar con él. */
const DELTA_E_MINIMO = 8;

async function abrir(browser: Browser) {
  const ctx = await browser.newContext({
    storageState: ESTADO_SESION,
    viewport: { width: 1280, height: 1000 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await page.goto("/dev/ui", { waitUntil: "networkidle", timeout: 60_000 });
  await page.locator("#kpi-hero").waitFor({ state: "attached", timeout: 30_000 });
  return { ctx, page };
}

/** Activa una simulación por su control, como lo haría una persona. */
async function simular(page: Page, vision: (typeof VISIONES)[number] | "normal") {
  const etiqueta =
    vision === "normal"
      ? "normal"
      : { protanopia: "Protanopía", deuteranopia: "Deuteranopía", tritanopia: "Tritanopía" }[
          vision
        ];
  await page.getByRole("radio", { name: etiqueta, exact: true }).first().check();
  await page.waitForTimeout(250);
}

/**
 * Pinta los seis `--chart-N` como franjas dentro del lienzo, captura, y devuelve el color
 * REAL de cada una leyendo el PNG.
 *
 * Las franjas se inyectan en el lienzo —no fuera— para que les caiga el mismo filtro.
 */
async function coloresPintados(page: Page): Promise<[number, number, number][]> {
  await page.evaluate(() => {
    document.querySelector("#du-muestras")?.remove();
    const cont = document.createElement("div");
    cont.id = "du-muestras";
    cont.style.cssText = "display:flex;height:40px;width:360px";
    for (let i = 1; i <= 6; i++) {
      const s = document.createElement("div");
      s.style.cssText = `flex:1;background:var(--chart-${i})`;
      cont.appendChild(s);
    }
    // El PRIMER lienzo: el catálogo tiene dos (estados y gráficos) y los dos cuelgan del
    // MISMO panel de controles, así que el filtro que se active cae sobre los dos por igual.
    document.querySelector(".du-lienzo")?.prepend(cont);
  });
  // `locator.screenshot()` y no `page.screenshot({clip})`: el lienzo puede quedar por debajo
  // del pliegue, y entonces el recorte cae fuera de la imagen («Clipped area is either empty or
  // outside the resulting image»). El localizador se encarga de traerlo a la vista.
  const png = await page.locator("#du-muestras").screenshot({ type: "png" });
  const uri = `data:image/png;base64,${png.toString("base64")}`;
  return page.evaluate(async (u) => {
    const img = new Image();
    await new Promise((r) => {
      img.onload = r;
      img.src = u;
    });
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const out: [number, number, number][] = [];
    for (let i = 0; i < 6; i++) {
      // El CENTRO de cada franja: los bordes llevan antialiasing y mezclarían dos colores.
      const x = Math.round((img.width / 6) * (i + 0.5));
      const d = ctx.getImageData(x, Math.round(img.height / 2), 1, 1).data;
      out.push([d[0]!, d[1]!, d[2]!]);
    }
    return out;
  }, uri);
}

/** ΔE76 en Lab, igual que el validador. */
function deltaE(a: [number, number, number], b: [number, number, number]): number {
  const lab = ([r, g, bl]: [number, number, number]) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const [R, G, B] = [f(r), f(g), f(bl)];
    const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
    const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
    const g2 = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * g2(Y) - 16, 500 * (g2(X) - g2(Y)), 200 * (g2(Y) - g2(Z))];
  };
  const [l1, a1, b1] = lab(a);
  const [l2, a2, b2] = lab(b);
  return Math.hypot(l1! - l2!, a1! - a2!, b1! - b2!);
}

test("sin simulación, los seis colores son los de la paleta", async ({ browser }) => {
  // Control del propio instrumento: si la lectura de píxeles estuviera mal, todo lo demás
  // mediría ruido. Los seis tienen que salir distintos entre sí y muy por encima del piso.
  const { ctx, page } = await abrir(browser);
  const cols = await coloresPintados(page);
  expect(cols).toHaveLength(6);
  let peor = Infinity;
  for (let i = 0; i < 6; i++)
    for (let j = i + 1; j < 6; j++) peor = Math.min(peor, deltaE(cols[i]!, cols[j]!));
  expect(peor, `par más parecido sin simulación: ΔE ${peor.toFixed(1)}`).toBeGreaterThanOrEqual(
    DELTA_E_MINIMO,
  );
  await ctx.close();
});

for (const vision of VISIONES) {
  test(`${vision}: ningún par de la paleta se confunde en pantalla`, async ({ browser }) => {
    const { ctx, page } = await abrir(browser);
    await simular(page, vision);
    const cols = await coloresPintados(page);
    let peor = { a: 0, b: 1, d: Infinity };
    for (let i = 0; i < 6; i++)
      for (let j = i + 1; j < 6; j++) {
        const d = deltaE(cols[i]!, cols[j]!);
        if (d < peor.d) peor = { a: i + 1, b: j + 1, d };
      }
    expect(
      peor.d,
      `${vision} · --chart-${peor.a} vs --chart-${peor.b} → ΔE ${peor.d.toFixed(1)} (medido en pantalla)`,
    ).toBeGreaterThanOrEqual(DELTA_E_MINIMO);
    await ctx.close();
  });

  test(`${vision}: axe 0 en el lienzo`, async ({ browser }) => {
    const { ctx, page } = await abrir(browser);
    await simular(page, vision);
    const r = await new AxeBuilder({ page }).withTags(TAGS).include(".du-lienzo").analyze();
    expect(r.violations.map((v) => `${v.id} (${v.nodes.length})`).join(" · ")).toBe("");
    await ctx.close();
  });
}

test("colores forzados: el lienzo sigue siendo legible y axe pasa", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  await page
    .getByRole("checkbox", { name: /colores forzados/i })
    .first()
    .check();
  // `.first()`: hay DOS lienzos —estados y gráficos—, cada uno con sus controles.
  await expect(page.locator(".du-lienzo").first()).toHaveAttribute("data-forzados", "1");
  const r = await new AxeBuilder({ page }).withTags(TAGS).include(".du-lienzo").analyze();
  expect(r.violations.map((v) => `${v.id} (${v.nodes.length})`).join(" · ")).toBe("");
  await ctx.close();
});

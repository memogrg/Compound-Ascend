/**
 * El calendario de gasto y los presets de rango, sobre `/dev/ui`.
 *
 * Lo que solo se ve corriendo: que la rejilla sea UNA sola parada de Tab, que las flechas
 * muevan el foco de verdad, que `Enter` fije el día, y que los chips recorten la serie Y la
 * tabla a la vez.
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Browser } from "@playwright/test";

import { iniciarSesion } from "./sesion";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

let estadoSesion: Awaited<ReturnType<Awaited<ReturnType<Browser["newContext"]>>["storageState"]>>;

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await iniciarSesion(page);
  estadoSesion = await ctx.storageState();
  await ctx.close();
});

async function abrir(browser: Browser, tema: "light" | "dark" = "light") {
  const ctx = await browser.newContext({
    storageState: estadoSesion,
    viewport: { width: 1280, height: 1000 },
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
  await page.goto("/dev/ui", { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(800);
  await page.locator(".cal-grid").scrollIntoViewIfNeeded();
  return { ctx, page };
}

/**
 * El marco (`figure.cf`) que CONTIENE algo. `/dev/ui` tiene varios gráficos, así que
 * `page.locator("table").first()` apuntaba a otro demo; y la tabla vive siempre en el DOM
 * pero en `.sr-only` hasta que se pulsa «Ver tabla», que es lo que hace una persona.
 */
function marcoCon(page: import("@playwright/test").Page, selector: string) {
  return page.locator("figure.cf").filter({ has: page.locator(selector) });
}

async function abrirTabla(page: import("@playwright/test").Page, selector: string) {
  const marco = marcoCon(page, selector);
  await marco.scrollIntoViewIfNeeded();
  const boton = marco.getByRole("button", { name: "Ver tabla" });
  if (await boton.isVisible()) await boton.click();
  return marco.locator("table.cf-tabla");
}

test("la rejilla es UNA sola parada de Tab", async ({ browser }) => {
  // Con 30 días, tabular treinta veces para cruzar el calendario es inaceptable.
  const { ctx, page } = await abrir(browser);
  const tabulables = await page.locator(".cal-dia[tabindex='0']").count();
  expect(tabulables).toBe(1);
  expect(await page.locator(".cal-dia[tabindex='-1']").count()).toBeGreaterThan(20);
  await ctx.close();
});

test("las flechas mueven el foco dentro de la rejilla", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  await page.locator(".cal-dia[tabindex='0']").focus();
  const primero = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));

  await page.keyboard.press("ArrowRight");
  const segundo = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  expect(segundo).not.toBe(primero);

  // Abajo salta una semana entera, no un día.
  await page.keyboard.press("ArrowDown");
  const tercero = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  expect(tercero).not.toBe(segundo);
  await ctx.close();
});

test("Enter fija el día y lo anuncia", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  await page.locator(".cal-dia[tabindex='0']").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".cal-dia[aria-selected='true']")).toHaveCount(1);
  await ctx.close();
});

test("cada día dice en palabras cuánto se gastó", async ({ browser }) => {
  // El color no es el único canal: la etiqueta lleva el día, el importe y los movimientos.
  const { ctx, page } = await abrir(browser);
  const etiquetas = await page
    .locator(".cal-dia")
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""));
  expect(
    etiquetas.some((e) => /sin gasto/.test(e)),
    "algún día sin gasto",
  ).toBe(true);
  expect(
    etiquetas.some((e) => /movimiento/.test(e)),
    "algún día con movimientos",
  ).toBe(true);
  await ctx.close();
});

test("los días futuros se distinguen de los días sin gasto", async ({ browser }) => {
  // Colapsarlos haría que el mes en curso pareciera un mes de ahorro ejemplar.
  const { ctx, page } = await abrir(browser);
  expect(await page.locator(".cal-dia[data-futuro='true']").count()).toBeGreaterThan(0);
  expect(await page.locator(".cal-dia[data-vacio='true']").count()).toBeGreaterThan(0);
  await ctx.close();
});

test("hoy está marcado en la semántica, no solo con el anillo", async ({ browser }) => {
  // Sin `aria-current` un lector de pantalla recorre 30 celdas iguales y no hay forma de
  // saber en cuál está parado el mes: el anillo de 2 px no existe para quien no lo ve.
  const { ctx, page } = await abrir(browser);
  const hoy = page.locator(".cal-dia[aria-current='date']");
  await expect(hoy).toHaveCount(1);
  await expect(page.locator(".cal-dia[data-hoy='true']")).toHaveCount(1);
  // Y hoy NO es un día futuro: el mes está a medias justo ahí.
  await expect(page.locator(".cal-dia[aria-current='date'][data-futuro='true']")).toHaveCount(0);
  await ctx.close();
});

test("la celda sin gasto no lleva relleno, sino borde continuo", async ({ browser }) => {
  // Con relleno competía con el paso más bajo de la rampa: dos grises parecidos, uno
  // DENTRO de la escala y otro fuera, y el mes parecía tener gasto todos los días.
  const { ctx, page } = await abrir(browser);
  const vacio = page.locator(".cal-dia[data-vacio='true']").first();
  const estilo = await vacio.evaluate((el) => {
    const c = getComputedStyle(el);
    return { fondo: c.backgroundColor, borde: c.borderStyle, ancho: c.borderWidth };
  });
  expect(estilo.fondo).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  expect(estilo.borde).toBe("solid");

  // El futuro, en cambio, va PUNTEADO: es lo que los separa a simple vista.
  const futuro = page.locator(".cal-dia[data-futuro='true']").first();
  expect(await futuro.evaluate((el) => getComputedStyle(el).borderStyle)).toBe("dashed");
  await ctx.close();
});

test("la leyenda nombra los tres estados y da los rangos en texto", async ({ browser }) => {
  // Un degradado de «menos» a «más» no dice cuánto es «más», y el `title` de cada muestra
  // no existe en táctil ni lo anuncia ningún lector de pantalla.
  const { ctx, page } = await abrir(browser);
  const leyenda = page.locator(".cal-leyenda");
  await expect(leyenda).toContainText("Sin gasto");
  await expect(leyenda).toContainText("Futuro");
  // Cinco pasos + «sin gasto» + «futuro» = siete entradas.
  await expect(leyenda.locator(".cal-leyenda-item")).toHaveCount(7);
  // Y los pasos traen cifras, no solo color.
  expect(await leyenda.innerText()).toMatch(/₡/);
  await ctx.close();
});

test("la tabla de datos trae la columna del paso", async ({ browser }) => {
  // El color era el único canal que decía «cuánto» en la rejilla (WCAG 1.4.1).
  const { ctx, page } = await abrir(browser);
  const tabla = await abrirTabla(page, ".cal-grid");
  await expect(tabla.locator("th", { hasText: "Paso" })).toHaveCount(1);
  await ctx.close();
});

test("el eje Y del zoom es visible y su dominio sigue al rango", async ({ browser }) => {
  // Con el eje oculto, recortar la serie cambiaba la escala en silencio y dos capturas del
  // mismo gráfico no eran comparables.
  const { ctx, page } = await abrir(browser);
  const grupo = page.locator("[role='radiogroup'][aria-label='Rango del gráfico']");
  await grupo.scrollIntoViewIfNeeded();
  const marco = marcoCon(page, "[aria-label='Rango del gráfico']");
  // Los rótulos de AMBOS ejes comparten clase (`recharts-cartesian-axis-tick-value`) y
  // Recharts no los cuelga del `<g>` del eje al que pertenecen, así que no se pueden separar
  // por selector. Se separan por lo que dicen: los del eje Y llevan importe («₡30M») y los
  // del X, meses («oct 25»). Que el eje Y muestre cifras es justo lo que se quiere probar.
  // `allInnerTexts()` NO sirve acá: `innerText` es de `HTMLElement` y estos rótulos son
  // `<text>` de SVG, así que devuelve `undefined` por cada uno. `textContent` sí existe.
  const ticksY = async () =>
    (await marco.locator(".recharts-cartesian-axis-tick-value").allTextContents()).filter((t) =>
      t.includes("₡"),
    );

  const conTodo = await (async () => {
    await grupo.getByRole("radio").filter({ hasText: "Todo" }).click();
    await page.waitForTimeout(400);
    return ticksY();
  })();
  expect(conTodo.length).toBeGreaterThan(1);

  await grupo.getByRole("radio").filter({ hasText: "6M" }).click();
  await page.waitForTimeout(400);
  const con6M = await ticksY();
  expect(con6M.length).toBeGreaterThan(1);
  // El dominio se RECALCULA: con 36 meses y con 6 los topes no pueden ser los mismos.
  expect(con6M.join("|")).not.toBe(conTodo.join("|"));
  await ctx.close();
});

test("la serie termina en el mes en curso, no en el futuro", async ({ browser }) => {
  // La serie se cuenta HACIA ATRÁS desde hoy. Escrita «hacia adelante desde 2024-01» seguía
  // terminando en 2026-12, así que tenía meses de futuro y «los últimos 6 meses» se
  // recortaban contra un final que no había llegado.
  const { ctx, page } = await abrir(browser);
  const grupo = page.locator("[role='radiogroup'][aria-label='Rango del gráfico']");
  await grupo.scrollIntoViewIfNeeded();
  await grupo.getByRole("radio").filter({ hasText: "Todo" }).click();
  await page.waitForTimeout(400);

  const tabla = await abrirTabla(page, "[aria-label='Rango del gráfico']");
  // La primera celda de cada fila es `<th scope="row">`, no `<td>`: la tabla rotula sus
  // filas, que es lo que la hace navegable con lector de pantalla.
  const filas = await tabla.locator("tbody tr th").allInnerTexts();
  expect(filas).toHaveLength(36);

  // La tabla rotula los meses como el eje ("sep 26"), así que se compara contra el mismo
  // formato construido desde el reloj de la página —congelado en la captura, real en CI—
  // en lugar de parsear la etiqueta.
  const esperado = await page.evaluate(() => {
    const d = new Date();
    return new Intl.DateTimeFormat("es-CR", { month: "short", year: "2-digit" })
      .format(new Date(d.getFullYear(), d.getMonth(), 1))
      .replace(".", "");
  });
  const ultima = filas.at(-1)!.toLowerCase().replace(".", "");
  expect(ultima, `última fila "${ultima}" debería ser el mes en curso "${esperado}"`).toContain(
    esperado.toLowerCase().slice(0, 3),
  );
  await ctx.close();
});

test("las instrucciones de teclado salen del subtítulo y viven en el «?» y en aria-describedby", async ({
  browser,
}) => {
  const { ctx, page } = await abrir(browser);
  const marco = marcoCon(page, ".cal-grid");
  await expect(marco).toHaveCount(1);

  // Ya no están en el subtítulo, que lo lee todo el mundo aunque no vaya a tabular nunca.
  const sub = marco.locator(".cf-sub");
  await expect(sub).toHaveCount(1);
  expect(await sub.innerText()).not.toMatch(/flecha|Enter/i);

  // Sí están en `aria-describedby` de la rejilla, que es donde las oye quien las necesita.
  const grid = marco.locator(".cal-grid");
  await expect(grid).toHaveCount(1);
  const idDesc = await grid.getAttribute("aria-describedby");
  expect(idDesc, "la rejilla no declara aria-describedby").toBeTruthy();
  const desc = page.locator(`#${CSS.escape(idDesc!)}`);
  await expect(desc).toHaveCount(1);
  expect(await desc.textContent()).toMatch(/flechas/i);

  // Y hay un «?» junto al título que dice lo mismo.
  const ayuda = marco.getByRole("button", { name: "Cómo se usa este gráfico" });
  await expect(ayuda).toHaveCount(1);
  await ayuda.click();
  const burbuja = page.getByRole("tooltip");
  await expect(burbuja).toHaveCount(1);
  expect(await burbuja.textContent()).toMatch(/flechas/i);
  await ctx.close();
});

test("el título dice el mes completo y el año", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  const titulo = marcoCon(page, ".cal-grid").locator(".cf-titulo");
  await expect(titulo).toHaveCount(1);
  const texto = await titulo.innerText();
  // «sep 26» obliga a descifrar una abreviatura para saber de qué mes habla la rejilla.
  expect(texto).toMatch(
    /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+\d{4}/i,
  );
  await ctx.close();
});

test("ningún importe de la leyenda aparece en dos pasos", async ({ browser }) => {
  // El techo de un paso no puede repetirse como suelo del siguiente: quien mira no sabría en
  // cuál de los dos cae un gasto de ese importe exacto.
  const { ctx, page } = await abrir(browser);
  const items = marcoCon(page, ".cal-grid").locator(".cal-leyenda-item");
  const n = await items.count();
  expect(n, "la leyenda no tiene entradas").toBeGreaterThan(0);

  const textos = await items.allInnerTexts();
  const cifras = textos.flatMap((t) => t.match(/[\d.]+/g) ?? []).filter((c) => c.length > 2);
  expect(cifras.length, "la leyenda no imprime cifras").toBeGreaterThan(0);
  expect(new Set(cifras).size, `repetido en: ${textos.join(" · ")}`).toBe(cifras.length);
  await ctx.close();
});

test("los presets recortan la serie y la tabla a la vez", async ({ browser }) => {
  const { ctx, page } = await abrir(browser);
  const grupo = page.locator("[role='radiogroup'][aria-label='Rango del gráfico']");
  await grupo.scrollIntoViewIfNeeded();

  const filas = () =>
    page.locator(".cf").filter({ has: grupo }).locator("table.cf-tabla tbody tr").count();

  await expect(grupo.locator("[aria-checked='true']")).toHaveText("1A");
  expect(await filas()).toBe(12);

  // Por TECLADO, que es el camino que el `radiogroup` promete: una parada de Tab y flechas
  // para recorrer. De paso evita la barra superior fija, que tras el scroll se monta sobre
  // los chips y deja el clic esperando para siempre a que el punto quede libre.
  await grupo.locator("[aria-checked='true']").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(grupo.locator("[aria-checked='true']")).toHaveText("6M");
  expect(await filas()).toBe(6);

  // Desde «6M», que es el primero, una flecha a la izquierda da la vuelta hasta «Todo».
  await grupo.locator("[aria-checked='true']").focus();
  await page.keyboard.press("ArrowLeft");
  await expect(grupo.locator("[aria-checked='true']")).toHaveText("Todo");
  expect(await filas()).toBe(36);
  await ctx.close();
});

test("los presets son un radiogroup, no botones sueltos", async ({ browser }) => {
  // Son una elección entre opciones excluyentes: así el lector anuncia «2 de 3» y las
  // flechas recorren el grupo.
  const { ctx, page } = await abrir(browser);
  const grupo = page.locator("[role='radiogroup'][aria-label='Rango del gráfico']");
  await expect(grupo.getByRole("radio")).toHaveCount(4);
  await expect(grupo.locator("[aria-checked='true']")).toHaveCount(1);
  // Una sola parada de Tab en el grupo, como manda el patrón.
  await expect(grupo.locator("[tabindex='0']")).toHaveCount(1);
  await ctx.close();
});

for (const tema of ["light", "dark"] as const) {
  test(`axe no encuentra nada en el calendario ni en los presets (${tema})`, async ({
    browser,
  }) => {
    const { ctx, page } = await abrir(browser, tema);
    const r = await new AxeBuilder({ page })
      .withTags(TAGS)
      .include(".cal")
      .include(".cf-rangos")
      .analyze();
    expect(r.violations.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}`).join("\n")).toBe("");
    await ctx.close();
  });
}

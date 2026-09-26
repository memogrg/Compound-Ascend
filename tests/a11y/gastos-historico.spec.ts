/**
 * La tarjeta «Histórico de gastos» de `/gastos`, que pasó a usar el núcleo.
 *
 * Lo que solo se ve corriendo: que haya una COLUMNA por mes con su marca de presupuesto, que
 * el presupuesto sea mensual y no un total del rango, que el mes a medias se marque con el
 * día que dice el SERVIDOR, y que los rótulos de los KPI confiesen el rango que suman.
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Browser } from "@playwright/test";

import { ESTADO_SESION } from "./sesion";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function abrir(browser: Browser, ruta: string, ancho = 1280) {
  const ctx = await browser.newContext({
    storageState: ESTADO_SESION,
    viewport: { width: ancho, height: 1200 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await page.goto(ruta, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);
  return { ctx, page };
}

/** La tarjeta del histórico, y su SVG. */
async function tarjetaHistorico(page: import("@playwright/test").Page) {
  const titulo = page.getByText("Histórico de gastos").first();
  await expect(titulo).toHaveCount(1);
  const tarjeta = titulo.locator("xpath=ancestor::*[contains(@class,'card')][1]");
  await tarjeta.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  return tarjeta;
}

/** Los importes que muestra el tooltip en tres puntos de la serie. */
async function leerTooltips(
  page: import("@playwright/test").Page,
  tarjeta: ReturnType<typeof tarjetaHistorico> extends Promise<infer T> ? T : never,
) {
  const svg = tarjeta.locator(".recharts-surface");
  await expect(svg).toHaveCount(1);
  const caja = await svg.boundingBox();
  expect(caja, "el svg no tiene caja").not.toBeNull();
  const filas: string[] = [];
  for (const f of [0.2, 0.5, 0.85]) {
    await page.mouse.move(caja!.x + caja!.width * f, caja!.y + caja!.height * 0.5);
    await page.waitForTimeout(320);
    const tip = page.locator(".cf-tip");
    if ((await tip.count()) > 0) filas.push((await tip.innerText()).replace(/\n/g, " | "));
  }
  expect(filas.length, "el tooltip no apareció en ningún punto").toBeGreaterThan(0);
  return filas;
}

const aNumero = (s: string) => Number(s.replace(/[^\d]/g, ""));

test("una columna por mes, y una marca de presupuesto por mes", async ({ browser }) => {
  // Antes eran dos LÍNEAS. Una línea une el total de julio con el de agosto y dibuja una
  // pendiente que nadie recorrió: un mes es un total cerrado, y un total es una columna.
  const { ctx, page } = await abrir(browser, "/gastos?range=3m");
  const tarjeta = await tarjetaHistorico(page);

  const columnas = tarjeta.locator(".cf-col");
  const marcas = tarjeta.locator(".cf-marca");
  expect(await columnas.count(), "no hay columnas").toBe(3);
  expect(await marcas.count(), "no hay marcas de presupuesto").toBe(3);
  await ctx.close();
});

test("la columna se parte: lo que cupo en el presupuesto, y el exceso encima", async ({
  browser,
}) => {
  // Con una columna de un solo color, saber cuánto se pasó exige comparar dos alturas contra
  // una marca. Partida, el exceso ES un rectángulo con su propia altura.
  const { ctx, page } = await abrir(browser, "/gastos?range=6m");
  const tarjeta = await tarjetaHistorico(page);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);

  const excesos = tarjeta.locator(".cf-col-exceso");
  const dentros = tarjeta.locator(".cf-col-dentro");
  expect(await dentros.count(), "todo mes con gasto tiene tramo dentro").toBe(6);
  expect(await excesos.count(), "ningún mes se pasó del presupuesto").toBeGreaterThan(0);

  // El exceso va ARRIBA: su borde inferior toca el borde superior del tramo de dentro.
  const ex = tarjeta.locator(".cf-col-exceso").first();
  const x = Number(await ex.getAttribute("x"));
  const dentroMismo = tarjeta.locator(`.cf-col-dentro[x="${x}"]`);
  await expect(dentroMismo).toHaveCount(1);
  const yEx = Number(await ex.getAttribute("y"));
  const hEx = Number(await ex.getAttribute("height"));
  const yDe = Number(await dentroMismo.getAttribute("y"));
  expect(yDe, `exceso ${yEx}+${hEx} · dentro ${yDe}`).toBeGreaterThanOrEqual(yEx + hEx);

  // Y los dos tramos NO son del mismo color: uno es el tono claro de la rampa.
  expect(await ex.getAttribute("fill")).toBe("var(--neg)");
  expect(await dentroMismo.getAttribute("fill")).toContain("color-mix");
  await ctx.close();
});

test("la leyenda nombra el exceso cuando lo hay", async ({ browser }) => {
  const { ctx, page } = await abrir(browser, "/gastos?range=6m");
  const tarjeta = await tarjetaHistorico(page);
  expect(await tarjeta.locator(".cf-leyenda-fija").innerText()).toContain(
    "Exceso sobre el presupuesto",
  );
  await ctx.close();
});

test("el mes a medias dice lo que QUEDA, sin signo y sin verde", async ({ browser }) => {
  // A mitad de mes, «−₡559.067» se lee como «vas ahorrando» cuando lo cierto es «todavía no
  // gastaste lo que te toca». Los días salen del servidor: con el reloj congelado, 12.
  const { ctx, page } = await abrir(browser, "/gastos?range=3m");
  const tarjeta = await tarjetaHistorico(page);
  await tarjeta.locator(".cf-datos-abrir").click();
  await page.waitForTimeout(300);

  const celda = tarjeta.locator(".cf-tabla-avance");
  await expect(celda).toHaveCount(1);
  const texto = await celda.innerText();
  expect(texto, `la celda dice: ${texto}`).toMatch(
    /^(Te quedan ₡[\d.]+ para 12 días \(≈ ₡[\d.]+\/día\)|Excedido por ₡[\d.]+ con 12 días por delante)$/,
  );
  expect(texto, "no lleva diferencia con signo").not.toMatch(/^[+−-]/);

  // Y el mismo criterio en el tooltip del último mes.
  await tarjeta.locator(".cf-datos-abrir").click();
  const filas = await leerTooltips(page, tarjeta);
  const ultimo = filas[filas.length - 1]!;
  expect(ultimo, `tooltip: ${ultimo}`).toMatch(/Te quedan|Excedido por/);
  expect(ultimo, `tooltip: ${ultimo}`).not.toMatch(/bajo presupuesto|sobre presupuesto/);
  await ctx.close();
});

test("la marca sobresale de su columna, mide 2 px y no invade la del vecino", async ({
  browser,
}) => {
  const { ctx, page } = await abrir(browser, "/gastos?range=6m");
  const tarjeta = await tarjetaHistorico(page);
  // El ratón fuera: el `cursor` del tooltip pinta un rect sobre la banda y desplaza las
  // medidas de lo que hay debajo.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);

  const columnas = tarjeta.locator(".cf-col-dentro");
  const marcas = tarjeta.locator(".cf-marca");
  expect(await columnas.count(), "sin columnas no hay nada que medir").toBe(6);
  expect(await marcas.count()).toBe(6);

  const anchoCol = Number(await columnas.first().getAttribute("width"));
  const anchoMar = Number(await marcas.first().getAttribute("width"));
  const altoMar = Number(await marcas.first().getAttribute("height"));
  expect(anchoCol, "la columna no tiene ancho").toBeGreaterThan(0);
  expect(anchoMar, `marca ${anchoMar} vs columna ${anchoCol}`).toBeGreaterThan(anchoCol);
  expect(altoMar, "el grosor de la marca").toBe(2);

  // Dos marcas seguidas no se pueden tocar: si lo hacen, el ojo las une y vuelve a leer la
  // línea horizontal única que el escalón mensual vino a eliminar.
  const x0 = Number(await marcas.nth(0).getAttribute("x"));
  const x1 = Number(await marcas.nth(1).getAttribute("x"));
  expect(x1 - x0, `x0=${x0} x1=${x1} ancho=${anchoMar}`).toBeGreaterThan(anchoMar);
  await ctx.close();
});

test("el presupuesto es mensual, no el total del rango", async ({ browser }) => {
  // Antes se pintaba UNA línea horizontal con la suma del rango: con «3m», tres meses de
  // presupuesto contra el gasto de cada mes suelto. Se compara contra el TITULAR —que sí es
  // el total— porque «los meses difieren entre sí» no es la propiedad: un presupuesto
  // estable tres meses seguidos es normal, y de hecho es el de la demo.
  const { ctx, page } = await abrir(browser, "/gastos?range=3m");
  const tarjeta = await tarjetaHistorico(page);
  const filas = await leerTooltips(page, tarjeta);

  const presupuestos = filas
    .map((f) => /Presupuesto \| (₡[\d.]+)/.exec(f)?.[1])
    .filter((x): x is string => Boolean(x))
    .map(aNumero);
  expect(presupuestos.length, `no se leyeron presupuestos de: ${filas.join(" // ")}`).toBe(3);

  // La versión anterior exigía que los meses DIFIRIERAN entre sí, y eso no es la
  // propiedad: un presupuesto estable tres meses seguidos es perfectamente normal —de
  // hecho es lo que tiene la demo desde que se resembraron sus partidas derivadas—. Lo que
  // se quiere demostrar es otra cosa: que cada punto lleva el presupuesto de SU MES y no el
  // total del rango. Se compara contra el titular, que sí es el total.
  const planificado = page.getByText(/Gasto planificado/i).first();
  await expect(planificado).toHaveCount(1);
  const total = aNumero(
    /₡[\d.]+/.exec(await planificado.locator("xpath=..").innerText())?.[0] ?? "0",
  );
  expect(total, "no se leyó el titular").toBeGreaterThan(0);
  for (const p of presupuestos) {
    expect(p, `mes ${p} contra total ${total}`).toBeLessThan(total);
  }
  // Y el total tiene que ser la SUMA de los meses, no otra cosa.
  const suma = presupuestos.reduce((a, b) => a + b, 0);
  expect(Math.abs(suma - total), `suma ${suma} vs total ${total}`).toBeLessThanOrEqual(3);
  await ctx.close();
});

test("el presupuesto del mes en curso coincide con el de Mi Base Financiera", async ({
  browser,
}) => {
  // El mismo dinero, contado igual en las dos pantallas. Antes `/gastos` mostraba el total
  // del rango donde Mi Base mostraba el del mes, y las dos decían «presupuesto».
  const { ctx, page } = await abrir(browser, "/gastos?range=3m");
  const tarjeta = await tarjetaHistorico(page);
  const filas = await leerTooltips(page, tarjeta);
  const ultimo = filas[filas.length - 1]!;
  const delGrafico = aNumero(/Presupuesto \| (₡[\d.]+)/.exec(ultimo)?.[1] ?? "0");
  expect(delGrafico, `del tooltip: ${ultimo}`).toBeGreaterThan(0);

  await page.goto("/mi-base-financiera", { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);
  // En Mi Base la tarjeta se llama «Gastos presup.», no «Gasto planificado»: son dos
  // pantallas distintas para el mismo número, y ese desajuste de nombres es justo lo que
  // hacía tan fácil no notar que tampoco contaban lo mismo.
  const planificado = page.getByText("Gastos presup.", { exact: true }).first();
  await expect(planificado).toHaveCount(1);
  const tarjetaBase = planificado.locator("xpath=..");
  const textoBase = await tarjetaBase.innerText();
  const delBase = aNumero(/₡[\d.]+/.exec(textoBase)?.[0] ?? "0");

  expect(delBase, `Mi Base dice: ${textoBase.replace(/\n/g, " ")}`).toBeGreaterThan(0);
  expect(delGrafico, `gráfico ${delGrafico} vs Mi Base ${delBase}`).toBe(delBase);
  await ctx.close();
});

test("el mes a medias es la única columna parcial, y el día viene del servidor", async ({
  browser,
}) => {
  const { ctx, page } = await abrir(browser, "/gastos?range=3m");
  const tarjeta = await tarjetaHistorico(page);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(300);

  // El rótulo, que es lo que lee quien no ve el contorno punteado. El día es el del reloj
  // CONGELADO del servidor (18), no el de la máquina que corre el navegador: si el
  // componente llamara a `new Date()` acá saldría el día real.
  const enCurso = tarjeta.locator(".cf-en-curso");
  await expect(enCurso).toHaveCount(1);
  expect(await enCurso.innerText()).toMatch(/^parcial · día 18 de \d+$/);

  // Una sola columna parcial: la última.
  const parciales = tarjeta.locator(".cf-col-parcial");
  expect(await parciales.count()).toBe(1);
  const todas = tarjeta.locator(".cf-col-dentro");
  const ultimaX = Number(await todas.last().getAttribute("x"));
  expect(Number(await parciales.first().getAttribute("x"))).toBe(ultimaX);

  // Lavada Y punteada: el color no puede ser el único canal (WCAG 1.4.1). El contorno es su
  // propio rect —rodea la columna entera y no cada tramo—, y el lavado va en el relleno.
  expect(await parciales.first().getAttribute("stroke-dasharray")).toBeTruthy();
  expect(Number(await todas.last().getAttribute("fill-opacity"))).toBeLessThan(1);

  // Y el tooltip del último punto lo dice con palabras.
  const filas = await leerTooltips(page, tarjeta);
  expect(filas[filas.length - 1], `último tooltip: ${filas.join(" // ")}`).toContain("parcial");
  await ctx.close();
});

test("la leyenda nombra el gasto, el presupuesto y lo parcial", async ({ browser }) => {
  const { ctx, page } = await abrir(browser, "/gastos?range=3m");
  const tarjeta = await tarjetaHistorico(page);
  const leyenda = tarjeta.locator(".cf-leyenda-fija");
  await expect(leyenda).toHaveCount(1);
  const texto = await leyenda.innerText();
  for (const t of ["Gasto del mes", "Presupuesto del mes", "Parcial"]) {
    expect(texto, `la leyenda dice: ${texto.replace(/\n/g, " · ")}`).toContain(t);
  }
  await ctx.close();
});

test("el tooltip da la diferencia y el % de ejecución", async ({ browser }) => {
  const { ctx, page } = await abrir(browser, "/gastos?range=3m");
  const tarjeta = await tarjetaHistorico(page);
  const filas = await leerTooltips(page, tarjeta);
  const primera = filas[0]!;
  expect(primera, `tooltip: ${primera}`).toMatch(
    /(bajo|sobre) presupuesto|justo en el presupuesto/,
  );
  expect(primera, `tooltip: ${primera}`).toMatch(/\d+ % ejecutado/);
  await ctx.close();
});

test("la tabla de datos trae los cuatro números de cada mes, y cuadran", async ({ browser }) => {
  const { ctx, page } = await abrir(browser, "/gastos?range=3m");
  const tarjeta = await tarjetaHistorico(page);
  await tarjeta.locator(".cf-datos-abrir").click();
  await page.waitForTimeout(300);

  // `:not(.cf-tabla-nota)`: el mes abierto añade una fila de nota a todo el ancho, que no
  // es un mes.
  const filas = tarjeta.locator(".cf-tabla tbody tr:not(.cf-tabla-nota)");
  expect(await filas.count(), "la tabla no tiene una fila por mes").toBe(3);

  // La diferencia y el % no se escriben a mano en la tabla: tienen que salir del gasto y del
  // presupuesto de ESA fila. Se comprueba en la primera, que es un mes cerrado.
  const celdas = await filas.first().locator("th, td").allTextContents();
  expect(celdas.length, `celdas: ${celdas.join(" | ")}`).toBe(5);
  const gasto = aNumero(celdas[1]!);
  const presupuesto = aNumero(celdas[2]!);
  const dif = aNumero(celdas[3]!);
  const pct = Number(/(\d+)/.exec(celdas[4]!)?.[1] ?? "-1");
  expect(gasto, `fila: ${celdas.join(" | ")}`).toBeGreaterThan(0);
  expect(presupuesto).toBeGreaterThan(0);
  expect(dif).toBe(Math.abs(gasto - presupuesto));
  expect(celdas[3]).toContain(gasto > presupuesto ? "+" : "−");
  expect(pct).toBe(Math.round((gasto / presupuesto) * 100));
  await ctx.close();
});

// Invariante, no regresión: el eje de este gráfico ya incluía el 0 con estos datos. Vigila
// que nadie lo devuelva a `desdeCeroSiCabe`, que con un gasto mínimo alto recorta el eje — y
// en un gráfico de BARRAS el área de la barra es el dato, así que recortar el eje multiplica
// visualmente las diferencias. En el de líneas se podía, porque ahí el dato es la altura.
test("el eje Y arranca en 0: en barras el área es el dato", async ({ browser }) => {
  const { ctx, page } = await abrir(browser, "/gastos?range=6m");
  const tarjeta = await tarjetaHistorico(page);
  // Los rótulos del eje NO son hijos del `<g>` del eje en Recharts; se seleccionan por su
  // clase de tick y se separan los del eje Y por llevar el símbolo de moneda.
  const ticks = await tarjeta.locator(".recharts-cartesian-axis-tick-value").allTextContents();
  const ejeY = ticks.filter((t) => t.includes("₡"));
  expect(ejeY.length, `ticks: ${ticks.join(", ")}`).toBeGreaterThan(2);
  expect(Math.min(...ejeY.map(aNumero)), `eje Y: ${ejeY.join(", ")}`).toBe(0);
  await ctx.close();
});

for (const [rango, esperado] of [
  ["1m", "del mes"],
  ["3m", "de 3 meses"],
  ["6m", "de 6 meses"],
] as const) {
  test(`los KPI confiesan el rango: ${rango} → «${esperado}»`, async ({ browser }) => {
    const { ctx, page } = await abrir(browser, `/gastos?range=${rango}`);
    const planificado = page.getByText(/Gasto planificado/i).first();
    await expect(planificado).toHaveCount(1);
    const tarjeta = planificado.locator("xpath=ancestor::*[contains(@class,'card')][1]");
    expect(await tarjeta.innerText()).toContain(esperado);
    await ctx.close();
  });
}

test("axe no encuentra nada nuevo en la tarjeta, ni con la tabla abierta", async ({ browser }) => {
  const { ctx, page } = await abrir(browser, "/gastos?range=3m");
  const tarjeta = await tarjetaHistorico(page);
  await tarjeta.locator(".cf-datos-abrir").click();
  await page.waitForTimeout(300);
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  // La línea base de `/gastos` ya reporta contraste; el portón es de INCLUSIÓN.
  const conocidas = new Set(["color-contrast", "nested-interactive", "aria-hidden-focus"]);
  const nuevas = r.violations.filter((v) => !conocidas.has(v.id));
  expect(nuevas.map((v) => `${v.id} ×${v.nodes.length}`).join("\n")).toBe("");
  await ctx.close();
});

test("«Composición por categoría» confiesa el rango que suma, igual que los KPI", async ({
  browser,
}) => {
  // El centro sumaba el RANGO y el subtítulo decía «al mes»: a tres meses, la Hipoteca son
  // tres cuotas y el total un trimestre, pero la tarjeta lo presentaba como un mes.
  for (const [rango, esperado] of [
    ["1m", "del mes"],
    ["3m", "de 3 meses"],
    ["6m", "de 6 meses"],
  ] as const) {
    const { ctx, page } = await abrir(browser, `/gastos?range=${rango}`);
    const titulo = page.getByText("Composición por categoría").first();
    await expect(titulo).toHaveCount(1);
    const tarjeta = titulo.locator("xpath=ancestor::*[contains(@class,'card')][1]");
    const sub = tarjeta.locator(".donut-sub");
    await expect(sub).toHaveCount(1);
    expect(await sub.innerText(), `rango ${rango}`).toBe(esperado);
    await ctx.close();
  }
});

test("y el dato lo respalda: a 3 meses la Hipoteca vale tres veces la de un mes", async ({
  browser,
}) => {
  // Se compara contra el propio mes en vez de contra una cuota escrita a mano: así el caso
  // no depende de los montos de la demo, solo de que el rango de verdad multiplique.
  const leerHipoteca = async (rango: string) => {
    const { ctx, page } = await abrir(browser, `/gastos?range=${rango}`);
    const titulo = page.getByText("Composición por categoría").first();
    const tarjeta = titulo.locator("xpath=ancestor::*[contains(@class,'card')][1]");
    // Por el TEXTO exacto y no por un `div` con `hasText`: la leyenda es una rejilla y
    // `hasText` matchea también cada contenedor de arriba.
    const nombre = tarjeta.getByText("Hipoteca", { exact: true }).first();
    await expect(nombre).toHaveCount(1);
    const texto = await nombre.locator("xpath=..").innerText();
    const v = aNumero(/₡[\d.]+/.exec(texto)?.[0] ?? "0");
    await ctx.close();
    return v;
  };
  const unMes = await leerHipoteca("1m");
  const tresMeses = await leerHipoteca("3m");
  expect(unMes, "no se leyó la Hipoteca del mes").toBeGreaterThan(0);
  expect(tresMeses, `1m=${unMes} · 3m=${tresMeses}`).toBe(unMes * 3);
});

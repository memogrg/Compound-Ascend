/**
 * La leyenda de las donas, en un navegador de verdad.
 *
 * El reparto de porcentajes se prueba puro en `tests/unit/leyenda-dona.test.ts`. Acá va lo
 * que solo se ve corriendo, que es donde estaban los tres defectos: el nombre truncado, la
 * leyenda pegada al lado en una tarjeta estrecha, y el monto sin porcentaje.
 */
import { expect, test, type Browser, type Locator } from "@playwright/test";

import { ESTADO_SESION } from "./sesion";
import { congelarReloj } from "./reloj";

/** Las rutas con tarjeta de dona. `/patrimonio` lleva tres: portafolio y las dos de asignación. */
const RUTAS = ["/dashboard", "/gastos", "/mi-rich-life", "/patrimonio"] as const;

/**
 * El bloque de UNA dona: anillo más leyenda. Hay dos envoltorios según el camino.
 *
 * `.dl` es el de la tarjeta vieja (`DonutConLeyenda`), que todavía usan `/gastos`, `/ingresos`,
 * `/mi-rich-life` y `/patrimonio`. `.cf-lateral` es el del marco del núcleo, que estrena
 * `/dashboard` en 26.3 — ahí el reparto anillo/leyenda lo hace el marco y `.dl` ya no existe.
 *
 * Buscar solo `.dl` no fallaba igual en todos los casos, y la mitad silenciosa era la peor: donde
 * se afirmaba sobre el conteo, el spec caía con «no hay donas en esta ruta»; donde se recorría en
 * un bucle, el bucle daba cero vueltas y el test pasaba sin comprobar nada.
 */
const CAJA_DONA = ".dl, .cf-lateral";

/** Las porciones dibujadas del anillo. Recharts pinta una u otra clase según la versión. */
const PORCIONES = ".recharts-pie-sector path, .recharts-sector";

/**
 * Espera a que el anillo haya PINTADO sus porciones, no solo a que exista su hueco.
 *
 * Hace falta desde que la dona vive en el marco. Antes, `DonutConLeyenda` era el componente
 * diferido: anillo y leyenda llegaban en el mismo chunk, así que ver una fila de leyenda implicaba
 * que el anillo ya estaba. Ahora la leyenda la pinta `LeyendaDona`, que no es diferida y se
 * pre-renderiza en el servidor, mientras `DonutChart` sigue siendo `dynamic({ ssr: false })`: las
 * filas aparecen bastante ANTES que las porciones.
 *
 * Medido en la corrida 37104164915: «Ver todas» leyó 0 porciones antes de pulsar y 7 después, y el
 * caso falló diciendo «el anillo no debe cambiar» — acusando al desplegable de algo que era la
 * carga del chunk.
 */
async function esperarPorciones(dona: Locator) {
  await dona.locator(PORCIONES).first().waitFor({ state: "attached", timeout: 30_000 });
}

async function abrir(browser: Browser, ruta: string, ancho: number) {
  const ctx = await browser.newContext({
    storageState: ESTADO_SESION,
    viewport: { width: ancho, height: 1200 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  // El reloj del navegador, congelado: sin esto el spec mide el día en que corre.
  await congelarReloj(page);
  await page.goto(ruta, { waitUntil: "domcontentloaded", timeout: 60_000 });
  // Se espera el ELEMENTO, no un hueco en la red: la dona es `dynamic({ssr:false})` y hasta
  // que carga hay un esqueleto sin nada. (Cuando entre el ayudante compartido de
  // `tests/a11y/navegar.ts` —rama de CI— esto pasa a ser `irA(page, ruta, CAJA_DONA)`.)
  //
  // Vale una fila O el estado vacío: la cuenta de demo tiene ₡0 invertido, así que las dos
  // donas de `/patrimonio` salen legítimamente vacías. Esperar solo `.dl-fila` ahí agotaba
  // el minuto y el fallo parecía de la dona.
  // Tres formas de «ya cargó»: una fila de leyenda, el vacío de la tarjeta vieja, o el vacío del
  // marco. Lo tercero hace falta desde que la dona vive en el marco: ahí el estado vacío lo pinta
  // `ChartEmpty`, que no tiene clase propia —solo `.muted`—, y el `data-estado` de la figura es el
  // único hook estable. Sin él, una ruta migrada con donas legítimamente vacías (`/patrimonio` en la
  // cuenta de demo) colgaría los 60 s y el fallo se leería como un selector roto.
  await page
    .locator('.dl-fila, .dl-vacio, figure.cf[data-estado="vacio"]')
    .first()
    .waitFor({ state: "visible", timeout: 60_000 });
  return { ctx, page };
}

const aNumero = (s: string) => Number(s.replace(/[^\d]/g, ""));

/** ¿El texto de este elemento cabe en su caja, o el navegador lo está recortando? */
async function estaTruncado(el: Locator): Promise<boolean> {
  return el.evaluate((n) => n.scrollWidth > n.clientWidth + 1);
}

for (const ruta of RUTAS) {
  test(`${ruta}: ningún nombre de la leyenda se trunca a 1280`, async ({ browser }) => {
    const { ctx, page } = await abrir(browser, ruta, 1280);
    const nombres = page.locator(".dl-nombre");
    const n = await nombres.count();
    if (n === 0) {
      // Sin datos no hay nombres que truncar, pero sí hay algo que afirmar: que la tarjeta
      // dice por qué está vacía en vez de pintar una dona rota. Pasa en `/patrimonio` con la
      // cuenta de demo, que tiene ₡0 invertido.
      await expect(page.locator(".dl-vacio").first()).toBeVisible();
      await ctx.close();
      return;
    }
    const cortados: string[] = [];
    for (let i = 0; i < n; i++) {
      const el = nombres.nth(i);
      if (await estaTruncado(el)) cortados.push((await el.innerText()).trim());
    }
    expect(cortados.join(" · "), "nombres recortados").toBe("");
    await ctx.close();
  });

  test(`${ruta}: los porcentajes de cada dona suman exactamente 100`, async ({ browser }) => {
    const { ctx, page } = await abrir(browser, ruta, 1280);
    const donas = page.locator(CAJA_DONA);
    const cuantas = await donas.count();
    expect(cuantas, "no hay donas en esta ruta").toBeGreaterThan(0);
    let medidas = 0;
    for (let i = 0; i < cuantas; i++) {
      const pcts = await donas.nth(i).locator(".dl-pct").allTextContents();
      // Tarjeta vacía: no hay nada que repartir. Se comprueba que sea EL estado vacío y no
      // una leyenda que se quedó sin pintar.
      if (pcts.length === 0) {
        await expect(donas.nth(i).locator(".dl-vacio")).toHaveCount(1);
        continue;
      }
      const suma = pcts.map(aNumero).reduce((a, b) => a + b, 0);
      expect(suma, `dona ${i} de ${ruta}: ${pcts.join(" + ")}`).toBe(100);
      medidas += 1;
    }
    console.log(`${ruta}: ${medidas} de ${cuantas} donas con datos`);
    await ctx.close();
  });
}

test("a 390 la leyenda va DEBAJO de la dona, no a su lado", async ({ browser }) => {
  const { ctx, page } = await abrir(browser, "/gastos", 390);
  const anillo = page.locator(`${CAJA_DONA}`).first().locator('[role="img"]').first();
  const lista = page.locator(".dl-lista").first();
  const a = await anillo.boundingBox();
  const l = await lista.boundingBox();
  expect(a, "la dona no tiene caja").not.toBeNull();
  expect(l, "la leyenda no tiene caja").not.toBeNull();
  // Debajo: el borde superior de la leyenda queda por debajo del inferior de la dona.
  expect(l!.y, `dona ${a!.y}+${a!.height} · leyenda ${l!.y}`).toBeGreaterThanOrEqual(
    a!.y + a!.height - 1,
  );
  await ctx.close();
});

test("a 1280 en una tarjeta ancha la leyenda va AL LADO", async ({ browser }) => {
  // El complemento del anterior: el corte es del contenedor, así que tiene que cortar de
  // verdad en los dos sentidos. Sin esto, «siempre debajo» pasaría el test de arriba.
  const { ctx, page } = await abrir(browser, "/mi-rich-life", 1280);
  const anillo = page.locator(`${CAJA_DONA}`).first().locator('[role="img"]').first();
  const lista = page.locator(".dl-lista").first();
  const a = (await anillo.boundingBox())!;
  const l = (await lista.boundingBox())!;
  expect(l.x, `dona en x=${a.x}+${a.width} · leyenda en x=${l.x}`).toBeGreaterThan(
    a.x + a.width - 1,
  );
  await ctx.close();
});

test("cada fila dice nombre, porcentaje y monto, con el monto a la derecha", async ({
  browser,
}) => {
  const { ctx, page } = await abrir(browser, "/gastos", 1280);
  const fila = page.locator(".dl-fila").first();
  await expect(fila.locator(".dl-nombre")).toHaveCount(1);
  await expect(fila.locator(".dl-pct")).toHaveCount(1);
  await expect(fila.locator(".dl-monto")).toHaveCount(1);
  expect(await fila.locator(".dl-pct").innerText()).toMatch(/^\d+ %$/);
  expect(await fila.locator(".dl-monto").innerText()).toMatch(/[₡$]/);

  // Los montos de todas las filas terminan en la MISMA x: si no, la columna no se puede
  // comparar de un vistazo, que es para lo que existe alinearla a la derecha.
  const montos = page.locator(".dl-lista").first().locator(".dl-monto");
  const cuantos = await montos.count();
  expect(cuantos).toBeGreaterThan(1);
  const derechas: number[] = [];
  for (let i = 0; i < cuantos; i++) {
    const b = (await montos.nth(i).boundingBox())!;
    derechas.push(Math.round(b.x + b.width));
  }
  expect(new Set(derechas).size, `bordes derechos: ${derechas.join(", ")}`).toBe(1);

  // Y con cifras de ancho fijo, o los miles no quedan uno debajo de otro.
  const variante = await montos.first().evaluate((n) => getComputedStyle(n).fontVariantNumeric);
  expect(variante).toContain("tabular-nums");
  await ctx.close();
});

test("los bloques de la taxonomía se muestran TODOS, sin plegar", async ({ browser }) => {
  // El panel cortaba en cinco y agrupaba el resto en «Otras N». Los bloques de gasto son
  // nueve y cada uno significa algo: plegarlos tapa justo lo que la tarjeta viene a
  // responder, y que un bloque desaparezca porque este mes gastó poco hace imposible
  // comparar dos meses.
  const { ctx, page } = await abrir(browser, "/dashboard", 1280);
  const dona = page.locator(CAJA_DONA).first();
  await expect(dona.locator(".dl-fila-resto"), "el panel no debe agrupar nada").toHaveCount(0);
  await expect(dona.locator(".dl-vertodas"), "ni ofrecer desplegable").toHaveCount(0);

  // Y el orden es el canónico de EXPENSE_NATURES, no el del monto.
  const CANONICO = [
    "Esencial",
    "Estilo de vida",
    "Financiero (deudas)",
    "Protección",
    "Crecimiento",
    "Ahorro planificado",
    "Inversión",
    "Donación",
    "Misceláneo",
  ];
  const vistos = (await dona.locator(".dl-nombre").allTextContents()).map((t) => t.trim());
  expect(vistos.length, "sin bloques no hay nada que ordenar").toBeGreaterThan(2);
  const esperado = CANONICO.filter((n) => vistos.includes(n));
  expect(vistos, `bloques: ${vistos.join(" · ")}`).toEqual(esperado);
  await ctx.close();
});

test("la lista de categorías se ordena por monto y agrupa el resto", async ({ browser }) => {
  const { ctx, page } = await abrir(browser, "/gastos?range=3m", 1280);
  const titulo = page.getByText("Composición por categoría").first();
  const tarjeta = titulo.locator("xpath=ancestor::*[contains(@class,'card')][1]");
  const dona = tarjeta.locator(CAJA_DONA);

  const filas = dona.locator(".dl-fila");
  expect(await filas.count(), "seis mayores más la del resto").toBe(7);
  const resto = dona.locator(".dl-fila-resto");
  await expect(resto).toHaveCount(1);
  expect(await resto.locator(".dl-nombre").innerText()).toMatch(/^Otras \d+$/);

  // De mayor a menor, las seis primeras.
  const montos = (
    await dona.locator(".dl-fila:not(.dl-fila-resto) .dl-monto").allTextContents()
  ).map(aNumero);
  expect(montos).toHaveLength(6);
  for (let i = 1; i < montos.length; i++) {
    expect(montos[i]!, `${montos.join(" ≥ ")}`).toBeLessThanOrEqual(montos[i - 1]!);
  }
  await ctx.close();
});

test("«Ver todas» despliega la leyenda y NO toca el anillo", async ({ browser }) => {
  const { ctx, page } = await abrir(browser, "/gastos?range=3m", 1280);
  const titulo = page.getByText("Composición por categoría").first();
  const tarjeta = titulo.locator("xpath=ancestor::*[contains(@class,'card')][1]");
  const dona = tarjeta.locator(CAJA_DONA);

  const porciones = dona.locator(PORCIONES);
  // El anillo, pintado, ANTES de contar: si se cuenta mientras llega su chunk, el «antes» vale 0 y
  // el caso culpa al desplegable del tiempo de carga.
  await esperarPorciones(dona);
  const antesPorciones = await porciones.count();
  const antesFilas = await dona.locator(".dl-fila").count();

  const boton = dona.locator(".dl-vertodas");
  await expect(boton).toHaveCount(1);
  expect(await boton.getAttribute("aria-expanded")).toBe("false");
  await boton.click();
  await page.waitForTimeout(300);

  expect(await boton.getAttribute("aria-expanded")).toBe("true");
  expect(await dona.locator(".dl-fila").count(), "la leyenda tiene que crecer").toBeGreaterThan(
    antesFilas,
  );
  expect(await dona.locator(".dl-fila-oculta").count()).toBeGreaterThan(0);
  // El anillo NO cambia: veinte porciones no se leen por muchas veces que se dibujen.
  expect(await porciones.count(), "el anillo no debe cambiar").toBe(antesPorciones);
  await ctx.close();
});

test("ninguna porción visible del anillo repite color", async ({ browser }) => {
  for (const ruta of ["/gastos?range=3m", "/dashboard"]) {
    const { ctx, page } = await abrir(browser, ruta, 1280);
    const donas = page.locator(CAJA_DONA);
    for (let i = 0; i < (await donas.count()); i++) {
      // Una dona sin filas de leyenda es el estado vacío legítimo (la cuenta de demo tiene
      // `/patrimonio` sin inversiones): ahí no hay porciones que comparar y se dice. Una dona CON
      // filas tiene que tener porciones, así que se espera a que lleguen en vez de saltarla — el
      // `continue` a secas convertía «el chunk no había cargado» en un test que pasa sin medir.
      const conDatos = (await donas.nth(i).locator(".dl-fila").count()) > 0;
      if (!conDatos) {
        console.log(`${ruta}: dona ${i} vacía, sin porciones que comparar`);
        continue;
      }
      await esperarPorciones(donas.nth(i));
      const fills = await donas
        .nth(i)
        .locator(PORCIONES)
        .evaluateAll((ns) => ns.map((n) => (n as SVGElement).getAttribute("fill") ?? ""));
      expect(fills.length, `${ruta} · dona ${i}: con filas pero sin porciones`).toBeGreaterThan(0);
      expect(new Set(fills).size, `${ruta} · dona ${i}: ${fills.join(", ")}`).toBe(fills.length);
    }
    await ctx.close();
  }
});

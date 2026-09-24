/**
 * La paleta de comandos, abierta. A diferencia de `routes.spec.ts` —que mide y no falla—
 * este spec SÍ es un portón: la paleta es nueva, así que no hay deuda heredada que tolerar.
 *
 * Tres cosas se fijan acá:
 *
 * 1. Axe acotado al diálogo: **cero** violaciones, de cualquier impacto. Lo que agregamos
 *    nosotros se mide solo, sin que lo tape el ruido de la pantalla de abajo.
 * 2. Axe sobre la página entera: ninguna REGLA que no esté ya en la línea base, y ni un
 *    nodo más que con la paleta cerrada en esa misma pantalla. La comparación se hace
 *    contra la medición cerrada de la propia corrida, no contra un número escrito a mano:
 *    si mañana `/dashboard` mejora o empeora por otra razón, el portón sigue siendo justo.
 * 3. Gestión del foco y teclado (WCAG 2.1.1 y 2.4.3): el foco entra al input al abrir,
 *    ↓+Enter navega conservando el periodo, la opción activa se mantiene a la vista, y
 *    Escape devuelve el foco a DONDE ESTABA — al botón del topbar si no estaba en ningún
 *    sitio, y al campo que la persona tenía enfocado si lo había.
 *
 * Requiere la bandera ENCENDIDA. `NEXT_PUBLIC_NAV_V2` se inlinea en el build, así que el
 * servidor congelado tiene que haberse CONSTRUIDO con ella:
 *
 *   NEXT_PUBLIC_NAV_V2=1 npm run build
 *   QA_FREEZE=… npm run qa:start
 *   E2E_EMAIL=… E2E_PASSWORD=… npx playwright test -c playwright.a11y.config.ts \
 *     tests/a11y/command-palette.spec.ts
 */
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";

import { ESTADO_SESION } from "./sesion";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * Las reglas que la línea base ya reporta (`docs/cartera-plus-redesign/qa/a11y-baseline.md`).
 * El portón es de INCLUSIÓN: la paleta no puede traer una regla que no estuviera antes.
 * Que estas tres sigan apareciendo es deuda conocida de las pantallas, no de la paleta.
 */
const REGLAS_CONOCIDAS = new Set(["color-contrast", "nested-interactive", "aria-hidden-focus"]);

/** Ruta de trabajo: el panel, que es donde la paleta se abre en la vida real. */
const RUTA = "/dashboard?period=2026-08";

/** ¿El servidor se construyó con la bandera? Se mide, no se supone (ver `beforeEach`). */
let banderaEncendida = false;

/**
 * Con la bandera apagada la paleta NO existe, así que estos seis tests no tienen nada que
 * medir y se saltan en vez de fallar.
 *
 * Hace falta porque los dos specs de `tests/a11y/` quieren builds opuestos: `routes.spec.ts`
 * levanta la línea base con la bandera APAGADA —es la app que hay en producción— y este
 * necesita la ENCENDIDA. `npm run test:a11y` los corre juntos, así que sin este salto la
 * corrida de la línea base terminaba en rojo por seis fallos que no son fallos.
 */
/**
 * La bandera se MIDE, no se supone. Ya no hace login —la sesión la deja el `globalSetup`—
 * pero sí abre una página: sin esta sonda `banderaEncendida` se quedaría en `false` y TODOS
 * los casos de este archivo se saltarían en silencio, con la suite en verde sin haber
 * probado nada.
 */
test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: ESTADO_SESION });
  const page = await ctx.newPage();
  await page.goto(RUTA, { waitUntil: "networkidle", timeout: 60_000 });
  // El botón buscador del topbar v2 solo existe bajo bandera: es el detector más barato.
  banderaEncendida = (await page.locator("button.tb2-search").count()) > 0;
  await ctx.close();
});

test.beforeEach(() => {
  test.skip(!banderaEncendida, "requiere NEXT_PUBLIC_NAV_V2=1 en el build del servidor");
});

async function abrirPanel(browser: Browser, ruta: string = RUTA) {
  const ctx = await browser.newContext({
    storageState: ESTADO_SESION,
    viewport: { width: 1280, height: 900 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const page = await ctx.newPage();
  await page.goto(ruta, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(600);
  return { ctx, page };
}

/** Nodos por impacto, aplanados: una regla puede afectar decenas de elementos. */
function nodos(violations: { impact?: string | null; nodes: unknown[] }[]) {
  return violations.reduce((s, v) => s + v.nodes.length, 0);
}

/**
 * El diálogo DE LA PALETA. `[role="dialog"]` a secas no sirve: `CoachPanel` también lo es
 * y está montado en todas las pantallas del shell, así que acotar `axe` con ese selector
 * medía dos cosas a la vez.
 */
const DIALOGO = '.modal[role="dialog"]';

const combobox = (page: Page) => page.getByRole("combobox", { name: "Buscar o ir a…" });

/**
 * Las opciones DE LA PALETA. Acotadas al listbox a propósito: el `<select>` de periodo del
 * topbar también expone `option` nativos («oct 2026»…), y un `getByRole("option")` suelto
 * los mezcla — fue exactamente lo que falseó la primera corrida de este spec.
 */
const opciones = (page: Page) =>
  page.getByRole("listbox", { name: "Resultados" }).getByRole("option");

test("abierta y filtrando, la paleta no agrega violaciones", async ({ browser }) => {
  const { ctx, page } = await abrirPanel(browser);

  // Medición CERRADA: la referencia contra la que se compara el estado abierto.
  const cerrada = await new AxeBuilder({ page }).withTags(TAGS).analyze();

  await page.keyboard.press("Control+k");
  await expect(combobox(page)).toBeVisible();

  // La cabecera del modal se disuelve por CSS (`display: contents`) para quitar la franja
  // vacía. El título sigue en el DOM, oculto a la vista, y tiene que seguir siendo el
  // nombre accesible del diálogo: si alguien lo quitara «porque no se ve», el diálogo se
  // anunciaría sin nombre y nada más lo delataría.
  const dialogo = page.locator(DIALOGO);
  await expect(dialogo).toHaveAccessibleName("Buscar o ir a…");
  const idTitulo = await dialogo.getAttribute("aria-labelledby");
  expect(idTitulo, "el diálogo perdió su aria-labelledby").toBeTruthy();
  // `useId` genera ids con «:», que no son selectores CSS válidos sin escapar.
  await expect(page.locator(`[id="${idTitulo}"]`)).toHaveClass(/modal-title/);
  // Y la franja vacía no volvió: el campo empieza donde empieza el diálogo.
  const cajaDialogo = (await dialogo.boundingBox())!;
  const cajaCampo = (await page.locator(".cp-campo").boundingBox())!;
  expect(cajaCampo.y - cajaDialogo.y, "franja vacía sobre el campo").toBeLessThan(20);

  await combobox(page).fill("deu");
  await expect(opciones(page).filter({ hasText: "Deudas" }).first()).toBeVisible();

  // 1. Acotado al diálogo: lo nuestro, sin el ruido de la pantalla de abajo.
  const soloPaleta = await new AxeBuilder({ page }).withTags(TAGS).include(DIALOGO).analyze();
  expect(
    soloPaleta.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`),
    "violaciones dentro del diálogo de la paleta",
  ).toEqual([]);

  // 2. Página entera: ni una regla nueva, ni un nodo más que con la paleta cerrada.
  const abierta = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const nuevas = abierta.violations.map((v) => v.id).filter((id) => !REGLAS_CONOCIDAS.has(id));
  expect(nuevas, "reglas que no están en la línea base").toEqual([]);
  expect(
    nodos(abierta.violations),
    `nodos con la paleta abierta vs cerrada (${nodos(cerrada.violations)})`,
  ).toBeLessThanOrEqual(nodos(cerrada.violations));

  console.log(
    `paleta: diálogo ${soloPaleta.violations.length} reglas · ` +
      `página cerrada ${nodos(cerrada.violations)} nodos → abierta ${nodos(abierta.violations)}`,
  );

  await ctx.close();
});

test("sin resultados, el estado vacío tampoco rompe nada", async ({ browser }) => {
  const { ctx, page } = await abrirPanel(browser);

  await page.keyboard.press("Control+k");
  await combobox(page).fill("xyzzy");
  // Sin resultados NO hay listbox: el combobox queda sin `aria-controls` apuntando a nada
  // sería el error fácil acá, y axe lo cazaría.
  await expect(page.getByRole("listbox")).toHaveCount(0);

  const r = await new AxeBuilder({ page }).withTags(TAGS).include(DIALOGO).analyze();
  expect(r.violations.map((v) => v.id)).toEqual([]);

  await ctx.close();
});

test("el foco entra al input, Enter navega conservando el periodo y Escape lo devuelve", async ({
  browser,
}) => {
  const { ctx, page } = await abrirPanel(browser);

  const boton = page.locator("button.tb2-search");
  await expect(boton).toBeVisible();

  // Abrir con el atajo: el foco tiene que quedar EN el input, no en el diálogo.
  await page.keyboard.press("Control+k");
  await expect(combobox(page)).toBeFocused();

  // Escape cierra y devuelve el foco a quien lo tenía: el botón del topbar. Sin esto,
  // quien navega con teclado vuelve al principio del documento.
  await page.keyboard.press("Escape");
  await expect(combobox(page)).toHaveCount(0);
  await expect(boton).toBeFocused();

  // Reabrir desde el botón y navegar solo con el teclado.
  await boton.click();
  await expect(combobox(page)).toBeFocused();
  await combobox(page).fill("deu");
  await expect(opciones(page).first()).toHaveAccessibleName("Deudas");
  await expect(opciones(page).first()).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");

  // El periodo que la persona estaba mirando sobrevive al salto.
  await page.waitForURL(/\/deudas/, { timeout: 20_000 });
  expect(new URL(page.url()).searchParams.get("period")).toBe("2026-08");
  // Y la paleta se cerró sola al cambiar de ruta.
  await expect(combobox(page)).toHaveCount(0);

  await ctx.close();
});

test("las flechas envuelven y la opción activa se anuncia", async ({ browser }) => {
  const { ctx, page } = await abrirPanel(browser);

  await page.keyboard.press("Control+k");
  const input = combobox(page);
  const primera = opciones(page).first();
  const ultima = opciones(page).last();

  await expect(primera).toHaveAttribute("aria-selected", "true");
  // `aria-activedescendant` es lo que hace que el lector lea la opción sin mover el foco.
  await expect(input).toHaveAttribute("aria-activedescendant", (await primera.getAttribute("id"))!);

  await page.keyboard.press("ArrowUp"); // desde la primera, envuelve a la última
  await expect(ultima).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowDown"); // y vuelve a la primera
  await expect(primera).toHaveAttribute("aria-selected", "true");

  await page.keyboard.press("End");
  await expect(ultima).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(primera).toHaveAttribute("aria-selected", "true");

  await ctx.close();
});

test("si la persona estaba en un campo, Escape la devuelve A SU CAMPO", async ({ browser }) => {
  // El complemento del test anterior: desde el `body` el foco vuelve al botón del topbar,
  // pero si había un campo enfocado, mandarla al botón le haría perder el sitio donde
  // estaba escribiendo — peor que el problema que el sustituto arregla.
  const { ctx, page } = await abrirPanel(browser, "/transacciones?period=2026-08");

  const campo = page.getByPlaceholder("Buscar por comercio, categoría o monto…");
  await campo.click();
  await expect(campo).toBeFocused();

  await page.keyboard.press("Control+k");
  await expect(combobox(page)).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(combobox(page)).toHaveCount(0);
  await expect(campo).toBeFocused();
  // Y el botón del topbar NO se quedó con el foco.
  await expect(page.locator("button.tb2-search")).not.toBeFocused();

  await ctx.close();
});

test("la opción activa se mantiene a la vista al bajar con el teclado", async ({ browser }) => {
  const { ctx, page } = await abrirPanel(browser);

  await page.keyboard.press("Control+k");
  const lista = page.getByRole("listbox", { name: "Resultados" });
  const total = await opciones(page).count();
  // Sin consulta la paleta ofrece el menú completo, que no cabe en la altura de la lista:
  // si no se hiciera scroll, el activo terminaría fuera del contenedor.
  expect(total, "hacen falta más opciones de las que caben").toBeGreaterThan(10);

  for (let i = 1; i < total; i++) await page.keyboard.press("ArrowDown");
  const ultima = opciones(page).nth(total - 1);
  await expect(ultima).toHaveAttribute("aria-selected", "true");
  await dentroDeLaLista(lista, ultima, "última");

  await page.keyboard.press("Home");
  const primera = opciones(page).first();
  await expect(primera).toHaveAttribute("aria-selected", "true");
  await dentroDeLaLista(lista, primera, "primera");

  await ctx.close();
});

/** La opción está dentro del recuadro visible de la lista, con 1 px de tolerancia. */
async function dentroDeLaLista(lista: Locator, opcion: Locator, cual: string) {
  const l = await lista.boundingBox();
  const o = await opcion.boundingBox();
  expect(l, "la lista no tiene caja").not.toBeNull();
  expect(o, `la opción ${cual} no tiene caja`).not.toBeNull();
  expect(o!.y, `${cual}: se sale por arriba`).toBeGreaterThanOrEqual(l!.y - 1);
  expect(o!.y + o!.height, `${cual}: se sale por abajo`).toBeLessThanOrEqual(l!.y + l!.height + 1);
}

#!/usr/bin/env node
/**
 * Línea base visual: captura cada pantalla en varios anchos y temas.
 *
 * Es la herramienta de regresión visual del proyecto: se corre ANTES de tocar CSS
 * (`--out qa-snapshots/base`), otra vez después (`--out qa-snapshots/cambio`) y se comparan
 * con `qa:diff`. Sin la primera corrida no hay forma de demostrar que un refactor no movió nada.
 *
 * Contra un build de producción (`next build && next start -p 3001`), NUNCA contra `next dev`:
 * en dev StrictMode corre los efectos dos veces y las animaciones disparadas por scroll no
 * llegan a verse, así que las capturas no representan lo que ve una persona.
 *
 * Uso:
 *   E2E_EMAIL=… E2E_PASSWORD=… node scripts/qa/snap.mjs --out qa-snapshots/base
 *   node scripts/qa/snap.mjs --out qa-snapshots/x --theme dark --widths 390,1280
 *   node scripts/qa/snap.mjs --out qa-snapshots/x --freeze 2026-09-17T12:00:00-06:00
 */
import { chromium } from "playwright";
import { CABECERA_BANDERAS } from "./banderas.mjs";
import { repartirEnShards } from "./shard.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Rutas capturadas, en `routes.json` para que sea una sola fuente.
 *
 * Vive como JSON y no como constante acá porque el spec de accesibilidad
 * (`tests/a11y/routes.spec.ts`) también la necesita, y el cargador de TypeScript de
 * Playwright transpila los `.mjs` importados a CommonJS: importar este archivo desde un
 * `.ts` revienta con «exports is not defined in ES module scope». Un JSON lo lee cualquiera.
 *
 * Las públicas (`auth: false`) se visitan sin sesión.
 *
 * `superficie: "m"` marca las pantallas de la app móvil (`/m/*`). Una ruta SIN ese campo es
 * de la web, y nada cambia para ella: las 23 de siempre se siguen capturando igual.
 */
/**
 * La cabecera de banderas del servidor que se va a capturar.
 *
 * Devuelve `null` ante cualquier problema —servidor sin la cabecera, red, 500—: la captura no
 * se aborta por no poder etiquetarla, pero tampoco se inventa un «(ninguna)» que el diff
 * tomaría por un dato bueno.
 */
export async function leerBanderas(baseUrl) {
  try {
    const r = await fetch(new URL("/login", baseUrl), { redirect: "manual" });
    return r.headers.get(CABECERA_BANDERAS);
  } catch {
    return null;
  }
}

export const ROUTES = JSON.parse(readFileSync(new URL("./routes.json", import.meta.url), "utf8"));

/**
 * Anchos por superficie. `/m` es un shell de teléfono —viewport bloqueado, `viewportFit:
 * cover`— y a 1280 no se ve nada que exista en un dispositivo real: capturarlo ahí sería
 * fabricar una pantalla que nadie usa. `dev` es el catálogo interno `/dev/ui`, que solo se
 * mira en escritorio. Sin `superficie`, la ruta es web y no se restringe.
 *
 * Duplicado a propósito en `tests/a11y/routes.spec.ts`: ese `.ts` no puede importar este
 * `.mjs` (ver el comentario de ROUTES). Si cambia acá, cambia allá.
 */
export const ANCHOS_POR_SUPERFICIE = { m: [390, 768], dev: [1280] };

/** Anchos permitidos para una ruta, o `null` cuando no tiene restricción. */
export function anchosDe(ruta) {
  return ANCHOS_POR_SUPERFICIE[ruta.superficie] ?? null;
}

const TZ = "America/Costa_Rica";
const THEME_KEY = "ca-theme"; // src/components/layout/theme-provider.tsx
const ESPERA_EXTRA_MS = 800;
const TIMEOUT_CARGANDO_MS = 10_000;

/**
 * Instante congelado de la corrida: HOY a las 12:00 en la zona del usuario.
 *
 * Congelar una fecha FIJA (antes: 16-ago) dejaba al navegador en un día y al servidor en otro, y
 * ese desfase produce desajustes de hidratación (React #418) en las pantallas que pintan «hoy» en
 * el servidor y lo recalculan en el cliente. Con el día de la corrida, ambos lados coinciden y solo
 * queda congelada la HORA, que es lo que hacía variar las capturas dentro del mismo día.
 *
 * Costa Rica no tiene horario de verano, así que el offset es -06:00 todo el año.
 * `--freeze <ISO>` la fija a mano (para reproducir una corrida vieja); queda escrita en el manifest.
 */
/**
 * El instante en el que se congela el reloj. NUNCA en el futuro.
 *
 * Eso último no es una preferencia, es la condición para que la sesión funcione. Los tokens
 * los emite gotrue con la hora REAL y la app los valida contra la CONGELADA: con el reloj
 * adelantado el token parece vencido en cada render, todos los componentes de servidor piden
 * refrescarlo a la vez y gotrue responde 409 «Too many concurrent token refresh requests».
 * La página no termina de cargar — no falla, se queda.
 *
 * El defecto anterior era «hoy 12:00 en Costa Rica», o sea 18:00 UTC, así que toda corrida
 * anterior a esa hora congelaba en el futuro. En CI eso dejó `main` en rojo: las corridas de
 * la madrugada (reloj en ayer, pasado) hacían las 25 pruebas en 39,6 s y la de las 06:58 UTC
 * (reloj once horas adelante) tardó 8,7 min y falló seis casos por «elemento no visible».
 *
 * @param {string|true|undefined} iso  `--freeze`, o `QA_FREEZE` del entorno.
 * @param {Date} ahora  inyectable para poder probar la regla sin esperar a que den las 12.
 */
export function instanteCongelado(iso, ahora = new Date()) {
  // Precedencia: --freeze > QA_FREEZE (la misma que usa el servidor congelado) > último
  // mediodía de Costa Rica YA OCURRIDO.
  const elegido = iso && iso !== true ? iso : (process.env.QA_FREEZE ?? null);
  if (elegido) {
    const d = new Date(String(elegido));
    if (Number.isNaN(d.getTime())) {
      console.error(`instante congelado inválido: ${elegido}`);
      process.exit(2);
    }
    // Explícito y futuro: se RECHAZA, no se corrige a escondidas. Corregirlo en silencio
    // sería peor — quien lo pidió mediría otra cosa sin enterarse.
    if (d.getTime() > ahora.getTime()) {
      throw new Error(
        `instante congelado en el futuro: ${d.toISOString()} (ahora ${ahora.toISOString()}).\n` +
          "  Con el reloj adelantado la sesión entra en un bucle de refresco (409 de gotrue) y\n" +
          "  las páginas no terminan de cargar. Elegí un instante ya ocurrido.",
      );
    }
    return d;
  }
  const mediodiaDe = (fecha) => {
    const dia = new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(fecha);
    return new Date(`${dia}T12:00:00-06:00`);
  };
  const hoy = mediodiaDe(ahora);
  // Si el mediodía de hoy todavía no llegó, el último ya ocurrido es el de ayer.
  if (hoy.getTime() <= ahora.getTime()) return hoy;
  return mediodiaDe(new Date(ahora.getTime() - 24 * 60 * 60 * 1000));
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key] = next;
      i++;
    } else {
      args[key] = true;
    }
  }
  return args;
}

/** `/mis-acciones?tab=decisiones` → `mis-acciones__tab-decisiones`. */
function slug(routePath) {
  const s = routePath
    .replace(/^\//, "")
    .replace(/\?/g, "__")
    .replace(/[=&]/g, "-")
    .replace(/\//g, "_");
  return s === "" ? "home" : s;
}

/**
 * ¿Quedó algún «Cargando…» VISIBLE? Medición del render tardío: la pantalla puede verse completa
 * y aun así tener un límite `dynamic({ssr:false})` sin hidratar. No se arregla acá — se registra.
 */
async function esperarSinCargando(page, modoEspera) {
  try {
    await page.waitForFunction(
      () =>
        !Array.from(document.querySelectorAll("*")).some((el) => {
          if (!/^\s*Cargando…?\s*$/i.test(el.textContent ?? "")) return false;
          if (el.children.length > 0) return false; // solo el nodo hoja que lo dice
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          const cs = getComputedStyle(el);
          return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
        }),
      undefined,
      { timeout: TIMEOUT_CARGANDO_MS, ...(modoEspera ?? {}) },
    );
    return false;
  } catch {
    return true; // venció el timeout: queda un «Cargando…» residual
  }
}

/**
 * ¿Quedó algún ESQUELETO de gráfico sin reemplazar?
 *
 * Los charts se cargan con `dynamic({ ssr: false, loading: () => <ChartSkeleton /> })`
 * (`src/components/charts/lazy.tsx`), y el marcador de posición es `<div class="skel">`. No dice
 * «Cargando…», así que `esperarSinCargando` no lo ve: es una caja gris del alto reservado.
 *
 * Costó la medida de determinismo de esta ronda. Dos capturas de la MISMA compilación contra el
 * MISMO servidor dieron `light/1280/mi-rich-life` distinto —2196 px contra 2102— y parecía un
 * cambio de datos. No lo era: en una corrida las dos donas («Composición de activos» y «de
 * pasivos») habían montado y en la otra seguían siendo su esqueleto, que es MÁS ALTO que la dona
 * con su leyenda. El alto de la página era estable en las dos, así que esperar a que el alto se
 * asiente tampoco lo habría atrapado: hace falta la señal positiva de que el gráfico llegó.
 */
async function esperarSinEsqueletos(page, modoEspera) {
  try {
    await page.waitForFunction(
      () =>
        !Array.from(document.querySelectorAll(".skel")).some((el) => {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          const cs = getComputedStyle(el);
          return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
        }),
      undefined,
      { timeout: TIMEOUT_CARGANDO_MS, ...(modoEspera ?? {}) },
    );
    return false;
  } catch {
    return true; // venció el timeout: la captura sale con el esqueleto, y se dice
  }
}

/** El modal de Términos se REGISTRA, nunca se acepta: aceptar es una decisión de la persona. */
async function hayModalTerminos(page) {
  try {
    const visible = await page
      .getByText(/Actualizamos nuestros Términos/i)
      .first()
      .isVisible({ timeout: 1000 });
    return visible;
  } catch {
    return false;
  }
}

/**
 * Espera a que las fuentes web estén cargadas. Sin esto, una captura puede salir con la fuente de
 * respaldo y la siguiente con la definitiva: métricas distintas, texto corrido, diff enorme.
 */
async function esperarFuentes(page) {
  try {
    await page.evaluate(() => document.fonts.ready);
  } catch {
    /* document.fonts no disponible: seguir igual */
  }
}

/**
 * Barre la página POR PASOS de una pantalla, no de un salto al final.
 *
 * Los revelados por scroll usan IntersectionObserver con guarda de "una sola vez": si se salta del
 * tope al final, hay secciones que nunca quedan en viewport el tiempo suficiente y su observador no
 * dispara. El hero del landing aparecía en una corrida y faltaba por completo en la siguiente por
 * eso mismo (103 711 px de diferencia). Pasar pantalla por pantalla, con una pausa en cada una, deja
 * todos los revelados en su estado final antes de capturar.
 */
async function recorrerPagina(page) {
  const alto = await page.evaluate(() => document.body.scrollHeight);
  const paso = await page.evaluate(() => window.innerHeight);
  for (let y = 0; y < alto; y += paso) {
    await page.evaluate((py) => window.scrollTo(0, py), y);
    await page.waitForTimeout(220);
  }
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
}

/**
 * Lo que se OCULTA en toda captura porque no es determinista y no depende del diseño.
 *
 * Solo el badge de la campana, por ahora. Muestra el número de insights activos, y ese
 * número cambia entre corridas: los detectores crean y resuelven filas según el estado de la
 * cuenta, y con el reloj CONGELADO la guarda de frescura de `refreshInsights()` no rota
 * nunca, así que la primera lectura de una corrida puede refrescar y la siguiente no. El
 * resultado era un cuadrito rojo de 16 px que aparecía, desaparecía o cambiaba de cifra en
 * media docena de pantallas, y cada diff visual había que mirarlo para descartarlo.
 *
 * `visibility: hidden` y no `display: none`: el badge está en posición absoluta, así que
 * ninguna de las dos mueve nada — pero con `visibility` la caja sigue ahí y un cambio de
 * TAMAÑO del badge seguiría saliendo en el diff como corrimiento de lo que tenga al lado.
 * Lo que se renuncia a vigilar es su color y su cifra, a cambio de que el resto del diff
 * signifique algo.
 */
const OCULTAR_EN_CAPTURA = [".bell-badge"];

async function enmascararNoDeterminista(page) {
  try {
    await page.addStyleTag({
      content: `${OCULTAR_EN_CAPTURA.join(",")}{visibility:hidden !important}`,
    });
  } catch {
    /* la página se fue: la captura fallará por su cuenta y con mejor mensaje */
  }
}

/**
 * Lleva toda animación y TRANSICIÓN a su estado final.
 *
 * `animations: "disabled"` del screenshot congela animaciones, no transiciones: el revelado del
 * hero del landing terminaba en un punto marginalmente distinto en cada corrida (delta ≤ 2
 * repartido por todo el elemento, ~200 px). `finish()` no espera: salta al estado final, que es
 * justo el que queremos fotografiar. En animaciones infinitas lanza InvalidStateError, así que
 * esas se pausan en 0.
 */
async function finalizarAnimaciones(page) {
  try {
    await page.evaluate(() => {
      document.getAnimations().forEach((a) => {
        try {
          a.finish();
        } catch {
          try {
            a.pause();
            a.currentTime = 0;
          } catch {
            /* la animación ya no existe */
          }
        }
      });
    });
  } catch {
    /* getAnimations no disponible: seguir igual */
  }
}

/**
 * El login corre en un Chromium **sin banderas de determinismo**, y devuelve solo la sesión.
 *
 * Las banderas de captura —`--deterministic-mode` con `--disable-gpu`— dejan al navegador sin
 * producir fotogramas por su cuenta, y eso rompe tres cosas a la vez en CI: Playwright nunca
 * ve el botón «estable» (su comprobación se apoya en `requestAnimationFrame`),
 * `page.screenshot()` se queda esperando un fotograma que no llega, y `page.content()` sí
 * responde porque no necesita compositor. La evidencia del artefacto lo dijo sin margen:
 * `visible=true · habilitado=true · caja={x:461, y:504.28125, …}` y ninguna captura.
 *
 * `tests/a11y/sesion.ts` hace este mismo login en CI y pasa, precisamente porque lanza un
 * Chromium normal. Acá se hace igual: navegador propio, sesión, y se cierra. Las banderas se
 * quedan donde hacen falta — en el navegador que CAPTURA.
 */
async function iniciarSesion(_browserSinUsar, baseUrl, email, password) {
  const browser = await chromium.launch();
  /**
   * `reducedMotion: "reduce"`, igual que los contextos de captura de más abajo.
   *
   * No estaba, y era una inconsistencia del propio arnés: con la animación de entrada viva,
   * Playwright exige que el botón esté «visible, enabled AND STABLE» y en un runner cargado
   * el elemento sigue moviéndose entre fotogramas. En una máquina rápida la animación termina
   * antes de que nadie mire, así que el fallo solo aparecía en CI — y el mensaje, «esperando
   * el botón», mandaba a buscar el problema en la pantalla de login.
   */
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto(new URL("/login", baseUrl).toString(), { waitUntil: "networkidle" });
  await page.getByLabel("Correo").fill(email);
  // #password y no getByLabel: el toggle de visibilidad también matchea "Contraseña".
  await page.locator("#password").fill(password);
  /**
   * Un solo clic, y una espera LARGA. El reintento vuelve a pulsar solo si el botón está otra
   * vez en reposo.
   *
   * El bucle anterior —tres clics buscando el botón por su nombre— colgaba en CI y mentía
   * sobre la causa. `SubmitButton` es `disabled={pending}` y **cambia su texto a «Un
   * momento…»** mientras envía: si la primera navegación tarda más que el tope, el reintento
   * busca un botón llamado «Iniciar sesión» que en ese instante no existe, y Playwright
   * reporta «esperando el botón, visible y habilitado». Eso manda a mirar la pantalla de
   * login, cuando el problema estaba en otro lado: el primer `/dashboard` con la base recién
   * sembrada tarda bastante más de 20 s.
   */
  const boton = page.getByRole("button", { name: "Iniciar sesión" });

  /**
   * Si el clic no se puede dar, se guarda QUÉ se estaba viendo antes de morir.
   *
   * Dos diagnósticos seguidos fallaron por adivinar sobre un mensaje que solo dice «esperando
   * el botón, visible, enabled y estable» — sin decir CUÁL de las tres condiciones falta.
   * Una captura y el HTML del momento cuestan nada y cierran la discusión.
   */
  try {
    await boton.click({ timeout: 30_000 });
  } catch (e) {
    const { writeFile } = await import("node:fs/promises");
    await page.screenshot({ path: "qa-fallo-login.png", fullPage: true }).catch(() => {});
    await writeFile("qa-fallo-login.html", await page.content()).catch(() => {});
    const caja = await boton.boundingBox().catch(() => null);
    console.error(
      `login: no se pudo pulsar el botón. URL=${page.url()} · caja=${JSON.stringify(caja)} · ` +
        `visible=${await boton.isVisible().catch(() => "?")} · habilitado=${await boton
          .isEnabled()
          .catch(() => "?")}`,
    );
    throw e;
  }
  for (let intento = 0; intento < 3; intento++) {
    try {
      await page.waitForURL(/\/dashboard/, { timeout: 90_000 });
      break;
    } catch {
      if (intento === 2) {
        throw new Error(
          `Login no navegó a /dashboard tras 3 intentos (90 s cada uno). URL actual: ${page.url()}`,
        );
      }
      // Solo se vuelve a pulsar si el formulario volvió a reposo; si sigue enviando, se espera.
      if (await boton.isEnabled().catch(() => false)) await boton.click();
      else await page.waitForTimeout(2000);
    }
  }
  const storageState = await context.storageState();
  await context.close();
  // El navegador del login se cierra acá: solo existía para conseguir la sesión.
  await browser.close();
  return storageState;
}

/**
 * Visita una vez cada ruta con sesión, sin capturar.
 *
 * Varias pantallas ESCRIBEN en el primer load (el aporte mensual de los holdings recurrentes, los
 * snapshots del mes en curso, el refresco de insights). Son idempotentes, pero mueven los números:
 * entre dos corridas seguidas el flujo libre del panel cambiaba en ₡970.680 solo por eso. El
 * calentamiento paga ese costo ANTES de medir, así todas las capturas ven el mismo estado.
 */
async function calentar(browser, baseUrl, storageState, freeze) {
  const context = await browser.newContext({
    storageState,
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(freeze);
  for (const ruta of ROUTES.filter((r) => r.auth)) {
    try {
      await page.goto(new URL(ruta.path, baseUrl).toString(), {
        waitUntil: "networkidle",
        timeout: 60_000,
      });
    } catch {
      /* el calentamiento es best-effort: lo que falle acá se verá en la captura */
    }
  }
  await context.close();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const out = args.out;
  if (!out) {
    console.error("Falta --out <carpeta>");
    process.exit(2);
  }
  const baseUrl = args["base-url"] ?? "http://localhost:3001";
  const temas = args.theme === "light" || args.theme === "dark" ? [args.theme] : ["light", "dark"];
  const widths = String(args.widths ?? "390,768,1280")
    .split(",")
    .map((w) => Number(w.trim()))
    .filter((w) => Number.isFinite(w) && w > 0);

  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    console.error("Faltan E2E_EMAIL / E2E_PASSWORD en el entorno");
    process.exit(2);
  }

  /**
   * `--rutas /gastos,/dashboard` captura SOLO esas, por coincidencia exacta de `path`.
   *
   * Para comprobar un cambio acotado, las 200 pantallas son 40 minutos para mirar dos. El
   * inventario completo sigue siendo el defecto: esto se pide a propósito, y la corrida
   * imprime cuáles quedaron para que nadie confunda un diff parcial con uno completo.
   */
  const soloRutas = args.rutas
    ? new Set(
        String(args.rutas)
          .split(",")
          .map((r) => r.trim())
          .filter(Boolean),
      )
    : null;
  const conFiltro = soloRutas ? ROUTES.filter((r) => soloRutas.has(r.path)) : ROUTES;

  /**
   * `--shard 1/2` captura la mitad del inventario. Es para CI: las 200 pantallas no caben en
   * el tope de un job, y la alternativa —acotar por rutas— elegiría a mano lo que se mira.
   *
   * El reparto es determinista y por posición, así que la base y la rama capturan el MISMO
   * conjunto en cada shard. Ver `shard.mjs`.
   */
  const rutas = (() => {
    if (!args.shard) return conFiltro;
    const m = /^(\d+)\s*\/\s*(\d+)$/.exec(String(args.shard));
    if (!m) {
      console.error(`--shard inválido: ${args.shard} (se espera N/M, p. ej. 1/2)`);
      process.exit(2);
    }
    return repartirEnShards(conFiltro, Number(m[1]), Number(m[2]));
  })();
  if (soloRutas) {
    const encontradas = rutas.map((r) => r.path);
    const faltan = [...soloRutas].filter((r) => !encontradas.includes(r));
    if (faltan.length > 0) {
      console.error(`Rutas que no están en routes.json: ${faltan.join(", ")}`);
      process.exit(2);
    }
    console.log(`SOLO ${encontradas.length} ruta(s): ${encontradas.join(", ")}`);
  }

  const freeze = instanteCongelado(args.freeze);
  // Render determinista: sin esto, dos corridas idénticas difieren en ±1-2 niveles de color en los
  // bordes (antialiasing de texto y degradados). Son 200 px invisibles, pero rompen la comparación
  // estricta a umbral 0 — y bajar el umbral taparía cambios de color reales de 1-2 niveles.
  /**
   * `--deterministic-mode` se cae en CI, y solo en CI.
   *
   * Esa bandera fija el reloj y el planificador del navegador, y en el runner deja de producir
   * fotogramas: la comprobación «estable» de Playwright se apoya en `requestAnimationFrame`,
   * `page.screenshot()` espera un fotograma que no llega y `page.content()` sí responde porque
   * no necesita compositor. En la Mac la misma bandera SÍ avanza — medido, «rAF avanza: sí ·
   * 34 ms» — y por eso el fallo era invisible en local.
   *
   * Las otras cuatro se quedan en los dos sitios: son las que de verdad fijan el RENDER (perfil
   * de color, antialiasing en gris, sin hinting, rasterizado por software), y sin ellas dos
   * corridas idénticas difieren en ±1-2 niveles en los bordes.
   *
   * Y el determinismo no se da por supuesto: con `QA_CI=1` el propio job vuelve a capturar 20
   * rutas al final y compara las dos tandas. Si no da cero, falla.
   */
  const enCI = process.env.QA_CI === "1";
  const banderas = [
    "--force-color-profile=srgb", // mismo perfil siempre, no el del monitor
    "--disable-lcd-text", // antialiasing en gris, no subpíxel (el subpíxel varía)
    "--font-render-hinting=none",
    "--disable-gpu", // rasterizado por software: reproducible entre corridas
    ...(enCI ? [] : ["--deterministic-mode"]),
  ];
  if (enCI) console.log("QA_CI=1 · sin --deterministic-mode (no produce fotogramas en el runner)");
  const browser = await chromium.launch({ args: banderas });
  /**
   * ¿Avanza `requestAnimationFrame` en ESTE navegador?
   *
   * No es curiosidad: `--deterministic-mode` con `--disable-gpu` puede dejarlo sin producir
   * fotogramas, y de eso dependen la comprobación de estabilidad de Playwright, las capturas
   * y cualquier `waitForFunction` que espere a que algo se asiente. Si no avanza hay que
   * saberlo ANTES de las 200 pantallas, no deducirlo de un timeout a la mitad.
   */
  const rAF = await (async () => {
    const p = await browser.newPage();
    const t0 = Date.now();
    const avanza = await p
      .evaluate(
        () =>
          new Promise((res) => {
            const t = setTimeout(() => res(false), 5000);
            requestAnimationFrame(() => {
              clearTimeout(t);
              res(true);
            });
          }),
      )
      .catch(() => false);
    const ms = Date.now() - t0;
    await p.close();
    return { avanza, ms };
  })();
  console.log(`rAF avanza: ${rAF.avanza ? "sí" : "NO"} · ${rAF.ms} ms`);
  if (!rAF.avanza) {
    console.log(
      "  Sin fotogramas, las esperas por `waitForFunction` pasan a sondeo por intervalo:\n" +
        "  su modo por defecto es `raf`, que acá no dispararía nunca y venceria el tope entero.",
    );
  }
  const modoEspera = rAF.avanza ? undefined : { polling: 250 };

  const entries = [];
  let conTerminos = 0;
  let vencidos = 0;

  try {
    const storageState = await iniciarSesion(browser, baseUrl, email, password);
    console.log(`reloj congelado: ${freeze.toISOString()}`);
    console.log("calentando (visita sin capturar; paga las escrituras del primer load)…");
    await calentar(browser, baseUrl, storageState, freeze);

    for (const tema of temas) {
      for (const width of widths) {
        for (const ruta of rutas) {
          // Una superficie con anchos propios se salta el resto: no es un fallo, es que esa
          // pantalla no existe a ese ancho.
          const permitidos = anchosDe(ruta);
          if (permitidos && !permitidos.includes(width)) continue;

          const context = await browser.newContext({
            storageState: ruta.auth ? storageState : undefined,
            viewport: { width, height: 900 },
            colorScheme: tema,
            reducedMotion: "reduce",
          });
          // El tema se persiste en localStorage y el script anti-parpadeo del layout raíz lo
          // fija como data-theme antes del primer paint: sin esto, emulateMedia sola no alcanza.
          await context.addInitScript(
            ([key, value]) => {
              try {
                localStorage.setItem(key, value);
              } catch {
                /* storage bloqueado: la media query igual aplica */
              }
            },
            [THEME_KEY, tema],
          );

          const page = await context.newPage();
          const consoleErrors = [];
          page.on("pageerror", (err) => consoleErrors.push(String(err?.message ?? err)));

          await page.clock.setFixedTime(freeze);
          await page.emulateMedia({ colorScheme: tema, reducedMotion: "reduce" });
          await page.setViewportSize({ width, height: 900 });

          const url = new URL(ruta.path, baseUrl).toString();
          const t0 = Date.now();
          let navError = null;
          try {
            await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
          } catch (err) {
            navError = String(err?.message ?? err);
          }
          const networkidleMs = Date.now() - t0;

          await page.waitForTimeout(ESPERA_EXTRA_MS);
          await recorrerPagina(page);
          await esperarFuentes(page);
          await finalizarAnimaciones(page);
          await enmascararNoDeterminista(page);
          const loadingResidual = await esperarSinCargando(page, modoEspera);
          if (loadingResidual) vencidos++;
          // Y los esqueletos de gráfico, que NO dicen «Cargando…»: ver `esperarSinEsqueletos`.
          const esqueletoResidual = await esperarSinEsqueletos(page, modoEspera);
          if (esqueletoResidual) vencidos++;
          const termsModal = await hayModalTerminos(page);
          if (termsModal) conTerminos++;

          const file = path.join(String(out), tema, String(width), `${slug(ruta.path)}.png`);
          await mkdir(path.dirname(file), { recursive: true });
          await page.screenshot({ path: file, fullPage: true, animations: "disabled" });

          entries.push({
            route: ruta.path,
            width,
            theme: tema,
            file: path.relative(String(out), file),
            networkidleMs,
            navError,
            consoleErrors,
            termsModal,
            loadingResidual,
            esqueletoResidual,
          });
          console.log(
            `${tema}/${width} ${ruta.path} · ${networkidleMs}ms` +
              `${navError ? " · ERROR NAV" : ""}` +
              `${consoleErrors.length ? ` · ${consoleErrors.length} err` : ""}` +
              `${termsModal ? " · términos" : ""}` +
              `${loadingResidual ? " · Cargando… residual" : ""}` +
              `${esqueletoResidual ? " · ESQUELETO residual" : ""}`,
          );

          await context.close();
        }
      }
    }
  } finally {
    await browser.close();
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    /**
     * Con qué banderas de interfaz se compiló el servidor que se acaba de capturar, leídas de
     * la cabecera que pone el propio build (`src/lib/qa/banderas.ts`). `null` si el servidor no
     * la manda —un build anterior a esta guarda—, y eso NO es lo mismo que «ninguna».
     *
     * Se lee del SERVIDOR y no del entorno de este proceso a propósito: lo que importa es con
     * qué se compiló lo que se está mirando, no qué variables tenía quien captura.
     */
    banderas: await leerBanderas(baseUrl),
    fixedTime: freeze.toISOString(),
    fixedTimeSource:
      args.freeze && args.freeze !== true
        ? "--freeze"
        : process.env.QA_FREEZE
          ? "QA_FREEZE"
          : `hoy 12:00 ${TZ}`,
    serverFreeze: process.env.QA_FREEZE ?? null,
    tz: process.env.TZ ?? null,
    warmup: true,
    widths,
    themes: temas,
    entries,
  };
  await writeFile(path.join(String(out), "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(
    `\n${entries.length} capturas · manifest en ${path.join(String(out), "manifest.json")}`,
  );

  if (conTerminos > 0) {
    console.log(
      `\n⚠️  El modal de Términos apareció en ${conTerminos} captura(s) y NO se aceptó (a propósito).\n` +
        `    Aceptar los términos con la cuenta antes de la línea base definitiva.`,
    );
  }
}

// Solo al ejecutarlo directo: `ROUTES` se importa desde otros scripts sin disparar una corrida.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

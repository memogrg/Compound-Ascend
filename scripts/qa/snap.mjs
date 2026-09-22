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
export const ROUTES = JSON.parse(readFileSync(new URL("./routes.json", import.meta.url), "utf8"));

/**
 * Anchos por superficie. `/m` es un shell de teléfono —viewport bloqueado, `viewportFit:
 * cover`— y a 1280 no se ve nada que exista en un dispositivo real: capturarlo ahí sería
 * fabricar una pantalla que nadie usa. Sin `superficie`, la ruta es web y no se restringe.
 *
 * Duplicado a propósito en `tests/a11y/routes.spec.ts`: ese `.ts` no puede importar este
 * `.mjs` (ver el comentario de ROUTES). Si cambia acá, cambia allá.
 */
export const ANCHOS_POR_SUPERFICIE = { m: [390, 768] };

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
export function instanteCongelado(iso) {
  // Precedencia: --freeze > QA_FREEZE (la misma que usa el servidor congelado) > hoy 12:00.
  const elegido = iso && iso !== true ? iso : (process.env.QA_FREEZE ?? null);
  if (elegido) {
    const d = new Date(String(elegido));
    if (Number.isNaN(d.getTime())) {
      console.error(`instante congelado inválido: ${elegido}`);
      process.exit(2);
    }
    return d;
  }
  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${hoy}T12:00:00-06:00`);
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
async function esperarSinCargando(page) {
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
      { timeout: TIMEOUT_CARGANDO_MS },
    );
    return false;
  } catch {
    return true; // venció el timeout: queda un «Cargando…» residual
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

async function iniciarSesion(browser, baseUrl, email, password) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(new URL("/login", baseUrl).toString(), { waitUntil: "networkidle" });
  await page.getByLabel("Correo").fill(email);
  // #password y no getByLabel: el toggle de visibilidad también matchea "Contraseña".
  await page.locator("#password").fill(password);
  for (let intento = 0; intento < 3; intento++) {
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    try {
      await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
      break;
    } catch {
      if (intento === 2) throw new Error("Login no navegó tras 3 intentos");
      await page.waitForTimeout(1000);
    }
  }
  const storageState = await context.storageState();
  await context.close();
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

  const freeze = instanteCongelado(args.freeze);
  // Render determinista: sin esto, dos corridas idénticas difieren en ±1-2 niveles de color en los
  // bordes (antialiasing de texto y degradados). Son 200 px invisibles, pero rompen la comparación
  // estricta a umbral 0 — y bajar el umbral taparía cambios de color reales de 1-2 niveles.
  const browser = await chromium.launch({
    args: [
      "--force-color-profile=srgb", // mismo perfil siempre, no el del monitor
      "--disable-lcd-text", // antialiasing en gris, no subpíxel (el subpíxel varía)
      "--font-render-hinting=none",
      "--disable-gpu", // rasterizado por software: reproducible entre corridas
      "--deterministic-mode",
    ],
  });
  const entries = [];
  let conTerminos = 0;

  try {
    const storageState = await iniciarSesion(browser, baseUrl, email, password);
    console.log(`reloj congelado: ${freeze.toISOString()}`);
    console.log("calentando (visita sin capturar; paga las escrituras del primer load)…");
    await calentar(browser, baseUrl, storageState, freeze);

    for (const tema of temas) {
      for (const width of widths) {
        for (const ruta of ROUTES) {
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
          const loadingResidual = await esperarSinCargando(page);
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
          });
          console.log(
            `${tema}/${width} ${ruta.path} · ${networkidleMs}ms` +
              `${navError ? " · ERROR NAV" : ""}` +
              `${consoleErrors.length ? ` · ${consoleErrors.length} err` : ""}` +
              `${termsModal ? " · términos" : ""}` +
              `${loadingResidual ? " · Cargando… residual" : ""}`,
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

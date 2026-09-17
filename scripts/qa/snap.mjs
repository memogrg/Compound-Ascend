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
 */
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Rutas capturadas. Las públicas van sin sesión (no requieren login). */
export const ROUTES = [
  { path: "/dashboard", auth: true },
  { path: "/mis-acciones", auth: true },
  { path: "/mis-acciones?tab=decisiones", auth: true },
  { path: "/mis-acciones?tab=progreso", auth: true },
  { path: "/asistente", auth: true },
  { path: "/mi-base-financiera", auth: true },
  { path: "/ingresos", auth: true },
  { path: "/gastos", auth: true },
  { path: "/transacciones", auth: true },
  { path: "/control-financiero", auth: true },
  { path: "/deudas", auth: true },
  { path: "/patrimonio", auth: true },
  { path: "/patrimonio/proteccion", auth: true },
  { path: "/patrimonio/indicadores", auth: true },
  { path: "/mi-rich-life", auth: true },
  { path: "/mi-perfil-financiero", auth: true },
  { path: "/configurar", auth: true },
  { path: "/configuracion", auth: true },
  { path: "/suscripcion", auth: true },
  { path: "/", auth: false },
  { path: "/faqs", auth: false },
  { path: "/login", auth: false },
  { path: "/empezar", auth: false },
];

/** Instante congelado: sin esto los «hoy» de la app cambian entre corridas y todo difiere. */
const FIXED_TIME = new Date("2026-08-16T12:00:00-06:00");
const THEME_KEY = "ca-theme"; // src/components/layout/theme-provider.tsx
const ESPERA_EXTRA_MS = 800;
const TIMEOUT_CARGANDO_MS = 10_000;

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

/** Empuja el lazy-load/IntersectionObserver: al final y de vuelta arriba. */
async function recorrerPagina(page) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
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

  const browser = await chromium.launch();
  const entries = [];
  let conTerminos = 0;

  try {
    const storageState = await iniciarSesion(browser, baseUrl, email, password);

    for (const tema of temas) {
      for (const width of widths) {
        for (const ruta of ROUTES) {
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

          await page.clock.setFixedTime(FIXED_TIME);
          await page.emulateMedia({ colorScheme: tema });
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
    fixedTime: FIXED_TIME.toISOString(),
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

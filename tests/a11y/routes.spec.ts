/**
 * Inventario de accesibilidad por ruta. NO corrige nada y NO falla: mide.
 *
 * Es la línea base de a11y del proyecto, el equivalente de `qa-snapshots/base` para el
 * CSS. Corre contra el servidor CONGELADO (`npm run qa:start`) para que el inventario sea
 * comparable entre días: sin eso, una fecha o un precio distinto cambia el DOM y con él
 * el conteo de nodos.
 *
 * Reutiliza `ROUTES` de `scripts/qa/snap.mjs` —la misma lista que las capturas— y respeta
 * su flag `auth`: las públicas se visitan sin sesión.
 *
 * Salida: un JSON crudo por ruta y ancho en `qa-snapshots/a11y/` (ignorado por git) y el
 * informe legible en `docs/cartera-plus-redesign/qa/a11y-baseline.md`, que se genera con
 * `node scripts/qa/a11y-report.mjs`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page, type BrowserContext } from "@playwright/test";

type Ruta = { path: string; auth: boolean };

/**
 * Misma lista que las capturas visuales, leída del JSON compartido.
 *
 * No se importa `ROUTES` de `scripts/qa/snap.mjs` porque el cargador de TypeScript de
 * Playwright transpila los `.mjs` a CommonJS y el import revienta con «exports is not
 * defined in ES module scope». El JSON evita el problema de formato de módulo y mantiene
 * una sola fuente: `snap.mjs` lee exactamente el mismo archivo.
 */
const ROUTES: Ruta[] = JSON.parse(
  readFileSync(path.join(process.cwd(), "scripts/qa/routes.json"), "utf8"),
);

const ANCHOS = [1280, 390] as const;
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const SALIDA = "qa-snapshots/a11y";

/** `/mis-acciones?tab=decisiones` → `mis-acciones__tab-decisiones`. Igual que snap.mjs. */
function slug(routePath: string): string {
  const s = routePath
    .replace(/^\//, "")
    .replace(/\?/g, "__")
    .replace(/[=&]/g, "-")
    .replace(/\//g, "_");
  return s === "" ? "home" : s;
}

let estadoSesion: Awaited<ReturnType<BrowserContext["storageState"]>> | null = null;

/** Una sola sesión para todas las rutas con auth, como en las capturas. */
async function iniciarSesion(page: Page): Promise<void> {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  expect(email, "falta E2E_EMAIL").toBeTruthy();
  expect(password, "falta E2E_PASSWORD").toBeTruthy();

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Correo").fill(email!);
  // #password y no getByLabel: el toggle de visibilidad también matchea "Contraseña".
  await page.locator("#password").fill(password!);
  for (let intento = 0; intento < 3; intento++) {
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    try {
      await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
      return;
    } catch {
      if (intento === 2) throw new Error("Login no navegó tras 3 intentos");
      await page.waitForTimeout(1000);
    }
  }
}

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await iniciarSesion(page);
  estadoSesion = await ctx.storageState();
  await ctx.close();
});

for (const ruta of ROUTES) {
  for (const ancho of ANCHOS) {
    test(`a11y ${ruta.path} @${ancho}`, async ({ browser }) => {
      const ctx = await browser.newContext({
        storageState: ruta.auth ? (estadoSesion ?? undefined) : undefined,
        viewport: { width: ancho, height: 900 },
        colorScheme: "light",
        reducedMotion: "reduce",
      });
      const page = await ctx.newPage();
      await page.goto(ruta.path, { waitUntil: "networkidle", timeout: 60_000 });
      await page.waitForTimeout(800);

      const resultado = await new AxeBuilder({ page }).withTags(TAGS).analyze();

      const archivo = path.join(SALIDA, `${slug(ruta.path)}--${ancho}.json`);
      await mkdir(path.dirname(archivo), { recursive: true });
      await writeFile(
        archivo,
        JSON.stringify(
          {
            route: ruta.path,
            width: ancho,
            auth: ruta.auth,
            url: page.url(),
            testEngine: resultado.testEngine,
            violations: resultado.violations,
            incomplete: resultado.incomplete.map((i) => ({ id: i.id, nodes: i.nodes.length })),
          },
          null,
          2,
        ),
      );

      const porImpacto = resultado.violations.reduce<Record<string, number>>((acc, v) => {
        const k = v.impact ?? "sin-impacto";
        acc[k] = (acc[k] ?? 0) + v.nodes.length;
        return acc;
      }, {});
      // El inventario ES la salida de este spec: el console.log es intencional.
      console.log(
        `${ruta.path} @${ancho}: ${resultado.violations.length} reglas, ` +
          `${resultado.violations.reduce((s, v) => s + v.nodes.length, 0)} nodos ` +
          `(${
            Object.entries(porImpacto)
              .map(([k, n]) => `${k}:${n}`)
              .join(" ") || "sin violaciones"
          })`,
      );

      await ctx.close();
      // NO se asierta sobre las violaciones: este spec es la línea base, no un gate.
    });
  }
}

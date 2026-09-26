/**
 * DIAGNÓSTICO TEMPORAL — no es una prueba. Se borra en cuanto haya evidencia.
 *
 * Los 5 fallos de `E2E nav-v2` en CI son todos `page.goto(…networkidle)` a 60 s, y en local
 * la misma corrida tarda 3,9 s. Esto imprime QUÉ peticiones quedan en vuelo cuando se acaba
 * el tiempo, y cuánto tardó cada una, para no tener que adivinarlo.
 */
import { test, type Browser } from "@playwright/test";

import { ESTADO_SESION } from "./sesion";

test("diag: qué queda en vuelo al cargar /dashboard", async ({ browser }: { browser: Browser }) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({
    storageState: ESTADO_SESION,
    viewport: { width: 390, height: 844 },
  });
  const page = await ctx.newPage();

  const enVuelo = new Map<string, number>();
  const tiempos: { url: string; ms: number; estado: string }[] = [];
  const t0 = Date.now();

  page.on("request", (r) => enVuelo.set(r.url(), Date.now()));
  page.on("requestfinished", (r) => {
    const t = enVuelo.get(r.url());
    if (t) tiempos.push({ url: r.url(), ms: Date.now() - t, estado: "ok" });
    enVuelo.delete(r.url());
  });
  page.on("requestfailed", (r) => {
    const t = enVuelo.get(r.url());
    if (t)
      tiempos.push({
        url: r.url(),
        ms: Date.now() - t,
        estado: `falló: ${r.failure()?.errorText}`,
      });
    enVuelo.delete(r.url());
  });

  let resultado = "networkidle alcanzado";
  try {
    await page.goto("/dashboard", { waitUntil: "networkidle", timeout: 60_000 });
  } catch (e) {
    resultado = `TIMEOUT: ${(e as Error).message.split("\n")[0]}`;
  }
  const transcurrido = Date.now() - t0;

  console.log(`\n=== DIAG networkidle · ${resultado} · ${transcurrido} ms ===`);
  console.log(`peticiones terminadas: ${tiempos.length} · en vuelo al final: ${enVuelo.size}`);
  console.log("\n-- EN VUELO al acabarse el tiempo --");
  for (const [url, t] of enVuelo) console.log(`  ${Date.now() - t} ms  ${url}`);
  console.log("\n-- las 15 más lentas que SÍ terminaron --");
  for (const r of tiempos.sort((a, b) => b.ms - a.ms).slice(0, 15)) {
    console.log(`  ${r.ms} ms  [${r.estado}]  ${r.url}`);
  }
  // Confirmación aparte: ¿la bandera está encendida en la página que se cargó?
  console.log(`\nbn-item: ${await page.locator(".bottom-nav .bn-item").count()}`);
  console.log(`mn2-tabs: ${await page.locator(".mn2-tabs").count()}`);
  await ctx.close();
});

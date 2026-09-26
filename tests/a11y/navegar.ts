/**
 * Cómo se abre una pantalla en los specs de navegación, y por qué NO con `networkidle`.
 *
 * Los cinco fallos de `E2E nav-v2` en CI eran todos `page.goto(…, "networkidle")` agotando
 * 60 s sobre `/dashboard`, mientras en local la misma corrida tardaba 3,9 s. El diagnóstico
 * que se corrió en el propio CI dejó el dato exacto:
 *
 *   === DIAG networkidle · TIMEOUT · 60008 ms ===
 *   peticiones terminadas: 107 · en vuelo al final: 0
 *   30058 ms  [ok]      http://localhost:3001/dashboard
 *    2820 ms  [ABORTED] http://localhost:3001/mis-acciones?tab=progreso&_rsc=…
 *    2735 ms  [ABORTED] http://localhost:3001/mi-base-financiera?_rsc=…
 *    … doce más, todas `?_rsc=`, todas abortadas
 *
 * **No hay nada colgado**: cero peticiones en vuelo al acabarse el tiempo. Lo que pasa es
 * que el App Router PREFETCHEA cada enlace que entra en el viewport, y en `/dashboard` eso
 * son los cinco núcleos más el submenú. Cada prefetch es un render de servidor completo
 * contra Postgres; en el runner de CI —4 vCPU compartidos con el stack de Supabase en
 * Docker— tarda ~2 s y Next los va abortando y relanzando según cambia el viewport. El
 * contador de `networkidle` necesita 500 ms seguidos con CERO peticiones, y ese hueco no
 * aparece nunca dentro de los 60 s. En local, con las mismas peticiones a ~200 ms, sí.
 *
 * O sea: la condición de espera era insatisfacible en CI por construcción, no lenta. Subir
 * el tiempo no la arregla — con 120 s haría lo mismo. La documentación de Playwright ya
 * desaconseja `networkidle` por esto exactamente.
 *
 * Aquí se espera lo que el test necesita de verdad: que el documento esté parseado y que el
 * elemento que se va a medir esté VISIBLE. El presupuesto de tiempo es el mismo de antes
 * (60 s de navegación), repartido entre las dos esperas.
 */
import type { Page } from "@playwright/test";

/** Navegación: el documento tarda ~30 s en CI la primera vez (arranque en frío del server). */
const MS_NAVEGACION = 60_000;
/** Ya con el HTML en mano, el elemento aparece en cuanto hidrata. */
const MS_ELEMENTO = 30_000;

/**
 * Abre `url` y no vuelve hasta que `listoCuando` es visible.
 *
 * `listoCuando` es el ancla del test, no un genérico: esperar `main` y medir `.bottom-nav`
 * es volver a esperar una cosa y comprobar otra, que es el error de origen.
 */
export async function irA(page: Page, url: string, listoCuando = "main"): Promise<void> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: MS_NAVEGACION });
  // `load` y no `networkidle`: espera los subrecursos DEL DOCUMENTO —los chunks de JS, que
  // es lo que hace falta para que React hidrate— y no los `fetch` de prefetch que vengan
  // después, que son justo los que hacían insatisfacible a `networkidle`. Es una cota
  // superior que sí existe.
  await page.waitForLoadState("load", { timeout: MS_ELEMENTO });
  await page.locator(listoCuando).first().waitFor({ state: "visible", timeout: MS_ELEMENTO });
}

/**
 * ¿Existe el elemento, esperándolo un rato corto? Para las SONDAS de bandera, donde «no
 * está» es una respuesta legítima (bandera apagada) y no un fallo.
 *
 * El rato es corto a propósito: con la bandera apagada el elemento no va a aparecer nunca,
 * y no se puede pagar el timeout largo en cada sonda.
 */
export async function apareceA(page: Page, selector: string, ms = 10_000): Promise<boolean> {
  return page
    .locator(selector)
    .first()
    .waitFor({ state: "visible", timeout: ms })
    .then(() => true)
    .catch(() => false);
}

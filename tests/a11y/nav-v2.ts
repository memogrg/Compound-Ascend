/**
 * Cómo se decide si `NEXT_PUBLIC_NAV_V2` está encendida, mirando la barra.
 *
 * La decisión vive aparte del spec y es PURA porque es lo que se ha equivocado tres veces, y
 * cada vez el síntoma fue el mismo y engañoso: un caso se auto-saltaba diciendo «NAV_V2 apagada»
 * —mentira—, y el guardián de CI convertía esa mentira en «la bandera no llegó al build» y tumbaba
 * el job entero con sus 23 tests en verde.
 *
 * Las tres versiones y por qué fallaron:
 *
 *   1. `count() > 0` — atrapaba un montaje a medias: con tres ítems pintados concluía «apagada».
 *   2. `count() >= 5` — lo arregló a medias. **6 también cumple**, y 6 es justo la respuesta
 *      «apagada». Peor: durante la hidratación en streaming conviven el fallback de `Suspense` y
 *      el contenido ya resuelto, así que `.bottom-nav .bn-item` llega a contar **10**. Diez es
 *      `>= 5` y no es 5, así que la sonda concluía «apagada» con la bandera encendida. Explica que
 *      fuera intermitente y que pegara en `/dashboard?period=2026-08`, la carga más pesada.
 *   3. Esta: no se mira un umbral, se mira una barra COMPLETA y ÚNICA.
 *
 * Una barra completa tiene cinco ítems (bandera encendida) o seis (apagada). Cualquier otra cosa
 * —cero, tres, diez— no es una respuesta: es que todavía no terminó de montar.
 */

/** Lo que se observa del DOM en un instante. */
export type MuestraBarra = { barras: number; items: number };

export type DecisionNavV2 = { listo: true; v2: boolean } | { listo: false; motivo: string };

/**
 * ¿Ya se puede responder, y qué se responde?
 *
 * Pura a propósito: así el caso que importa —«encendida pero todavía montando»— se prueba sin
 * navegador y sin esperar a que CI tenga un mal día.
 */
export function decidirNavV2({ barras, items }: MuestraBarra): DecisionNavV2 {
  if (barras === 0) return { listo: false, motivo: "no hay ninguna barra en el DOM" };
  if (barras > 1)
    return {
      listo: false,
      motivo: `hay ${barras} barras en el DOM (el fallback de Suspense y el contenido resuelto conviven mientras se hidrata)`,
    };
  if (items === 5) return { listo: true, v2: true };
  if (items === 6) return { listo: true, v2: false };
  return {
    listo: false,
    motivo: `la barra tiene ${items} ítems, y una barra completa tiene 5 (bandera encendida) o 6 (apagada)`,
  };
}

/**
 * Espera a que la barra dé una respuesta y la devuelve.
 *
 * Lanza con el ÚLTIMO motivo y el tiempo esperado si se agota: un timeout que solo dice «expect
 * falló» manda a la siguiente persona a mirar el selector, que es donde no está el problema.
 */
export async function esperarNavV2(
  page: import("@playwright/test").Page,
  { tope = 15_000, paso = 100 }: { tope?: number; paso?: number } = {},
): Promise<boolean> {
  const t0 = Date.now();
  let ultimo = "(sin medir todavía)";
  while (Date.now() - t0 < tope) {
    const barras = await page.locator(".bottom-nav").count();
    const items = barras === 1 ? await page.locator(".bottom-nav .bn-item").count() : 0;
    const d = decidirNavV2({ barras, items });
    if (d.listo) return d.v2;
    ultimo = d.motivo;
    await page.waitForTimeout(paso);
  }
  throw new Error(
    `la barra no dio una respuesta en ${Math.round((Date.now() - t0) / 1000)} s.\n` +
      `  Lo último que vi: ${ultimo}.\n` +
      "  Una barra completa tiene 5 ítems (NAV_V2 encendida) o 6 (apagada); esto NO es que la\n" +
      "  bandera esté apagada, es que la barra no terminó de montar.",
  );
}

/**
 * El instante en el que se congela el reloj de QA. Sin `import.meta`, a propósito.
 *
 * Vivía dentro de `snap.mjs`, que sí lo usa (para `routes.json` y para saber si lo invocaron
 * directo). Playwright transpila los specs a CommonJS, así que importar `snap.mjs` desde un spec
 * reventaba con «Cannot use 'import.meta' outside a module» y se llevaba por delante los cuatro
 * jobs de E2E — sin un solo test ejecutado, con «No tests found».
 *
 * Está en su propio módulo para que haya UNA implementación de «qué día es» y la puedan usar los
 * tres sitios que la necesitan: el arnés de capturas, el servidor congelado y los specs. Dos
 * implementaciones se separan en cuanto una cambia, y la que cambia no es la que falla.
 */

/** La zona del producto. El mediodía de referencia es el suyo, no el de la máquina. */
const TZ = "America/Costa_Rica";

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

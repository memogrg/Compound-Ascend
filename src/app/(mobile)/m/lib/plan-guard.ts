/**
 * El muro de plan del MÓVIL.
 *
 * La web lo resuelve en el middleware, pero `/m` está en PUBLIC_PREFIXES —tiene que
 * estarlo: su layout es dueño de la guarda de sesión y redirige a `/m/login`— así que
 * el muro del middleware nunca corre para el móvil. Por eso vive en el layout de
 * `(app)`, y la decisión se aísla acá para poder probarla sin montar Next.
 *
 * Y NO es el mismo muro: la web manda a `/empezar` (checkout de Stripe), y la app
 * nativa no puede dirigir a comprar fuera de la tienda (Apple 3.1.1, Google Payments).
 * Hasta que exista IAP, el móvil solo informa el estado de la cuenta.
 */

/**
 * Lo único que alcanza una cuenta sin plan activo en el móvil.
 *
 * `/m/perfil` está adentro por la misma razón que `/configuracion` en la web: ahí viven
 * exportar los datos y borrar la cuenta. Encerrar a alguien sin dejarlo llevarse su
 * información sería usar sus propios datos como rehén.
 */
export const RUTAS_MOVIL_SIN_PLAN = ["/m/perfil", "/m/sin-plan"];

/**
 * ¿Hay que mandar a `/m/sin-plan`?
 *
 * Falla ABIERTO a propósito en los dos casos dudosos: sin perfil todavía (registro a
 * medias) y sin pathname conocido. Lo segundo no es teórico — si el header no llegara,
 * `/m/sin-plan` tampoco podría reconocerse a sí misma y la redirección se volvería un
 * bucle infinito. Ante la duda, dejar pasar: un muro que falla encierra, y encerrar a
 * alguien en su propia app es peor que mostrarle de más por un rato.
 */
export function debeRedirigirSinPlan(
  plan: string | null | undefined,
  pathname: string | null | undefined,
): boolean {
  if (plan !== "ninguno") return false;
  if (!pathname) return false;
  return !RUTAS_MOVIL_SIN_PLAN.some((r) => pathname === r || pathname.startsWith(r + "/"));
}

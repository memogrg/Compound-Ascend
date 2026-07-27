"use client";

/**
 * Bloqueo de scroll del fondo para las hojas modales, endurecido para iOS.
 *
 * El problema que resuelve (diagnosticado en device con el Inspector, 27 jul): con una hoja
 * abierta y el teclado numérico arriba, iOS desplaza el DOCUMENTO ~294px para revelar el
 * input. El `body { overflow: hidden }` de antes NO lo impedía —el scroll que ocurre es el
 * del scrollView nativo del WKWebView, no el del body—, así que el header sticky y el velo
 * de la hoja se iban a -294 y el contenido quedaba bajo el reloj.
 *
 * El arreglo: fijar el documento con `position: fixed` y un offset guardado. Con el
 * documento sin scroll posible, el WKWebView no tiene a dónde desplazar el scrollView al
 * abrir el teclado, así que nada se va bajo la barra de estado.
 *
 * CONTADOR de anidamiento: el alta rápida abre pickers dentro de la hoja (BottomSheet dentro
 * de BottomSheet). Sin contar, la hoja interna al cerrar restauraría el scroll con el body
 * aún fijado por la externa —y `window.scrollY` valdría 0—, perdiendo la posición. El lock
 * se aplica solo en la PRIMERA hoja y se retira en la ÚLTIMA, guardando el scroll una vez.
 */

let locks = 0;
let scrollY = 0;
const saved: Partial<Record<"position" | "top" | "left" | "right" | "width" | "overflow", string>> =
  {};

export function lockBodyScroll(): void {
  if (typeof document === "undefined") return;
  if (locks === 0) {
    scrollY = window.scrollY;
    const b = document.body.style;
    saved.position = b.position;
    saved.top = b.top;
    saved.left = b.left;
    saved.right = b.right;
    saved.width = b.width;
    saved.overflow = b.overflow;
    b.position = "fixed";
    b.top = `-${scrollY}px`;
    b.left = "0";
    b.right = "0";
    b.width = "100%";
    // overflow:hidden se mantiene como cinturón además de los tirantes (algunos navegadores
    // scrollean el body aunque sea position:fixed si el contenido rebosa).
    b.overflow = "hidden";
  }
  locks += 1;
}

export function unlockBodyScroll(): void {
  if (typeof document === "undefined" || locks === 0) return;
  locks -= 1;
  if (locks === 0) {
    const b = document.body.style;
    b.position = saved.position ?? "";
    b.top = saved.top ?? "";
    b.left = saved.left ?? "";
    b.right = saved.right ?? "";
    b.width = saved.width ?? "";
    b.overflow = saved.overflow ?? "";
    // Devuelve la página a donde estaba: fijar el body la había "olvidado".
    window.scrollTo(0, scrollY);
  }
}

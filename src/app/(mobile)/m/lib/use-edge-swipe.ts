"use client";

import { useEffect } from "react";

/**
 * Abrir el menú arrastrando desde el BORDE DERECHO.
 *
 * Por qué existe: al quitarse la barra de pestañas, moverse por la app quedó apoyado en el
 * ☰ del header — esquina superior derecha, el punto más difícil de alcanzar con el pulgar
 * en un teléfono grande. El icono sigue estando; esto solo añade una segunda vía que no
 * obliga a estirar la mano.
 *
 * Por qué el borde DERECHO y no el izquierdo:
 *  · El drawer sale por la derecha (`justify-content: flex-end`), así que el gesto va en la
 *    misma dirección que el panel: se tira de él hacia dentro.
 *  · El borde izquierdo es del sistema. iOS lo usa para "atrás" en el WKWebView, y
 *    disputárselo es una pelea que se pierde: o lo robamos y rompemos la navegación
 *    nativa, o lo perdemos y el gesto no dispara nunca.
 *
 * NO intercepta nada. Escucha en `window` de forma pasiva y jamás llama a preventDefault,
 * así que el scroll y los SwipeRow de las listas siguen recibiendo sus eventos igual. Si
 * el gesto no cumple el umbral, aquí no ha pasado nada.
 */

/** Franja del borde donde nace el gesto. Estrecha a propósito: los SwipeRow de las listas
 *  se arrastran desde el centro de la fila, así que no compiten por esta zona. */
const BORDE_PX = 24;
/** Recorrido horizontal mínimo, hacia la izquierda. */
const MIN_DX = 60;
/** Desvío vertical máximo: por encima de esto el usuario está haciendo scroll, no abriendo. */
const MAX_DY = 40;

export function useEdgeSwipe(onOpen: () => void, activo = true) {
  useEffect(() => {
    if (!activo) return;

    let x0 = 0;
    let y0 = 0;
    let armado = false;

    const empezar = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      // Con un overlay abierto (hoja, menú, diálogo, candado) el gesto no aplica: ahí el
      // borde derecho pertenece a esa capa.
      if (document.querySelector(".m-menu-overlay, .m-sheet-overlay, .m-dialog, .m-lock")) {
        armado = false;
        return;
      }
      armado = t.clientX >= window.innerWidth - BORDE_PX;
      x0 = t.clientX;
      y0 = t.clientY;
    };

    const mover = (e: TouchEvent) => {
      if (!armado) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - x0;
      const dy = Math.abs(t.clientY - y0);
      if (dy > MAX_DY) {
        armado = false; // se fue en vertical: es scroll
        return;
      }
      if (dx <= -MIN_DX) {
        armado = false;
        onOpen();
      }
    };

    const terminar = () => {
      armado = false;
    };

    window.addEventListener("touchstart", empezar, { passive: true });
    window.addEventListener("touchmove", mover, { passive: true });
    window.addEventListener("touchend", terminar, { passive: true });
    window.addEventListener("touchcancel", terminar, { passive: true });
    return () => {
      window.removeEventListener("touchstart", empezar);
      window.removeEventListener("touchmove", mover);
      window.removeEventListener("touchend", terminar);
      window.removeEventListener("touchcancel", terminar);
    };
  }, [onOpen, activo]);
}

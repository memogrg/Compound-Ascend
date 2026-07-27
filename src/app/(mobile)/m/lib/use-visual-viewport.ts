"use client";

import { useEffect, useState } from "react";

/**
 * Alto (px) del viewport VISIBLE — el que queda por encima del teclado.
 *
 * Va de la mano del scroll-lock endurecido: una vez que el documento NO se desplaza al
 * abrir el teclado, la hoja `position: fixed; inset: 0` seguiría anclada al fondo del layout
 * viewport, que queda DEBAJO del teclado — y el input, tapado. Ajustando el alto de la hoja
 * al `visualViewport.height` (el área realmente visible) el contenido queda por encima del
 * teclado sin mover el documento.
 *
 * Devuelve `null` cuando la API no existe o no hay hoja abierta (`active=false`): en ese caso
 * la hoja usa su altura de siempre (`100dvh` vía CSS), sin cambio de comportamiento. Así
 * Android y los navegadores sin visualViewport no se ven afectados.
 */
export function useVisualViewportHeight(active: boolean): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!active || typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => setHeight(Math.round(vv.height));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      setHeight(null);
    };
  }, [active]);

  return active ? height : null;
}

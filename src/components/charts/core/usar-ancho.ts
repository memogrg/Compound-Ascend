"use client";

/**
 * El ancho REAL de un elemento, en píxeles, siguiéndolo mientras cambia.
 *
 * Existe para poder calcular el ancho de barra en vez de recortarlo. `maxBarSize` recorta
 * DESPUÉS de colocar: Recharts calcula el ancho a partir de la banda, coloca las barras con
 * ese ancho y luego encoge cada una al máximo, así que el sobrante se queda como hueco — a
 * 1280 los 2 px prometidos se volvían 9. Sabiendo el ancho del contenedor se puede pedir el
 * `barSize` exacto que deja el hueco que se quiere.
 */
import { useEffect, useRef, useState } from "react";

export function usarAncho<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // `ResizeObserver` y no un `resize` de ventana: el contenedor cambia también cuando se
    // abre la tabla o se colapsa la barra lateral, sin que la ventana se mueva.
    const ro = new ResizeObserver(([e]) => {
      const w = e?.contentRect.width ?? 0;
      setAncho((prev) => (Math.abs(prev - w) > 0.5 ? w : prev));
    });
    ro.observe(el);
    setAncho(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  return [ref, ancho];
}

/**
 * Ancho de barra que deja EXACTAMENTE `hueco` px entre las barras de un grupo, sin pasar de
 * `maximo`.
 *
 * `anchoTrazado` es el ancho del área de dibujo (sin el eje Y), `categorias` los grupos y
 * `porGrupo` las barras de cada uno. Devuelve 0 cuando todavía no se midió: ahí conviene
 * dejar que Recharts decida en vez de pintar barras de 0.
 */
export function anchoDeBarra(
  anchoTrazado: number,
  categorias: number,
  porGrupo: number,
  { hueco = 2, maximo = 24, huecoCategoria = 0.28 } = {},
): number {
  if (!(anchoTrazado > 0) || categorias < 1 || porGrupo < 1) return 0;
  const banda = anchoTrazado / categorias;
  const grupo = banda * (1 - huecoCategoria);
  const disponible = (grupo - hueco * (porGrupo - 1)) / porGrupo;
  return Math.max(1, Math.min(maximo, Math.floor(disponible)));
}

"use client";

import type { ReactNode } from "react";

/**
 * Los dos estados que una cifra puede tener además de «hay un número»: todavía no llegó, o no
 * se pudo calcular. Y la regla que los gobierna: **el marco no se mueve**.
 *
 * Lo aprendimos midiendo. Dos capturas de la MISMA compilación daban `/mi-rich-life` con
 * 2196 px y 2102 px, y la diferencia era que en una las donas habían montado y en la otra
 * seguían siendo su esqueleto — que es MÁS ALTO que el contenido real. Un esqueleto de otro
 * tamaño no es un detalle estético: mueve toda la página cuando llega el dato, y encima hace
 * que dos corridas idénticas no se puedan comparar.
 *
 * Por eso estos dos estados se dibujan DENTRO del mismo contenedor y con el mismo alto que
 * ocupa la cifra: lo que cambia es lo que hay dentro, nunca la caja.
 */

/** Barra gris del ancho de una cifra. `aria-hidden`: quien usa lector ya oyó «cargando». */
export function EsqueletoCifra({ ancho = "62%" }: { ancho?: string }) {
  return <span className="skel kpi-esqueleto" aria-hidden="true" style={{ width: ancho }} />;
}

/**
 * Envoltura de estado para una cifra.
 *
 * `cargando` gana sobre `error`: si los dos llegan juntos es que el reintento ya está en
 * curso, y mostrar el error de la vuelta anterior sería contar algo viejo.
 */
export function EstadoCifra({
  cargando,
  error,
  anchoEsqueleto,
  children,
}: {
  cargando?: boolean;
  error?: string;
  anchoEsqueleto?: string;
  children: ReactNode;
}): ReactNode {
  if (cargando) {
    return (
      <>
        <span className="sr-only">Cargando…</span>
        <EsqueletoCifra ancho={anchoEsqueleto} />
      </>
    );
  }
  if (error) {
    // `role="status"` y no `alert`: que un número no se pueda calcular no interrumpe nada, y
    // un alert secuestraría el foco del lector por cada tarjeta de un tablero.
    return (
      <span className="kpi-error" role="status">
        {error}
      </span>
    );
  }
  return children;
}

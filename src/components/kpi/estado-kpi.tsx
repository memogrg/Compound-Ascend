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

/**
 * El velo: el contenido REAL, invisible, con una barra gris encima.
 *
 * Tres intentos costó llegar acá, y los tres fallaron por lo mismo. Una barra de `1em` dentro
 * del párrafo de la cifra dejaba la tarjeta 45 px más baja; reservando además el sitio del delta
 * y la sparkline bajó a 22; afinando esos dos, a 13 — porque la cifra tiene una caja de línea
 * que `1em` no reproduce. **Toda medida escrita a mano para imitar a otra se separa de ella.**
 * La única versión estable es no imitar nada: se pinta lo de siempre, se esconde, y el esqueleto
 * va encima. El alto es el mismo por construcción, no por coincidencia.
 */
function Velo({ children }: { children: ReactNode }) {
  // Sin caja propia: el velo va ABSOLUTO —el `<p>` de la cifra es su contexto— y el contenido
  // queda envuelto en un `span` inline que no altera la caja de línea. El primer intento usó un
  // `inline-flex` y la tarjeta salió 4 px MÁS ALTA que con datos: el envoltorio mismo era el
  // que movía el marco. Un contenedor que se añade para no mover nada tiene que no ser nada.
  return (
    <>
      <span className="skel kpi-contexto-velo" aria-hidden="true" />
      <span className="kpi-velado" aria-hidden="true">
        {children}
      </span>
    </>
  );
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
  children,
}: {
  cargando?: boolean;
  error?: string;
  children: ReactNode;
}): ReactNode {
  if (cargando) {
    return (
      <>
        <span className="sr-only">Cargando…</span>
        <Velo>{children}</Velo>
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

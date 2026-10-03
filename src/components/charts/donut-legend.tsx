"use client";

/**
 * La dona con su leyenda, en un solo sitio.
 *
 * Había cinco copias de la misma leyenda —panel, gastos, patrimonio, crecimiento y
 * portafolio— y las cinco arrastraban los mismos defectos:
 *
 * 1. **Los nombres se truncaban.** `text-overflow: ellipsis` con `white-space: nowrap`, así
 *    que «Mantenimiento del vehículo» salía «Mantenimiento d…». Un nombre cortado no se puede
 *    emparejar con su color, que es lo único para lo que existe una leyenda. Ahora envuelve:
 *    dos renglones son más baratos que perder la palabra.
 * 2. **La leyenda se quedaba al lado por muy estrecha que fuera la tarjeta.** El `flexWrap` la
 *    bajaba solo cuando ya no cabía nada, y en el tramo intermedio quedaba una columna de
 *    texto de 90 px con una palabra por línea. Por debajo de 420 px de CONTENEDOR la leyenda
 *    va debajo y se lleva el ancho entero.
 * 3. **No había porcentaje.** El monto responde «cuánto»; la dona pregunta «qué parte». El %
 *    se reparte por mayor resto, así que la columna suma exactamente 100 y no 99 o 101.
 *
 * El corte usa una CONSULTA DE CONTENEDOR y no una medición en JavaScript: lo que decide es el
 * ancho de la tarjeta, no el de la ventana —la misma tarjeta va en `cols-2` en `/gastos` y a
 * pantalla completa en `/m`—, y sin JS no hay un primer render con el reparto equivocado que
 * se vería como un parpadeo de la leyenda saltando de abajo al lado.
 *
 * **La dona dibuja exactamente las filas de la leyenda**, ni una más. En modo `lista` eso
 * significa que las categorías que no caben entran al anillo como UNA porción «Otras N», no
 * como veinte astillas de dos grados que además tendrían que repetir color. «Ver todas»
 * despliega el detalle en la LEYENDA; el anillo no cambia, porque veinte porciones no se
 * pueden leer por muchas veces que se dibujen.
 */
import { DonutChart, type DonutDatum } from "./donut-chart";
import { LeyendaDona } from "./core/leyenda-dona-lista";
import { filasLeyenda, type ModoLeyenda } from "./core/leyenda-dona";

export type { DonutDatum };

export function DonutConLeyenda({
  data,
  currency,
  size,
  centerLabel,
  centerSub,
  modo = "taxonomia",
  vacio,
}: {
  data: readonly DonutDatum[];
  currency: string;
  size?: number;
  centerLabel?: string;
  centerSub?: string;
  /**
   * `taxonomia` (defecto): bloques fijos, todos, en el orden canónico que da quien llama.
   * `lista`: categorías, ordenadas por monto, las seis mayores más «Otras N».
   */
  modo?: ModoLeyenda;
  /** Qué decir cuando no hay nada que repartir. */
  vacio: string;
}) {
  const { filas, ocultas } = filasLeyenda(data, { modo });

  return (
    <div className="dl">
      <div className="dl-caja">
        {/* El anillo dibuja LAS FILAS y no los datos crudos: así cada porción tiene su renglón
            en la leyenda y su propio color, sin repetir ninguno. */}
        <DonutChart
          data={filas.map((f) => ({ name: f.name, value: f.value, color: f.color }))}
          size={size}
          centerLabel={centerLabel}
          centerSub={centerSub}
        />
        {filas.length === 0 ? (
          <span className="dl-vacio muted">{vacio}</span>
        ) : (
          <LeyendaDona filas={filas} ocultas={ocultas} moneda={currency} />
        )}
      </div>
    </div>
  );
}

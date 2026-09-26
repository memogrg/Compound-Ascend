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
 * 2. **La leyenda se quedaba al lado por muy estrecha que fuera la tarjeta.** El `flexWrap`
 *    la bajaba solo cuando ya no cabía nada, y en el tramo intermedio quedaba una columna de
 *    texto de 90 px con una palabra por línea. Por debajo de 420 px de CONTENEDOR la leyenda
 *    va debajo y se lleva el ancho entero.
 * 3. **No había porcentaje.** El monto responde «cuánto»; la dona pregunta «qué parte». El %
 *    se reparte por mayor resto, así que la columna suma exactamente 100 y no 99 o 101.
 *
 * El corte usa una CONSULTA DE CONTENEDOR y no una medición en JavaScript: lo que decide es
 * el ancho de la tarjeta, no el de la ventana —la misma tarjeta va en `cols-2` en `/gastos` y
 * a pantalla completa en `/m`—, y sin JS no hay un primer render con el reparto equivocado
 * que se vería como un parpadeo de la leyenda saltando de abajo al lado.
 */
import { formatMoney } from "@/lib/format";

import { DonutChart, type DonutDatum } from "./donut-chart";
import { filasLeyenda } from "./core/leyenda-dona";

export type { DonutDatum };

export function DonutConLeyenda({
  data,
  currency,
  size,
  centerLabel,
  centerSub,
  maxFilas,
  vacio,
}: {
  data: readonly DonutDatum[];
  currency: string;
  size?: number;
  centerLabel?: string;
  centerSub?: string;
  /** Cuántas filas mostrar. El resto se agrupa en «Otras N», con su monto y su porcentaje. */
  maxFilas?: number;
  /** Qué decir cuando no hay nada que repartir. */
  vacio: string;
}) {
  // La dona dibuja TODAS las porciones aunque la leyenda muestre unas pocas: recortar el
  // anillo cambiaría el total del centro.
  const filas = filasLeyenda(data, { maxFilas });

  return (
    <div className="dl">
      <div className="dl-caja">
        <DonutChart data={[...data]} size={size} centerLabel={centerLabel} centerSub={centerSub} />
        {filas.length === 0 ? (
          <span className="dl-vacio muted">{vacio}</span>
        ) : (
          <ul className="dl-lista">
            {filas.map((f) => (
              <li className={f.resto ? "dl-fila dl-fila-resto" : "dl-fila"} key={f.name}>
                <span
                  className="dl-punto"
                  // La fila del sobrante NO lleva color: sus porciones sí están en la dona,
                  // cada una con el suyo, así que un punto de un color inventado apuntaría a
                  // un sector que no existe. Va un contorno punteado, que dice «esto es un
                  // grupo, no una porción».
                  style={f.resto ? undefined : { background: f.color }}
                  aria-hidden="true"
                />
                <span className="dl-nombre">{f.name}</span>
                <span className="dl-pct tnum">{f.pct} %</span>
                <span className="dl-monto tnum">{formatMoney(f.value, currency)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

"use client";

import type { EstadoSerie } from "./use-serie-activa";
import { esVisible } from "./use-serie-activa";
import type { SerieDef } from "./theme";

/**
 * Leyenda interactiva: una lista de botones, uno por serie.
 *
 * Es `<button aria-pressed>` y no un `<div onClick>` porque apagar una serie **es** un
 * interruptor: se llega con Tab, se activa con Espacio o Enter y el lector anuncia su estado
 * sin que haya que explicárselo. Eso no se consigue con un div y un `role`.
 *
 * El swatch refleja la MARCA de la serie: rectángulo para área y barras, línea para líneas
 * (discontinua si la serie lo es). Un cuadrado para todo obliga a mirar el gráfico para
 * saber cuál es cuál, que es justo lo que la leyenda debería ahorrar.
 *
 * El texto nunca va coloreado — mismo motivo que en el tooltip: esos colores no están
 * calibrados para texto pequeño sobre el fondo de la tarjeta.
 *
 * Con una sola serie no se pinta: una leyenda de un elemento no distingue nada.
 */
export function Legend({
  series,
  estado,
  onActivar,
  onDesactivar,
  onAlternar,
}: {
  series: readonly SerieDef[];
  estado: EstadoSerie;
  onActivar: (clave: string) => void;
  onDesactivar: () => void;
  onAlternar: (clave: string) => void;
}) {
  if (series.length < 2) return null;

  return (
    <ul className="cf-leyenda">
      {series.map((s) => {
        const visible = esVisible(estado, s.clave);
        return (
          <li key={s.clave}>
            <button
              type="button"
              className="cf-leyenda-btn"
              // `aria-pressed` describe si la serie está ENCENDIDA, que es lo que el botón
              // controla. El resaltado por hover es transitorio y no se anuncia.
              aria-pressed={visible}
              data-oculta={visible ? undefined : ""}
              onClick={() => onAlternar(s.clave)}
              onMouseEnter={() => onActivar(s.clave)}
              onMouseLeave={onDesactivar}
              onFocus={() => onActivar(s.clave)}
              onBlur={onDesactivar}
            >
              <span
                className={`cf-swatch cf-swatch-${s.marca === "linea" ? "linea" : "bloque"}`}
                // El guion de la leyenda repite el de la serie: si la proyección se dibuja
                // discontinua, su swatch también. La máscara vive en el CSS.
                style={{ background: s.color }}
                data-guion={s.guion ? "" : undefined}
                aria-hidden="true"
              />
              {s.etiqueta}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

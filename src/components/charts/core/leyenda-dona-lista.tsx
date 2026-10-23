"use client";

/**
 * La LISTA de la leyenda de una dona: las filas más el desplegable de «Otras N».
 *
 * Vive aparte de `DonutConLeyenda` porque ahora tiene dos consumidores: la tarjeta vieja, que se
 * reparte el ancho con su propio `.dl-caja`, y el marco del núcleo, que la recibe por el slot
 * `leyenda` y la coloca él. Si cada uno pintara su lista, dos tarjetas de la misma app dirían los
 * mismos datos con dos maquetaciones distintas — y la segunda copia se enteraría tarde de cada
 * arreglo de la primera.
 *
 * El `verTodas` es estado de vista y vive acá: el desplegable cambia la LEYENDA y no el anillo,
 * porque veinte porciones no se pueden leer por muchas veces que se dibujen.
 */
import { useState } from "react";

import { formatMoney } from "@/lib/format";

import type { FilaDona, ResultadoLeyenda } from "./leyenda-dona";

function Fila({ f, moneda, oculta }: { f: FilaDona; moneda: string; oculta?: boolean }) {
  const clase = oculta ? "dl-fila dl-fila-oculta" : f.resto ? "dl-fila dl-fila-resto" : "dl-fila";
  return (
    <li className={clase}>
      <span
        className="dl-punto"
        // Ni la fila del sobrante ni las que hay dentro llevan color: el sobrante es UNA porción
        // gris del anillo, y sus componentes no están dibujadas por separado. Un punto de color
        // apuntaría a un sector que no existe.
        style={f.resto || oculta ? undefined : { background: f.color }}
        aria-hidden="true"
      />
      <span className="dl-nombre">{f.name}</span>
      <span className="dl-pct tnum">{f.pct} %</span>
      <span className="dl-monto tnum">{formatMoney(f.value, moneda)}</span>
    </li>
  );
}

export function LeyendaDona({
  filas,
  ocultas,
  moneda,
}: ResultadoLeyenda & {
  moneda: string;
}) {
  const [verTodas, setVerTodas] = useState(false);
  if (filas.length === 0) return null;

  return (
    <div className="dl-lado">
      <ul className="dl-lista">
        {filas.map((f) => (
          <Fila key={f.name} f={f} moneda={moneda} />
        ))}
        {verTodas ? ocultas.map((f) => <Fila key={f.name} f={f} moneda={moneda} oculta />) : null}
      </ul>
      {ocultas.length > 0 ? (
        <button
          type="button"
          className="dl-vertodas"
          aria-expanded={verTodas}
          onClick={() => setVerTodas((v) => !v)}
        >
          {verTodas ? "Ver menos" : `Ver todas (${ocultas.length} más)`}
        </button>
      ) : null}
    </div>
  );
}

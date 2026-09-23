"use client";

import { formatMoney } from "@/lib/format";

import type { SerieDef } from "./theme";

/**
 * El contenido del tooltip, para pasarlo al `<Tooltip content={…}>` de Recharts.
 *
 * Jerarquía deliberada: **el valor es lo fuerte** (tabular, grande) y el nombre de la serie
 * va detrás, pequeño y en `--muted`. Quien mira un tooltip busca el número; el nombre solo
 * hace falta cuando hay más de una serie.
 *
 * Dos reglas que parecen detalles y no lo son:
 *
 *  - **El texto nunca lleva el color de la serie.** Los colores de serie están calibrados
 *    contra el fondo del gráfico, no contra el de un tooltip, y varios bajan de 4.5:1 ahí.
 *    La serie se identifica con un TRAZO de 2 px de su color —la misma marca que dibuja— y
 *    el texto va siempre en `--text` / `--muted`.
 *  - **Los nombres se insertan como texto de React**, nunca como HTML. Un comercio puede
 *    llamarse `<img onerror=…>`: es dato del usuario, y acá se pinta tal cual sin
 *    interpretarlo.
 */
export type PayloadTooltip = {
  dataKey?: string | number;
  value?: number | string;
  payload?: Record<string, unknown>;
};

export function ChartTooltip({
  active,
  payload,
  label,
  series,
  formato = formatMoney,
  moneda = "CRC",
}: {
  active?: boolean;
  payload?: readonly PayloadTooltip[];
  label?: string | number;
  series: readonly SerieDef[];
  /** Una sola función de valor para todo el gráfico. Ver `accesible.ts`. */
  formato?: (valor: number, moneda: string) => string;
  moneda?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;

  // Una fila por serie presente en ese X, en el orden de declaración de las series y no en
  // el que Recharts entrega el payload, que cambia con el orden de pintado.
  const filas = series.flatMap((s) => {
    const p = payload.find((x) => String(x.dataKey) === s.clave);
    if (!p || typeof p.value !== "number" || !Number.isFinite(p.value)) return [];
    return [{ serie: s, valor: p.value }];
  });
  if (filas.length === 0) return null;

  return (
    <div className="cf-tip" role="presentation">
      {label !== undefined ? <div className="cf-tip-x">{String(label)}</div> : null}
      <ul className="cf-tip-lista">
        {filas.map(({ serie, valor }) => (
          <li key={serie.clave} className="cf-tip-fila">
            <span className="cf-tip-trazo" style={{ background: serie.color }} aria-hidden="true" />
            <span className="cf-tip-valor">{formato(valor, moneda)}</span>
            {series.length > 1 ? <span className="cf-tip-serie">{serie.etiqueta}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

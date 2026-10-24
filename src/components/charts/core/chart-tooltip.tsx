"use client";

import { useEffect } from "react";

import { formatMoney } from "@/lib/format";

import { describirPunto } from "./accesible";
import { deltaComparacion, filasTooltip, tonoDelta, type FilaTooltip } from "./tooltip-datos";
import { formatoEjeX, type SerieDef } from "./theme";

/**
 * El contenido del tooltip, para pasarlo al `<Tooltip content={…}>` de Recharts.
 *
 * Jerarquía deliberada: **el valor es lo fuerte** (tabular, grande), el nombre de la serie va
 * detrás en `--muted`, y debajo el delta vs comparación si la serie lo trae.
 *
 * Tres reglas que parecen detalles y no lo son:
 *
 *  - **El texto de la serie nunca lleva su color.** Los colores de serie están calibrados
 *    contra el fondo del gráfico, no contra el de un tooltip, y varios bajan de 4.5:1 ahí. La
 *    serie se identifica con un TRAZO de 2 px de su color — la misma marca que dibuja.
 *  - **El delta sí se colorea, pero nunca solo por el color.** El signo (+/−) va delante
 *    siempre: es el canal no cromático que hace la información legible sin distinguir rojo de
 *    verde (WCAG 1.4.1). Y el tono depende de `sentidoBueno` de la serie, no del signo: en
 *    gastos, subir es malo.
 *  - **Los nombres se insertan como texto de React**, nunca como HTML. Un comercio puede
 *    llamarse `<img onerror=…>`: es dato del usuario, y acá se pinta tal cual.
 */
export type PayloadTooltip = {
  dataKey?: string | number;
  value?: number | string;
  payload?: Record<string, unknown>;
};

/** Cuántas filas caben antes de que el tooltip deje de leerse de un vistazo. */
const MAX_FILAS = 4;

export function ChartTooltip({
  active,
  payload,
  label,
  series,
  moneda = "CRC",
  /** Sufijo de la clave que lleva el valor de comparación. `real` → `real_comparar`. */
  sufijoComparacion = "_comparar",
  activeIndex,
  onPunto,
}: {
  active?: boolean;
  payload?: readonly PayloadTooltip[];
  label?: string | number;
  series: readonly SerieDef[];
  moneda?: string;
  sufijoComparacion?: string;
  /** Lo inyecta Recharts. Llega como CADENA («"4"»), no como número. */
  activeIndex?: string | number | null;
  /**
   * Notifica el punto activo —texto e índice— para el `aria-live` del marco y para que
   * Enter pueda fijar lo que el teclado está señalando.
   *
   * Sale de acá y no de un handler del chart porque este componente es el único que ve el
   * punto con ratón Y con teclado: `accessibilityLayer` mueve el índice sin disparar ningún
   * evento de ratón, así que un `onMouseMove` se perdería justo el caso que importa.
   */
  onPunto?: (texto: string | null, indice: number | null) => void;
}) {
  const hayDatos = Boolean(active && payload && payload.length > 0);

  const fmt = (v: number) => formatMoney(v, moneda);
  // El punto crudo: de ahí salen la comparación y la nota, que no son series dibujadas.
  const punto = payload?.[0]?.payload ?? {};
  const nota = typeof punto["nota"] === "string" ? punto["nota"] : null;

  // Una fila por serie presente en ese X, en el orden de DECLARACIÓN y no en el que Recharts
  // entrega el payload, que cambia con el orden de pintado.
  const todas: FilaTooltip[] = !hayDatos
    ? []
    : series.flatMap((s) => {
        const p = payload!.find((x) => String(x.dataKey) === s.clave);
        if (!p || typeof p.value !== "number" || !Number.isFinite(p.value)) return [];
        const comparar = punto[`${s.clave}${sufijoComparacion}`];
        return [
          {
            serie: s,
            valor: p.value,
            comparar: typeof comparar === "number" ? comparar : null,
          },
        ];
      });

  const { filas, omitidas } = filasTooltip(todas, MAX_FILAS);

  // El anuncio se emite como EFECTO: llamar al callback durante el render actualizaría el
  // estado del padre mientras este componente se pinta, que es el bucle clásico de React.
  const textoAnuncio =
    filas.length > 0
      ? describirPunto(
          formatoEjeX(label),
          filas.map((f) => ({ etiqueta: f.serie.etiqueta, valor: fmt(f.valor) })),
        )
      : null;
  const indice = Number(activeIndex);
  const indiceNum = Number.isInteger(indice) && indice >= 0 ? indice : null;
  useEffect(() => {
    onPunto?.(textoAnuncio, indiceNum);
  }, [onPunto, textoAnuncio, indiceNum]);

  if (!hayDatos || filas.length === 0) return null;

  return (
    <div className="cf-tip" role="presentation">
      {label !== undefined ? <div className="cf-tip-x">{formatoEjeX(label)}</div> : null}
      <ul className="cf-tip-lista">
        {filas.map(({ serie, valor, comparar }) => {
          const delta = deltaComparacion(valor, comparar, fmt);
          return (
            <li key={serie.clave} className="cf-tip-fila">
              <span
                className="cf-tip-trazo"
                style={{ background: serie.color }}
                aria-hidden="true"
              />
              <span className="cf-tip-cuerpo">
                <span className="cf-tip-linea">
                  <span className="cf-tip-valor">{fmt(valor)}</span>
                  {series.length > 1 ? (
                    <span className="cf-tip-serie">{serie.etiqueta}</span>
                  ) : null}
                </span>
                {delta.direccion !== null ? (
                  <span
                    className="cf-tip-delta"
                    data-tono={tonoDelta(delta.direccion, serie.sentidoBueno)}
                  >
                    {delta.texto}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
      {omitidas > 0 ? <div className="cf-tip-mas">+{omitidas} más</div> : null}
      {nota ? <div className="cf-tip-nota">{nota}</div> : null}
    </div>
  );
}

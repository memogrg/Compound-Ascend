import type { CSSProperties, ReactNode } from "react";

import { TONE_TEXT, type MTone } from "./tone";

/** Grilla de métricas (2 columnas por defecto). Las celdas encogen: nunca hay scroll lateral. */
export function MMetricGrid({
  children,
  cols = 2,
  style,
}: {
  children: ReactNode;
  cols?: 2 | 3;
  style?: CSSProperties;
}) {
  return (
    <div
      className="m-mgrid"
      style={cols === 2 ? style : { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, ...style }}
    >
      {children}
    </div>
  );
}

/**
 * Métrica: etiqueta + número (Space Mono tabular, color semántico) en UNA sola línea,
 * con un `sub` opcional que da la unidad o el contexto del número ("del ingreso",
 * "₡14 000/día"): sin él la cifra queda sin escala.
 *
 * La celda es estrecha (~106px útiles a 320px): pasa SIEMPRE los importes por mAmount()
 * con un umbral corto, o se truncarán con elipsis — y un número cortado se malinterpreta.
 */
export function MMetricCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: MTone;
}) {
  return (
    <div className="m-met">
      <div className="m-met-k">{label}</div>
      <div className={`mono m-met-v ${TONE_TEXT[tone]}`}>{value}</div>
      {sub ? <div className="m-met-s">{sub}</div> : null}
    </div>
  );
}

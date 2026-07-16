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
 * Métrica: etiqueta + número (Space Mono tabular, color semántico) en UNA sola línea.
 * Pasa el valor con mAmount() para que un importe largo se abrevie en vez de cortarse.
 */
export function MMetricCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  tone?: MTone;
}) {
  return (
    <div className="m-met">
      <div className="m-met-k">{label}</div>
      <div className={`mono m-met-v ${TONE_TEXT[tone]}`}>{value}</div>
    </div>
  );
}

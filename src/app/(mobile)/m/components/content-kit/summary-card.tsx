import type { CSSProperties, ReactNode } from "react";

import { TONE_TEXT, type MTone } from "./tone";

/**
 * Tarjeta de RESUMEN de una pantalla: eyebrow (mono tracked) + número grande (Space Mono
 * tabular, color semántico) + subtexto + slot opcional (barra de progreso, gráfico, chips).
 *
 * `value` recibe el importe ya formateado: pásalo por mAmount(n, currency, 11), que da el
 * número exacto mientras quepa en una línea a 320px y lo abrevia después. .m-sum-v recorta
 * con elipsis como última red, pero un importe cortado ("₡12,345,67…") se malinterpreta:
 * el formateo correcto es cosa del caller, no de la red de seguridad.
 */
export function MSummaryCard({
  eyebrow,
  value,
  tone = "neutral",
  chip,
  sub,
  slot,
  style,
}: {
  eyebrow: string;
  value: ReactNode;
  tone?: MTone;
  /** Chip a la derecha del eyebrow (p. ej. <MChip tone="warning">86%</MChip>). */
  chip?: ReactNode;
  sub?: ReactNode;
  /** Contenido bajo el número: barra de progreso, gráfico, chips… */
  slot?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className="m-sum" style={style}>
      <div className="between">
        <span className="ov">{eyebrow}</span>
        {chip ?? null}
      </div>
      <div className={`mono m-sum-v ${TONE_TEXT[tone]}`}>{value}</div>
      {sub ? <div className="m-sum-sub">{sub}</div> : null}
      {slot ? <div className="m-sum-slot">{slot}</div> : null}
    </div>
  );
}

import { TONE_FILL, type MTone } from "./tone";

/**
 * Barra de progreso en tono semántico (reutiliza .bar/.bar>i). Existe para que el color
 * "por nivel" se decida en un solo sitio en vez de repetir el style inline en cada card.
 * `value` es 0..1 y se recorta: una barra nunca se desborda aunque el dato sí.
 */
export function MProgress({
  value,
  tone = "success",
  height = 7,
}: {
  value: number;
  tone?: MTone;
  height?: number;
}) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="bar" style={{ height }}>
      <i style={{ width: `${pct}%`, background: TONE_FILL[tone] }} />
    </div>
  );
}

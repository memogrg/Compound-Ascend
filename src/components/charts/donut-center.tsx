import type { CSSProperties } from "react";

/**
 * Contenido central de una dona/anillo con auto-fit: el número o la etiqueta
 * SIEMPRE cabe dentro del hueco interior del aro y nunca lo toca. Puro
 * (sin medir el DOM → SSR-safe): el tamaño de fuente se deriva del largo del
 * texto y del diámetro del hueco (`inner`, en px), con padding respecto al aro.
 *
 * - `mode="number"`: una línea, se recorta con ellipsis si hiciera falta.
 * - `mode="label"`: hasta 2 líneas (line-clamp) con ellipsis; fuente más chica.
 *
 * Fuente única para TODAS las donas (composición, arquetipos, etc.).
 */
export function DonutCenter({
  value,
  sub,
  inner,
  mode = "number",
  valueClassName,
  subClassName,
}: {
  value: string;
  sub?: string;
  /** Diámetro del hueco interior del aro, en px. */
  inner: number;
  mode?: "number" | "label";
  valueClassName?: string;
  subClassName?: string;
}) {
  const usable = inner * 0.82; // ancho aprovechable dentro del hueco
  const len = Math.max(1, value.length);
  const charW = 0.6; // ancho medio de carácter en em (fuente display)

  const fontSize =
    mode === "number"
      ? Math.max(12, Math.min(20, usable / (len * charW)))
      : Math.max(10.5, Math.min(15, usable / (Math.max(1, Math.ceil(len / 2)) * charW)));

  const valueStyle: CSSProperties =
    mode === "number"
      ? { fontSize, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }
      : {
          fontSize,
          lineHeight: 1.15,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        };

  return (
    <div style={{ maxWidth: usable, textAlign: "center" }}>
      <div className={valueClassName} style={valueStyle}>
        {value}
      </div>
      {sub ? <div className={subClassName}>{sub}</div> : null}
    </div>
  );
}

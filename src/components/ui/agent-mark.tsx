import type { CSSProperties } from "react";

/**
 * Isotipo "C+" de CARTERA+ — símbolo único de My Agent C+ (la IA) en toda la
 * app. Fuente de verdad: design-handoff/.../uploads/isotipo-mono-*.svg (arco =
 * "C", cruz = "+"). Se dibuja con `currentColor` para heredar el color del
 * contenedor y adaptarse solo a tema claro/oscuro.
 *
 * Mismo contrato de tamaño que <Icon/> (width/height = 1em): las reglas CSS
 * existentes (.spark svg, .ava svg, etc.) lo dimensionan sin cambios, así que
 * es un reemplazo directo del antiguo <Icon name="spark" />.
 */
export function AgentMark({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 120 120"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* Arco: la "C" de CARTERA (círculo abierto por la derecha). */}
      <path d="M98.06 42.25 A42 42 0 1 0 98.06 77.75" strokeWidth={9} />
      {/* Cruz: el "+". */}
      <path d="M87.5 49.5 V70.5 M77 60 H98" strokeWidth={8} />
    </svg>
  );
}

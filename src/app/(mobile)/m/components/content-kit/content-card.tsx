import type { CSSProperties, ReactNode } from "react";

/**
 * Tarjeta de contenido: superficie clara + sombra suave, radio 16, sin marco duro.
 * Es el contenedor por defecto de un bloque de contenido (un frasco, una lista).
 * El resumen de pantalla usa MSummaryCard (radio 22); el cristal es solo para chrome.
 *
 * Tocable = <div role="button"> y no <button>: la tarjeta lleva contenido estructurado
 * (filas, barras, enlaces), que dentro de un <button> sería HTML inválido. Da siempre un
 * `ariaLabel`: sin él, el lector de pantalla leería la tarjeta entera como nombre.
 */
export function MContentCard({
  children,
  onClick,
  ariaLabel,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  ariaLabel?: string;
  style?: CSSProperties;
}) {
  if (!onClick) {
    return (
      <div className="m-cc" style={style}>
        {children}
      </div>
    );
  }
  return (
    <div
      className="m-cc"
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      onClick={onClick}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          onClick();
        }
      }}
      style={{ cursor: "pointer", ...style }}
    >
      {children}
    </div>
  );
}

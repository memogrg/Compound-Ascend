"use client";

import type { ReactNode } from "react";

import { HelpTip } from "@/components/shared/help-tip";

/**
 * La cabecera de una sección: eyebrow, título, ayuda y toolbar.
 *
 * Reemplaza a las 23 variantes de tarjeta del audit (§17) con una sola pieza. La **ayuda va
 * en un tooltip, nunca en un párrafo bajo el título**: es la regla del proyecto, y es lo que
 * impide que cada sección crezca un renglón explicativo que nadie lee dos veces.
 *
 * Se usa `HelpTip` y no el `data-tip` de `tooltip-layer.tsx`: los dos posicionan con
 * @floating-ui, pero solo `HelpTip` pone `role="tooltip"` con `aria-describedby` y abre con
 * el foco del teclado (`useFocus`), que es lo que el encargo pide. El singleton `data-tip`
 * sigue siendo el camino para adornar texto existente.
 *
 * El nivel del encabezado es un PARÁMETRO, no una decisión de esta pieza: dentro de una
 * página el orden de `h2`/`h3` lo manda la jerarquía del documento, y una primitiva que
 * fijara `h2` rompería el esquema en cuanto la sección viviera dentro de otra.
 */
export function SectionHeader({
  titulo,
  nivel = 2,
  eyebrow,
  ayuda,
  toolbar,
}: {
  titulo: string;
  nivel?: 2 | 3;
  /** Rótulo pequeño encima del título. */
  eyebrow?: string;
  /** Texto del tooltip «?». Si falta, no se pinta el botón. */
  ayuda?: ReactNode;
  toolbar?: ReactNode;
}) {
  const H = nivel === 3 ? "h3" : "h2";

  return (
    <div className="lec-cab">
      <div className="lec-cab-txt">
        {eyebrow ? <p className="lec-eyebrow">{eyebrow}</p> : null}
        <H className="lec-titulo">
          {titulo}
          {ayuda ? (
            <span className="lec-ayuda">
              <HelpTip text={ayuda} label={`Qué significa: ${titulo}`} />
            </span>
          ) : null}
        </H>
      </div>
      {toolbar ? <div className="lec-toolbar">{toolbar}</div> : null}
    </div>
  );
}

import Link from "next/link";

import { MChip } from "../content-kit";

/**
 * Ficha «Tu próxima mejor acción» del Inicio móvil. Va ARRIBA del carrusel, no dentro: las
 * nueve fichas del carrusel responden "cómo estoy"; ésta responde "qué hago", que es una
 * pregunta distinta y la única que la persona puede contestar hoy.
 *
 * Un solo botón. La decisión de marcarla hecha / posponerla / descartarla vive en
 * /m/mis-acciones, donde además está el porqué — ofrecer tres botones acá obligaría a decidir
 * sin la explicación al lado.
 */
export function ProximaAccionFicha({
  title,
  impact,
  kindLabel,
}: {
  title: string;
  /** Etiqueta ya formateada del impacto (con su moneda). */
  impact: string;
  kindLabel: string;
}) {
  return (
    <div className="m-nba">
      <div className="between">
        <span className="ov">Tu próxima mejor acción</span>
        <MChip tone="success">{kindLabel}</MChip>
      </div>
      <div className="m-nba-t">{title}</div>
      <div className="m-nba-i mono">{impact}</div>
      <Link href="/m/mis-acciones" className="m-btn m-btn-primary m-nba-a">
        Ver mis acciones
      </Link>
    </div>
  );
}

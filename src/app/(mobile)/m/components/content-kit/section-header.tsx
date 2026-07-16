import type { ReactNode } from "react";

/**
 * Encabezado de sección: eyebrow (mono tracked, apagado) + acción opcional a la derecha.
 * Es deliberadamente discreto — en el contenido mandan los números, no los títulos.
 */
export function MSectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="m-sec">
      <span className="ov">{title}</span>
      {action ?? null}
    </div>
  );
}

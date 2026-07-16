import Link from "next/link";

import { MIcon, type MIconName } from "../m-icon";

/**
 * Estado vacío: icono grande + qué es esto + CTA en verbo. El texto dice qué GANAS al
 * llenarlo, no "aún no hay nada": un vacío es el primer paso, no un error.
 */
export function MEmptyState({
  icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: {
  icon: MIconName;
  title: string;
  description?: string;
  /** Etiqueta del CTA (verbo: "Registrar gasto", "Crear sobre"). */
  actionLabel?: string;
  /** Navegación (server-safe) — excluyente con onAction. */
  actionHref?: string;
  onAction?: () => void;
}) {
  return (
    <div className="m-empty">
      <div className="m-empty-ic" aria-hidden>
        <MIcon name={icon} size={26} />
      </div>
      <div className="m-empty-t">{title}</div>
      {description ? <div className="m-empty-d">{description}</div> : null}
      {actionLabel && actionHref ? (
        <Link href={actionHref} className="m-btn m-btn-primary m-empty-a">
          {actionLabel}
        </Link>
      ) : null}
      {actionLabel && !actionHref && onAction ? (
        <button type="button" className="m-btn m-btn-primary m-empty-a" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";

import { MIcon, type MIconName } from "../m-icon";
import { TONE_TEXT, type MTone } from "./tone";

/**
 * Fila de datos: tile de icono (MIcon, tinte de marca sobre neutro) + título + subtítulo
 * + valor (Space Mono, color semántico). Separadores de pelo entre filas; objetivo táctil
 * ≥44px. Se renderiza como <a> (href), <button> (onClick) o <div> (solo lectura).
 *
 * `icon` es opcional: las filas que ya viven dentro de una tarjeta con su propio icono
 * (p. ej. los sobres de un frasco) se leen mejor sin repetirlo.
 * `trailing` va después del valor (acciones); no lo combines con `chevron`, y si la fila
 * es <button> no metas botones dentro (HTML inválido) — déjala como <div>.
 * `dense` es para listas de solo lectura dentro de una tarjeta: el alto normal (44px de
 * objetivo táctil) no hace falta si la fila no se toca, y en una lista larga se come la
 * pantalla. No la uses en filas con href/onClick.
 */
export function MDataRow({
  icon,
  iconTone = "neutral",
  title,
  subtitle,
  value,
  valueTone = "neutral",
  trailing,
  chevron,
  slot,
  dense,
  href,
  onClick,
  ariaLabel,
}: {
  icon?: MIconName;
  iconTone?: MTone;
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  valueTone?: MTone;
  /** Acciones a la derecha del valor (solo en filas no clicables). */
  trailing?: ReactNode;
  chevron?: boolean;
  /** Contenido bajo la fila (p. ej. <MProgress/>). */
  slot?: ReactNode;
  /** Compacta la fila (solo lectura dentro de una tarjeta). */
  dense?: boolean;
  href?: string;
  onClick?: () => void;
  ariaLabel?: string;
}) {
  const body = (
    <>
      {icon ? (
        <span className={`m-dic${iconTone === "neutral" ? "" : ` m-dic-${iconTone}`}`} aria-hidden>
          <MIcon name={icon} size={19} />
        </span>
      ) : null}
      <span className="m-dtx">
        <span className="m-dt" style={{ display: "block" }}>
          {title}
        </span>
        {subtitle ? (
          <span className="m-ds" style={{ display: "block" }}>
            {subtitle}
          </span>
        ) : null}
      </span>
      {value != null ? <span className={`mono m-dv ${TONE_TEXT[valueTone]}`}>{value}</span> : null}
      {trailing ?? null}
      {chevron ? (
        <svg
          className="m-dch"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      ) : null}
    </>
  );

  // Con slot, la fila se apila (fila + contenido debajo) manteniendo el separador arriba.
  const wrap = (inner: ReactNode) =>
    slot ? (
      <span style={{ display: "block", width: "100%" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 12, width: "100%" }}>{inner}</span>
        <span className="m-drow-slot" style={{ display: "block" }}>
          {slot}
        </span>
      </span>
    ) : (
      inner
    );

  const content = wrap(body);
  const cls = `m-drow${dense ? " m-drow-dense" : ""}`;

  if (href) {
    return (
      <Link href={href} className={cls} aria-label={ariaLabel}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} aria-label={ariaLabel}>
        {content}
      </button>
    );
  }
  return <div className={cls}>{content}</div>;
}

import Link from "next/link";
import type { ReactNode } from "react";

import { MIcon, type MIconName } from "../m-icon";

/**
 * CHASIS de las tarjetas del carrusel de Inicio. Las 7 comparten esta estructura y
 * solo cambian de contenido — igual que el content-kit del barrido R3, donde el
 * sistema existía antes que las instancias.
 *
 * Anatomía (Parte 2 de la especificación):
 *   eyebrow · cifra protagonista + chip · subtexto · visual · mensaje corto
 *
 * ALTURA FIJA (.m-hcard, 216px). No es un detalle estético: si una tarjeta creciera
 * con su contenido, el carrusel daría un salto al deslizar hasta ella. Por eso el
 * subtexto va a una línea con elipsis y el mensaje a dos como máximo: el contenido
 * se adapta a la caja, no al revés.
 *
 * Toda la tarjeta es un enlace a su módulo. El carrusel cancela el "click" cuando el
 * dedo se ha desplazado (ver home-carousel), así que arrastrar no navega.
 */
export function MHomeCard({
  eyebrow,
  value,
  chip,
  sub,
  slot,
  message,
  href,
  ariaLabel,
}: {
  eyebrow: string;
  /** Cifra protagonista, ya formateada por quien llama (mAmount / formatCompact). */
  value: ReactNode;
  /** Estado a la derecha del eyebrow (MChip). */
  chip?: ReactNode;
  sub?: ReactNode;
  /** Visual del dominio: donut, barra, lo que toque. */
  slot?: ReactNode;
  /** Una frase, humana y accionable. */
  message?: ReactNode;
  href: string;
  ariaLabel?: string;
}) {
  return (
    <Link href={href} className="m-hcard" aria-label={ariaLabel}>
      <div className="m-hcard-top">
        <span className="ov">{eyebrow}</span>
        {chip ?? null}
      </div>
      <div className="m-hcard-val">{value}</div>
      {sub ? <div className="m-hcard-sub">{sub}</div> : null}
      <div className="m-hcard-slot">{slot ?? null}</div>
      {message ? <div className="m-hcard-msg">{message}</div> : null}
    </Link>
  );
}

/**
 * Estado vacío con el MISMO esqueleto: misma altura, mismo borde, mismo ritmo. Una
 * tarjeta sin datos no puede parecer una tarjeta rota, así que en vez de números
 * dice qué ganas al llenarla y ofrece el verbo para hacerlo.
 */
export function MHomeCardEmpty({
  eyebrow,
  icon,
  title,
  cta,
  href,
}: {
  eyebrow: string;
  icon: MIconName;
  title: string;
  /** Verbo: "Define tu presupuesto", no "Presupuesto". */
  cta: string;
  href: string;
}) {
  return (
    <Link href={href} className="m-hcard" aria-label={cta}>
      <div className="m-hcard-top">
        <span className="ov">{eyebrow}</span>
      </div>
      <div className="m-hcard-slot" style={{ flexDirection: "column", gap: 10, margin: 0 }}>
        <span className="m-dic" aria-hidden>
          <MIcon name={icon} size={20} />
        </span>
        <span style={{ fontSize: 13, textAlign: "center", lineHeight: 1.4, maxWidth: "88%" }}>
          {title}
        </span>
      </div>
      <div className="m-hcard-msg" style={{ color: "var(--accent)", fontWeight: 600 }}>
        {cta}
      </div>
    </Link>
  );
}

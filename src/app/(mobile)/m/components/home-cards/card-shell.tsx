import Link from "next/link";
import type { ReactNode } from "react";

import { MIcon, type MIconName } from "../m-icon";
import { MHomeCardRetry } from "./card-retry";

/**
 * CHASIS de las tarjetas del carrusel de Inicio. Las 7 comparten esta estructura y
 * solo cambian de contenido — igual que el content-kit del barrido R3, donde el
 * sistema existía antes que las instancias.
 *
 * Anatomía, A DOS COLUMNAS:
 *
 *   ┌──────────────────────────────────────┐
 *   │ EYEBROW                    [chip]    │
 *   │  ₡1.840.697            ◯ 52%         │  ← cifra izquierda · visual derecha
 *   │  subtexto                            │
 *   │  mensaje corto                       │
 *   └──────────────────────────────────────┘
 *
 * Apilar el visual entre la cifra y el mensaje dejaba dos bandas vacías y una silueta
 * cuadrada de 240px. Con el visual a la derecha, alineado con la cifra, la tarjeta
 * baja a 168 sin perder nada.
 *
 * ALTURA FIJA (.m-hcard, 168px). No es un detalle estético: si una tarjeta creciera
 * con su contenido, el carrusel daría un salto al deslizar hasta ella. Por eso cada
 * parte tiene altura estable —eyebrow y subtexto a una línea con elipsis, mensaje a
 * una— y el visual no se encoge: el contenido se adapta a la caja, no al revés.
 *
 * TODA tarjeta debe poner algo en `vis`. Si una lo deja vacío deja de parecerse a sus
 * hermanas, que es justo lo que pasaba con Patrimonio.
 *
 * Toda la tarjeta es un enlace a su módulo. El carrusel cancela el "click" cuando el
 * dedo se ha desplazado (ver home-carousel), así que arrastrar no navega.
 */
export function MHomeCard({
  eyebrow,
  value,
  chip,
  sub,
  vis,
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
  /** Visual del dominio a la derecha: donut, barra, lo que toque. Obligatorio en la
   *  práctica — una tarjeta sin él rompe la paridad con las demás. */
  vis?: ReactNode;
  /** Una frase que aporte lo que la cifra NO dice. Repetir el importe que ya está
   *  arriba en grande gasta la única línea disponible sin informar de nada. */
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
      <div className="m-hcard-body">
        <div className="m-hcard-figs">
          <div className="m-hcard-val">{value}</div>
          {sub ? <div className="m-hcard-sub">{sub}</div> : null}
        </div>
        <div className="m-hcard-vis">{vis ?? null}</div>
      </div>
      {message ? <div className="m-hcard-msg">{message}</div> : null}
    </Link>
  );
}

/**
 * Estado "NO CARGÓ", distinto del estado vacío.
 *
 * El techo de tiempo del panel hace que un resumen lento llegue como `null`, igual que
 * si el usuario no tuviera nada registrado. Pintar ahí "Registra tu patrimonio" a quien
 * ya tiene cientos de millones no es una cifra falsa, pero es una mentira igual: colapsa
 * dos estados que el usuario vive de forma opuesta. Uno se arregla registrando datos; el
 * otro, reintentando.
 *
 * Es un <button>, no un <Link>: el destino no es otra pantalla sino volver a pedir ESTA.
 */
export function MHomeCardError({ eyebrow, icon }: { eyebrow: string; icon: MIconName }) {
  return (
    <div className="m-hcard">
      <div className="m-hcard-top">
        <span className="ov">{eyebrow}</span>
      </div>
      <div
        className="m-hcard-body"
        style={{ flexDirection: "column", gap: 8, justifyContent: "center" }}
      >
        <span className="m-dic" aria-hidden>
          <MIcon name={icon} size={20} />
        </span>
        <span style={{ fontSize: 13, textAlign: "center", lineHeight: 1.4, maxWidth: "88%" }}>
          No pudimos cargar este dato ahora.
        </span>
      </div>
      <MHomeCardRetry />
    </div>
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
      <div className="m-hcard-body" style={{ flexDirection: "column", gap: 8, justifyContent: "center" }}>
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

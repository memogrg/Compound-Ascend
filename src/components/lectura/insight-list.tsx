"use client";

import Link from "next/link";

import { Icon, type IconName } from "@/components/ui/icon";

import {
  LECTURA_SEVERIDAD,
  TONO_SEVERIDAD,
  type InsightItem,
  type InsightSeverity,
} from "./insight-item";

/**
 * De uno a tres hallazgos. Determinísticos, con su cifra y un enlace a dónde verlo.
 *
 * El tope de tres no es estética: una lista de señales que crece es una lista que se deja
 * de leer. Si hay más, es que falta priorizarlas antes de pintarlas.
 *
 * **Nunca alarmista**: `accionar` va en advertencia, no en rojo (ver `TONO_SEVERIDAD`). El
 * rojo se reserva para lo que ya salió mal, y una señal es justamente lo contrario: algo
 * que todavía se puede atender.
 *
 * **El color nunca va solo**: cada fila lleva ícono y un texto `sr-only` con la severidad
 * en palabras (WCAG 1.4.1).
 */
const ICONO: Record<InsightSeverity, IconName> = {
  celebrar: "check",
  accionar: "bell",
  observar: "info",
  info: "info",
};

export function InsightList({
  items,
  max = 3,
  onDescartar,
  vacio = "Nada que señalar en este período.",
}: {
  items: readonly InsightItem[];
  max?: number;
  /** Si viene, cada fila lleva un botón «Descartar». */
  onDescartar?: (id: string) => void;
  vacio?: string;
}) {
  const visibles = items.slice(0, max);

  if (visibles.length === 0) {
    return (
      <p className="lec-vacio">
        <Icon name="check" width={2.2} />
        {vacio}
      </p>
    );
  }

  return (
    <ul className="lec-senales">
      {visibles.map((it) => (
        <li key={it.id} className="lec-senal" data-tono={TONO_SEVERIDAD[it.severidad]}>
          <span className="lec-senal-ic" aria-hidden="true">
            <Icon name={ICONO[it.severidad]} width={2.2} />
          </span>

          <div className="lec-senal-txt">
            <p className="lec-senal-t">
              <span className="sr-only">{LECTURA_SEVERIDAD[it.severidad]}: </span>
              {it.titulo}
              {it.cifra ? <span className="lec-senal-cifra tnum">{it.cifra}</span> : null}
            </p>
            <p className="lec-senal-causa">{it.causa}</p>
            {/* El enlace y «Descartar» son HERMANOS, nunca uno dentro del otro: anidar
                controles es la violación `nested-interactive` que ya arrastra la tabla de
                transacciones, y no se repite acá. */}
            {it.evidencia ? (
              <Link className="lec-senal-ev" href={it.evidencia.href}>
                {it.evidencia.etiqueta}
                <span className="lec-flecha" aria-hidden="true">
                  →
                </span>
              </Link>
            ) : null}
          </div>

          {onDescartar ? (
            <button
              type="button"
              className="lec-senal-x"
              aria-label={`Descartar: ${it.titulo}`}
              onClick={() => onDescartar(it.id)}
            >
              <Icon name="x" width={2.2} />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

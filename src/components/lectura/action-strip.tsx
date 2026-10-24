"use client";

import Link from "next/link";

import { Icon } from "@/components/ui/icon";

import type { ActionStripData } from "./action-item";

/**
 * Qué hacer, en una franja: la acción del dominio, el asesor y el hogar único de acciones.
 *
 * **Bloqueada = sin botón.** Si la acción no se puede hacer todavía, se explica por qué y no
 * se pinta ningún control: ofrecer un botón que no hace nada es peor que no ofrecerlo — la
 * misma regla que ya aplica `action-card.tsx`, heredada en vez de reinventada.
 *
 * La pregunta al asesor viaja por `?consulta=`, que `/asistente` ya sabe leer: deja el texto
 * ESCRITO en el campo sin enviarlo, para que la persona lo lea, lo edite y decida. No se
 * inventó un parámetro nuevo para esto.
 */
export function ActionStrip({ principal, bloqueada, asesor }: ActionStripData) {
  return (
    <div className="lec-acciones">
      {bloqueada ? (
        <p className="lec-bloqueada">
          <Icon name="lock" width={2.2} />
          <span>{bloqueada.motivo}</span>
        </p>
      ) : (
        <Link className="btn btn-primary lec-btn" href={principal.href}>
          {principal.etiqueta}
        </Link>
      )}

      {principal.impacto && !bloqueada ? (
        <span className="lec-impacto">{principal.impacto}</span>
      ) : null}

      <span className="lec-sep" aria-hidden="true" />

      {asesor ? (
        <Link
          className="btn btn-ghost lec-btn"
          href={`/asistente?consulta=${encodeURIComponent(asesor.pregunta)}`}
        >
          Preguntar al asesor
        </Link>
      ) : null}

      {/* El hogar único: todo lo que se puede hacer vive en una sola pantalla. */}
      <Link className="lec-todas" href="/mis-acciones">
        Ver todas
      </Link>
    </div>
  );
}

"use client";

/**
 * Error de cualquier pantalla bajo /m. Antes lo atendía app/error.tsx, que se pinta
 * FUERA de `.m-shell`: dentro del WebView aparecía una pantalla de escritorio, sin la
 * piel del móvil y sin salida hacia /m. Rechazo 2.1 de la App Store.
 *
 * Vive en m/ y no en (app)/ a propósito: así cubre también /m/login, /m/signup y el
 * asistente, que están fuera del grupo autenticado.
 *
 * Reporta a Sentry con el mismo import y la misma forma que app/global-error.tsx
 * (inerte sin DSN). Lo que NO hace es mostrar `error.message` ni `error.digest`: son
 * texto interno, a veces con datos de la consulta que falló, y a quien tiene la app
 * abierta no le sirven de nada.
 */
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";

import { MobileHeader } from "./components/mobile-header";
import { MEmptyState } from "./components/content-kit";

export default function MobileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="m-scroll">
      <div className="m-pad">
        <MobileHeader variant="inner" title="Algo salió mal" />
        <MEmptyState
          icon="none"
          title="No pudimos cargar esta pantalla"
          description="Tus datos están a salvo. Probá de nuevo o volvé al inicio."
          actionLabel="Reintentar"
          onAction={reset}
        />
        <Link href="/m" className="m-btn m-btn-secondary m-btn-block">
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}

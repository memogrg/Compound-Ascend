"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { aceptarTerminosAction } from "@/lib/legal/actions";

/**
 * Barra de re-aceptación para cuentas que existen desde antes del registro, o para
 * cuando `LEGAL_VERSION` cambie.
 *
 * Barra inferior y NO un modal bloqueante, a propósito: quien ya tiene cuenta y sus
 * datos adentro no puede quedar encerrado por un aviso legal. Puede seguir usando la
 * app, exportar o borrar su cuenta; lo que el aviso hace es no dejar que la aceptación
 * pase inadvertida. Un muro aquí sería usar sus datos como palanca.
 *
 * No se decide acá si hay que mostrarla: eso lo resuelve el servidor comparando contra
 * `LEGAL_VERSION`, así que el día que la versión suba la barra reaparece sola, sin
 * tocar este archivo.
 */
export function AceptarTerminosBanner() {
  const [oculto, setOculto] = useState(false);
  const [error, setError] = useState(false);
  const [pendiente, empezar] = useTransition();

  if (oculto) return null;

  const aceptar = () => {
    setError(false);
    empezar(async () => {
      const r = await aceptarTerminosAction();
      // Se oculta de inmediato al confirmar: el servidor ya revalidó, pero esperar al
      // repintado dejaría la barra un instante después del clic y parecería no haber
      // funcionado.
      if (r.ok) setOculto(true);
      else setError(true);
    });
  };

  return (
    <div
      role="region"
      aria-label="Aceptación de términos"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 60,
        background: "var(--surface, #fff)",
        borderTop: "1px solid var(--border, #d8d4c7)",
        boxShadow: "0 -8px 24px -12px rgba(0,0,0,0.25)",
        padding: `14px 16px calc(env(safe-area-inset-bottom) + 14px)`,
      }}
    >
      <div
        style={{
          maxWidth: 820,
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 12,
        }}
      >
        <p style={{ flex: "1 1 260px", margin: 0, fontSize: 13.5, lineHeight: 1.5 }}>
          Actualizamos nuestros <Link href="/terminos">Términos y condiciones</Link> y la{" "}
          <Link href="/privacidad">Política de privacidad</Link>. Revisalos y confirmá que estás de
          acuerdo para seguir usando tu cuenta.
          {error ? (
            <span role="alert" style={{ display: "block", color: "var(--neg, #c34f4b)" }}>
              No pudimos guardar tu aceptación. Intentá de nuevo.
            </span>
          ) : null}
        </p>
        <button
          type="button"
          onClick={aceptar}
          disabled={pendiente}
          style={{
            minHeight: 44,
            padding: "0 22px",
            borderRadius: 12,
            border: 0,
            background: "#378451",
            color: "#fff",
            fontWeight: 600,
            fontSize: 15,
            cursor: pendiente ? "default" : "pointer",
            opacity: pendiente ? 0.7 : 1,
          }}
        >
          {pendiente ? "Guardando…" : "Aceptar"}
        </button>
      </div>
    </div>
  );
}

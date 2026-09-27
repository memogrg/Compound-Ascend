"use client";

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
 *
 * **Todo el aspecto vive en CSS** (`.legal-accept-*` en `shell.css`), ni un estilo en línea.
 * No es limpieza: un valor en línea le gana a cualquier hoja, y con `bottom: 0` incrustado
 * no había forma de subir la barra por encima de la navegación inferior en móvil. Anclada
 * abajo del todo tapaba los cinco enlaces enteros —y eso contradice su propio motivo de
 * existir: es una barra y no un modal justamente para que nadie quede encerrado por un aviso.
 *
 * El copy tampoco promete un bloqueo que no existe. Decía «confirmá que estás de acuerdo para
 * seguir usando tu cuenta», y eso es falso: la cuenta sigue funcionando sin aceptar. Ahora
 * enuncia el hecho y ofrece las dos salidas —leer o aceptar—, con los documentos en
 * pestaña nueva para que leerlos no interrumpa lo que la persona estaba haciendo.
 *
 * **Dos enlaces y no tres.** Había un tercero, «Revisar», y llevaba a `/terminos`: anunciaba
 * los dos documentos y abría uno. Son dos páginas separadas y no existe ninguna que las
 * contenga, así que la única versión honesta de «revisar» son los dos enlaces que ya están en
 * la frase —uno por documento—, y el tercero se fue. Cualquier enlace nuevo que prometa ambos
 * necesita antes una página que de verdad los contenga.
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
    <div role="region" aria-label="Aceptación de términos" className="legal-accept-bar">
      <div className="legal-accept-caja">
        <p className="legal-accept-texto">
          Actualizamos los{" "}
          <a href="/terminos" target="_blank" rel="noopener noreferrer">
            Términos
          </a>{" "}
          y la{" "}
          <a href="/privacidad" target="_blank" rel="noopener noreferrer">
            Política de privacidad
          </a>
          {error ? (
            <span role="alert" className="legal-accept-error">
              No pudimos guardar tu aceptación. Intentá de nuevo.
            </span>
          ) : null}
        </p>
        <button type="button" onClick={aceptar} disabled={pendiente} className="legal-accept-btn">
          {pendiente ? "Guardando…" : "Aceptar"}
        </button>
      </div>
    </div>
  );
}

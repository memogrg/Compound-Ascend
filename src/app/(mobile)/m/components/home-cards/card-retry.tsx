"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Botón de reintento de la tarjeta que no cargó.
 *
 * `router.refresh()` vuelve a pedir el render del servidor sin recargar la app entera ni
 * perder el estado del carrusel: la tarjeta que falló se rehace en su sitio y el usuario
 * no pierde la posición del deslizamiento. Es cliente porque no hay forma de reintentar
 * desde el servidor sin navegar a otra ruta, y navegar sería justo lo contrario de lo
 * que la tarjeta necesita.
 */
export function MHomeCardRetry() {
  const router = useRouter();
  const [pidiendo, setPidiendo] = useState(false);

  return (
    <button
      type="button"
      className="m-hcard-retry"
      disabled={pidiendo}
      onClick={() => {
        setPidiendo(true);
        router.refresh();
        // Se libera aunque el refresh no resuelva: dejarlo bloqueado para siempre sería
        // peor que permitir un segundo intento.
        setTimeout(() => setPidiendo(false), 2500);
      }}
    >
      {pidiendo ? "Reintentando…" : "Reintentar"}
    </button>
  );
}

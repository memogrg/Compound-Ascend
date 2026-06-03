"use client";

/**
 * UI de error para boundaries de ruta (error.tsx). Muestra el ErrorState
 * compartido con botón de reintento (reset re-ejecuta el render del segmento).
 * Pensado para fallos transitorios del servidor (p. ej. Supabase intermitente).
 */
import { useEffect } from "react";
import { ErrorState } from "@/components/shared/states";
import { logger } from "@/lib/logger";

export function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Diagnóstico sin filtrar datos sensibles (solo el mensaje / digest).
    logger.error("route error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="grid">
      <ErrorState
        title="No pudimos cargar esta sección"
        description="Puede ser una conexión intermitente. Reintenta en un momento; si sigue, vuelve más tarde."
        onRetry={reset}
      />
    </div>
  );
}

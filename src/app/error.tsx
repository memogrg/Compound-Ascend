"use client";

/**
 * Error Boundary de ruta. No muestra detalles internos al usuario.
 */
import { useEffect } from "react";
import { ErrorState } from "@/components/shared/states";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // El detalle ya se registra en el servidor; aquí solo dejamos rastro mínimo.
    console.error("[route-error]", error.digest ?? "");
  }, [error]);

  return (
    <div style={{ padding: 24 }}>
      <ErrorState onRetry={reset} />
    </div>
  );
}

"use client";

/** Abre el portal de Stripe: tarjeta, facturas y cancelación. */
import { useState, useTransition } from "react";
import { abrirFacturacionAction } from "@/modules/account/api/subscription-actions";

export function FacturacionButton() {
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={pendiente}
        onClick={() =>
          empezar(async () => {
            setError(null);
            const r = await abrirFacturacionAction();
            if (r.ok && r.url) window.location.href = r.url;
            else setError(r.message ?? "No pudimos abrir la facturación.");
          })
        }
      >
        {pendiente ? "Abriendo…" : "Facturación y método de pago"}
      </button>
      {error ? (
        <p style={{ fontSize: 12.5, margin: "8px 0 0", color: "var(--neg)" }}>{error}</p>
      ) : null}
    </div>
  );
}

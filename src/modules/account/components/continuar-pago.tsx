"use client";

/**
 * «Continuá al pago» — el remate del flujo que empieza en la landing.
 *
 * Cuando alguien eligió un plan allá afuera, no tiene que volver a elegirlo
 * acá: llega con el plan puesto y un solo botón. Las tres tarjetas siguen
 * abajo por si cambia de idea, pero ya no son una decisión pendiente.
 */
import { useState, useTransition } from "react";
import { PLAN_LABEL, PLAN_PRICE_USD, TRIAL_DAYS, type PaidPlan } from "@/lib/plan";
import { elegirPlanAction } from "@/modules/account/api/subscription-actions";

export function ContinuarPago({ plan }: { plan: PaidPlan }) {
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="card card-pad elegido">
      <div>
        <span className="ov">TU ELECCIÓN</span>
        <h2 style={{ margin: "6px 0 2px", fontSize: 22 }}>{PLAN_LABEL[plan]}</h2>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          ${PLAN_PRICE_USD[plan]} al mes · {TRIAL_DAYS} días sin cobro · Cancelás cuando querás
        </p>
      </div>
      <div>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          disabled={pendiente}
          onClick={() =>
            empezar(async () => {
              setError(null);
              const r = await elegirPlanAction(plan);
              if (r.ok && r.url) window.location.href = r.url;
              else setError(r.message ?? "No pudimos abrir el pago. Intentá de nuevo.");
            })
          }
        >
          {pendiente ? "Abriendo el pago…" : "Continuar al pago"}
        </button>
        {error ? (
          <p style={{ fontSize: 12.5, margin: "8px 0 0", color: "var(--neg)" }}>{error}</p>
        ) : null}
      </div>
    </div>
  );
}

"use client";

/**
 * Las tres tarjetas de plan.
 *
 * El medidor de tres tramos es el mismo recurso de la landing: en tres segundos
 * se entiende por qué el precio sube, sin leer quince viñetas. Lo que diferencia
 * los planes es el NIVEL DE ACOMPAÑAMIENTO, no una lista de casillas.
 *
 * Reglas de texto que no se rompen: nunca «ilimitado» (no está confirmado que no
 * haya tope) y nunca «tokens» (lenguaje técnico interno).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  PAID_PLANS,
  PLAN_LABEL,
  PLAN_PRICE_USD,
  PLAN_PROMISE,
  PLAN_BENEFITS,
  AGENT_LEVEL,
  PLAN_RANK,
  type PaidPlan,
  type Plan,
} from "@/lib/plan";
import { elegirPlanAction } from "@/modules/account/api/subscription-actions";

export function PlanesPicker({ actual }: { actual: Plan }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const [nota, setNota] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [eligiendo, setEligiendo] = useState<PaidPlan | null>(null);

  const elegir = (plan: PaidPlan) => {
    setNota(null);
    setError(null);
    setEligiendo(plan);
    empezar(async () => {
      const r = await elegirPlanAction(plan);
      setEligiendo(null);
      if (!r.ok) {
        setError(r.message ?? "No pudimos completar el cambio.");
        return;
      }
      // Subida o alta: Stripe. Bajada: no hay URL, solo el aviso de cuándo entra.
      if (r.url) {
        window.location.href = r.url;
        return;
      }
      setNota(r.message ?? "Listo.");
      // Sin esto, la tarjeta de arriba sigue mostrando el estado viejo y el
      // cambio programado no aparece hasta que la persona recarga a mano.
      router.refresh();
    });
  };

  return (
    <div>
      <div className="planes-grid">
        {PAID_PLANS.map((plan) => {
          const esActual = plan === actual;
          const baja = PLAN_RANK[plan] < PLAN_RANK[actual];
          const agente = AGENT_LEVEL[plan];
          return (
            <div key={plan} className={`card card-pad plan-card${esActual ? " es-actual" : ""}`}>
              {plan === "pro" ? <span className="plan-badge">LA EXPERIENCIA COMPLETA</span> : null}

              <h3 style={{ margin: "0 0 4px" }}>{PLAN_LABEL[plan]}</h3>
              <p className="muted" style={{ fontSize: 13.5, margin: "0 0 14px" }}>
                {PLAN_PROMISE[plan]}
              </p>

              <p style={{ fontSize: 30, fontWeight: 700, margin: "0 0 2px" }}>
                ${PLAN_PRICE_USD[plan]}
                <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>
                  {" "}
                  / mes
                </span>
              </p>
              {/* El renglón va siempre, aunque solo Max+ lo llene: así los tres
                  paneles de My Agent C+ arrancan a la misma altura. */}
              <p className="plan-nota">{plan === "max" ? "Solo $13 más que Pro+" : " "}</p>

              {/* El bloque que de verdad diferencia. */}
              <div className="agente-nivel">
                <span className="ov">MY AGENT C+</span>
                <strong style={{ display: "block", fontSize: 14.5, margin: "4px 0 2px" }}>
                  {agente.nivel}
                </strong>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {agente.detalle}
                </span>
                <div className="medidor3" aria-hidden="true">
                  {[1, 2, 3].map((t) => (
                    <span key={t} className={t <= agente.tramos ? "on" : ""} />
                  ))}
                </div>
              </div>

              <ul className="plan-ben">
                {PLAN_BENEFITS[plan].map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>

              <button
                type="button"
                className={`btn ${plan === "pro" ? "btn-primary" : "btn-ghost"}`}
                disabled={esActual || pendiente}
                onClick={() => elegir(plan)}
                style={{ marginTop: "auto" }}
              >
                {esActual
                  ? "Tu plan actual"
                  : eligiendo === plan
                    ? "Abriendo…"
                    : baja
                      ? `Bajar a ${PLAN_LABEL[plan]}`
                      : `Pasar a ${PLAN_LABEL[plan]}`}
              </button>
            </div>
          );
        })}
      </div>

      {nota ? <p style={{ marginTop: 14, color: "var(--pos)", fontSize: 13.5 }}>{nota}</p> : null}
      {error ? <p style={{ marginTop: 14, color: "var(--neg)", fontSize: 13.5 }}>{error}</p> : null}

      <p className="muted" style={{ fontSize: 12.5, marginTop: 18, lineHeight: 1.6 }}>
        Al subir de plan, el cambio entra de una y se cobra la diferencia. Al bajar, seguís con tu
        plan actual hasta que venza el mes que ya pagaste — y ahí entra el nuevo.
      </p>
    </div>
  );
}

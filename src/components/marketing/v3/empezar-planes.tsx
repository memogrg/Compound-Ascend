import {
  PAID_PLANS,
  PERIODOS,
  PLAN_LABEL,
  PLAN_PRICE_USD,
  PLAN_PROMISE,
  type PaidPlan,
  type Periodo,
} from "@/lib/plan";

const NOMBRE_PERIODO: Record<Periodo, string> = { mensual: "Mensual", anual: "Anual" };
const POR: Record<Periodo, string> = { mensual: "/mes", anual: "/año" };

/**
 * El período y el plan de /empezar, como radios estilizados. Lo comparten el alta y el modo
 * «reanudar». Sin JS: cada precio se pinta en los dos períodos y el CSS `:has()` muestra el
 * del período marcado (`emp-por-mensual` / `emp-por-anual`).
 */
export function PeriodoYPlanes({ plan, periodo }: { plan: PaidPlan; periodo: Periodo }) {
  return (
    <>
      <div className="emp-periodo" role="radiogroup" aria-label="Período de pago">
        {PERIODOS.map((p) => (
          <label key={p} className="emp-periodo-op">
            <input type="radio" name="periodo" value={p} defaultChecked={p === periodo} />
            <span>{NOMBRE_PERIODO[p]}</span>
          </label>
        ))}
      </div>
      <div className="emp-planes" role="radiogroup" aria-label="Plan">
        {PAID_PLANS.map((p) => (
          <label key={p} className="emp-plan">
            <input type="radio" name="plan" value={p} defaultChecked={p === plan} />
            <span className="emp-plan-cuerpo">
              <span className="emp-plan-nombre">{PLAN_LABEL[p]}</span>
              <span className="emp-plan-precio">
                {PERIODOS.map((per) => (
                  <span key={per} className={`emp-por-${per}`}>
                    ${PLAN_PRICE_USD[p][per]}
                    <small>{POR[per]}</small>
                  </span>
                ))}
              </span>
              <span className="emp-plan-promesa">{PLAN_PROMISE[p]}</span>
            </span>
          </label>
        ))}
      </div>
    </>
  );
}

/** El monto del primer cobro: el del plan y el período marcados, también por `:has()`. */
export function PrecioPrimerCobro() {
  return (
    <>
      {PAID_PLANS.map((p) => (
        <strong key={p} className={`emp-precio-${p}`}>
          {PERIODOS.map((per) => (
            <span key={per} className={`emp-por-${per}`}>
              ${PLAN_PRICE_USD[p][per]}
              {per === "anual" ? " por el año" : null}
            </span>
          ))}
        </strong>
      ))}
    </>
  );
}

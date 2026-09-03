import { reanudarPagoAction, signOutAction } from "@/lib/auth/actions";
import { PAID_PLANS, PLAN_LABEL, PLAN_PRICE_USD, PLAN_PROMISE, type PaidPlan } from "@/lib/plan";

/**
 * Modo «reanudar» de /empezar: la cuenta existe, falta pagar.
 *
 * Lo único que viaja es el plan elegido, y /empezar/pagar sigue siendo la única
 * puerta hacia Stripe. Va como acción del servidor y no como <form method="get">
 * por la CSP (`form-action 'self'` bloquea la redirección del envío hacia
 * checkout.stripe.com; ver reanudarPagoAction). El correo se muestra pero no se
 * edita: si no es la cuenta correcta, «Usar otra cuenta» cierra sesión y vuelve acá.
 */
export function ReanudarPago({
  plan,
  email,
  errorPago,
  yaUsoPrueba,
}: {
  plan: PaidPlan;
  email: string;
  errorPago: boolean;
  yaUsoPrueba: boolean;
}) {
  return (
    <form action={reanudarPagoAction} className="emp-form">
      <div className="emp-cols">
        <div className="emp-cuenta">
          {errorPago ? (
            <p className="emp-aviso" role="alert">
              No pudimos abrir el pago. Probá de nuevo; si sigue fallando, escribinos.
            </p>
          ) : null}
          <div className="emp-campo">
            <span>Cuenta</span>
            <output className="emp-fijo">{email}</output>
          </div>
          <button type="submit" className="lp-btn btn-green btn-lg emp-enviar">
            {yaUsoPrueba ? "Reactivar mi acceso" : "Reanudar el pago seguro"}
          </button>
          <p className="fine emp-fine">
            Te lleva a Stripe, donde registrás la tarjeta. Nosotros nunca la vemos.
          </p>
        </div>

        <aside className="emp-lado">
          <p className="lp-rotulo">Tu plan</p>
          <div className="emp-planes" role="radiogroup" aria-label="Plan">
            {PAID_PLANS.map((p) => (
              <label key={p} className="emp-plan">
                <input type="radio" name="plan" value={p} defaultChecked={p === plan} />
                <span className="emp-plan-cuerpo">
                  <span className="emp-plan-nombre">{PLAN_LABEL[p]}</span>
                  <span className="emp-plan-precio">
                    ${PLAN_PRICE_USD[p]}
                    <small>/mes</small>
                  </span>
                  <span className="emp-plan-promesa">{PLAN_PROMISE[p]}</span>
                </span>
              </label>
            ))}
          </div>
        </aside>
      </div>
      {/* «Usar otra cuenta» va en SU PROPIO <form> hermano (UsarOtraCuenta):
          es otra acción del servidor y un <form> no puede anidar otro. */}
    </form>
  );
}

export function UsarOtraCuenta({ plan }: { plan: PaidPlan }) {
  const salir = signOutAction.bind(null, `/empezar?plan=${plan}`);
  return (
    <form action={salir} className="fine emp-otra">
      ¿No sos vos?{" "}
      <button type="submit" className="emp-link">
        Usar otra cuenta
      </button>
    </form>
  );
}

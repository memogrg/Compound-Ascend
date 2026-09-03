"use client";

import { useActionState } from "react";
import { empezarAction, signInWithGoogleAction, type ActionState } from "@/lib/auth/actions";
import { PAID_PLANS, PLAN_LABEL, PLAN_PRICE_USD, PLAN_PROMISE, type PaidPlan } from "@/lib/plan";

const inicial: ActionState = { ok: false };

function esPlanDePago(v: string | undefined): v is PaidPlan {
  return typeof v === "string" && (PAID_PLANS as readonly string[]).includes(v);
}

/**
 * El formulario de /empezar. Un solo <form>: correo, contraseña y el plan como
 * radios estilizados dentro de la tarjeta lateral. Sin JS para cambiar de plan —
 * la línea de tiempo de la derecha muestra el precio del plan marcado con CSS
 * `:has()`— y sin campos que no hagan falta antes de pagar.
 */
export function EmpezarForm({
  plan,
  fechaCobro,
  errorPago,
}: {
  plan: PaidPlan;
  fechaCobro: string;
  errorPago: boolean;
}) {
  const [state, action, pending] = useActionState(empezarAction, inicial);
  // Tras un error, lo escrito vuelve (React reinicia el form al terminar la acción).
  const emailPrevio = state.values?.email ?? "";
  const planMarcado: PaidPlan = esPlanDePago(state.values?.plan) ? state.values.plan : plan;

  return (
    <form action={action} className="emp-form" noValidate>
      <div className="emp-cols">
        {/* ── Columna 1: la cuenta ─────────────────────────────────────────── */}
        <div className="emp-cuenta">
          {errorPago ? (
            <p className="emp-aviso" role="alert">
              No pudimos abrir el pago. Tu cuenta quedó creada: probá de nuevo con el botón.
            </p>
          ) : null}
          {state.message ? (
            <p className="emp-aviso" role="alert">
              {state.message}
            </p>
          ) : null}

          <GoogleEnvio />
          <div className="emp-o">o con tu correo</div>

          <label className="emp-campo">
            <span>Correo</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              placeholder="vos@correo.com"
              defaultValue={emailPrevio}
              required
              aria-invalid={state.fieldErrors?.email ? true : undefined}
            />
            {state.fieldErrors?.email ? (
              <em className="emp-err">{state.fieldErrors.email}</em>
            ) : null}
          </label>

          <label className="emp-campo">
            <span>Contraseña</span>
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              placeholder="Al menos 8 caracteres"
              minLength={8}
              required
              aria-invalid={state.fieldErrors?.password ? true : undefined}
            />
            {state.fieldErrors?.password ? (
              <em className="emp-err">{state.fieldErrors.password}</em>
            ) : null}
          </label>

          <button type="submit" className="lp-btn btn-green btn-lg emp-enviar" disabled={pending}>
            {pending ? "Abriendo el pago seguro…" : "Continuar al pago seguro"}
          </button>
          <p className="fine emp-fine">
            Te lleva a Stripe, donde registrás la tarjeta. Nosotros nunca la vemos.
          </p>
        </div>

        {/* ── Columna 2: el plan y la línea de tiempo ─────────────────────── */}
        <aside className="emp-lado">
          <p className="lp-rotulo">Tu plan</p>
          <div className="emp-planes" role="radiogroup" aria-label="Plan">
            {PAID_PLANS.map((p) => (
              <label key={p} className="emp-plan">
                <input type="radio" name="plan" value={p} defaultChecked={p === planMarcado} />
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

          <p className="lp-rotulo emp-rotulo-2">Qué pasa con tu tarjeta</p>
          <ol className="emp-linea">
            <li>
              <b>Hoy</b>
              <span>
                Registrás la tarjeta. Pagás <strong>$0</strong>.
              </span>
            </li>
            <li>
              <b>Día 7</b>
              <span>Te recordamos por correo que la prueba está por terminar.</span>
            </li>
            <li>
              <b>{fechaCobro}</b>
              <span>
                Primer cobro:{" "}
                {PAID_PLANS.map((p) => (
                  <strong key={p} className={`emp-precio-${p}`}>
                    ${PLAN_PRICE_USD[p]}
                  </strong>
                ))}
                . Si cancelás antes, no pagás nada.
              </span>
            </li>
          </ol>
        </aside>
      </div>
    </form>
  );
}

/**
 * Google es OTRA acción del servidor dentro del MISMO <form>: un <form> no
 * puede anidar otro (el navegador descarta el interno y React no logra hidratar
 * —pasó—), así que el botón usa `formAction`. `formNoValidate` para que el
 * `required` del correo y la contraseña no frene a quien entra con Google, y
 * `next` se arma con el plan marcado en ese momento, no con el inicial, para que
 * cambiar de plan y después elegir Google lleve a /empezar/pagar con el correcto.
 */
function GoogleEnvio() {
  const conGoogle = (fd: FormData) => {
    const plan = String(fd.get("plan") ?? "pro");
    fd.set("next", `/empezar/pagar?plan=${plan}`);
    return signInWithGoogleAction(fd);
  };
  return (
    <div className="emp-google">
      <button
        type="submit"
        formAction={conGoogle}
        formNoValidate
        className="lp-btn lp-btn-ghost emp-google-btn"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
          />
        </svg>
        Continuar con Google
      </button>
    </div>
  );
}

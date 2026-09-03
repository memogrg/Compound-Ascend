import "./empezar.css";
import Link from "next/link";
import type { PaidPlan } from "@/lib/plan";
import { EmpezarForm } from "./empezar-form";
import { ReanudarPago, UsarOtraCuenta } from "./empezar-reanudar";

/**
 * /empezar — paso 1 de 3 del flujo de adquisición: cuenta → pago seguro → listo.
 *
 * Es la puerta a la que llevan TODOS los botones de la landing. Antes cada CTA
 * mandaba al login de la aplicación y quien llegaba con ganas de probar se
 * topaba con un formulario de «ya tenés cuenta». Acá se crea la cuenta y se
 * elige el plan en una sola pantalla, y el siguiente clic ya es Stripe.
 *
 * Misma marca, mismos tokens y misma serif de la landing: la persona no debe
 * sentir que salió del sitio. Sin vidrio ni relieve: en una pantalla donde se
 * escribe una contraseña, lo que vende es la claridad.
 *
 * `reanudar` es el modo de quien ya creó la cuenta pero no terminó de pagar
 * (cerró Stripe, expiró la sesión): no se le vuelve a pedir la contraseña, se
 * le muestra el correo y un solo botón hacia /empezar/pagar.
 */
export function Empezar({
  plan,
  fechaCobro,
  errorPago,
  reanudar,
}: {
  plan: PaidPlan;
  fechaCobro: string;
  errorPago: boolean;
  reanudar: { email: string; yaUsoPrueba: boolean } | null;
}) {
  return (
    <div className="lp emp">
      <header className="hdr">
        <div className="wrap hd">
          <Link className="lp-brand" href="/" aria-label="CARTERA+ · volver a la portada">
            <svg className="mark" viewBox="0 0 64 64" fill="none" aria-hidden="true">
              <path
                d="M45 18.5 A 19 19 0 1 0 45 45.5"
                stroke="#1d1d1f"
                strokeWidth="7"
                strokeLinecap="round"
              />
              <path
                d="M46 26 V38 M40 32 H52"
                stroke="#378451"
                strokeWidth="4.6"
                strokeLinecap="round"
              />
            </svg>
            <span className="wm">
              CARTERA<span className="p">+</span>
            </span>
          </Link>
          <nav className="lp-nav">
            {reanudar ? null : (
              <Link href="/login" className="emp-ya">
                ¿Ya tenés cuenta? <b>Iniciar sesión</b>
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="wrap emp-main">
        <ol className="emp-pasos" aria-label="Progreso">
          <li className="activo">
            <i>1</i> Cuenta
          </li>
          <li>
            <i>2</i> Pago seguro
          </li>
          <li>
            <i>3</i> Listo
          </li>
        </ol>

        {reanudar ? (
          <>
            {reanudar.yaUsoPrueba ? (
              <>
                <h1>
                  Volvé a <em>entrar</em>.
                </h1>
                <p className="lead">
                  Tu cuenta y tus datos siguen acá. Elegí el plan y reactivá el acceso: la prueba
                  gratis ya la usaste, así que el primer cobro es hoy.
                </p>
              </>
            ) : (
              <>
                <h1>
                  Te faltó <em>un paso</em>.
                </h1>
                <p className="lead">
                  Tu cuenta ya existe. Solo queda registrar la tarjeta para arrancar los 14 días
                  gratis.
                </p>
              </>
            )}
            <ReanudarPago
              plan={plan}
              email={reanudar.email}
              errorPago={errorPago}
              yaUsoPrueba={reanudar.yaUsoPrueba}
            />
            <UsarOtraCuenta plan={plan} />
          </>
        ) : (
          <>
            <h1>
              Probá <em>14 días gratis</em>.
            </h1>
            <p className="lead">
              Creá tu cuenta, elegí el plan y registrá la tarjeta. Hoy no pagás nada y podés
              cancelar cuando querás.
            </p>
            <EmpezarForm plan={plan} fechaCobro={fechaCobro} errorPago={errorPago} />
          </>
        )}

        <p className="emp-pie fine">
          <Link href="/">← Volver a la portada</Link>
          <span aria-hidden="true"> · </span>
          <Link href="/faqs">Preguntas frecuentes</Link>
        </p>
      </main>
    </div>
  );
}

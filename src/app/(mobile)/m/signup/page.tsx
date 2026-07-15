import type { Metadata } from "next";
import { MobileSignupForm } from "../components/mobile-signup-form";

/**
 * Registro del móvil (/m/signup), misma piel que /m/login. Vive fuera del grupo (app):
 * alcanzable sin sesión. REUTILIZA signUpAction (vía MobileSignupForm) con next=/m, así el
 * enlace de confirmación del correo aterriza en el shell móvil. es-MX "tú", tema claro.
 */
export const metadata: Metadata = { title: "Crear cuenta · CARTERA+" };

export default function MobileSignup() {
  return (
    <div className="m-login">
      {/* Branding (mismo que el login) */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <span
          className="iso"
          style={{ width: 64, height: 64, borderRadius: 20, margin: "0 auto 18px" }}
          aria-hidden
        >
          <svg viewBox="0 0 64 64" fill="none" style={{ width: 42, height: 42 }}>
            <path
              d="M44 19 A 18 18 0 1 0 44 45"
              stroke="currentColor"
              strokeWidth={6.4}
              strokeLinecap="round"
              fill="none"
            />
            <path d="M45 27 V37 M40 32 H50" stroke="#51AF6F" strokeWidth={3.6} strokeLinecap="round" />
          </svg>
        </span>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 27,
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          Crea tu cuenta
        </h1>
        <p className="muted" style={{ fontSize: 13.5, marginTop: 7, lineHeight: 1.45 }}>
          Empieza a poner tu dinero a trabajar con tu asesor financiero.
        </p>
      </div>

      <MobileSignupForm />
    </div>
  );
}

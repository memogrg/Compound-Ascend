import type { Metadata } from "next";
import { MobileResetForm } from "../components/mobile-reset-form";

/**
 * Solicitar recuperación de contraseña en el móvil (/m/reset-password), misma piel que
 * /m/login. Vive fuera del grupo (app): alcanzable sin sesión. REUTILIZA
 * requestPasswordResetAction (vía MobileResetForm). El paso de fijar la nueva contraseña se
 * hace por el enlace del correo. es-MX "tú", tema claro.
 */
export const metadata: Metadata = { title: "Recuperar contraseña · CARTERA+" };

export default function MobileResetPassword() {
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
          Recupera tu acceso
        </h1>
        <p className="muted" style={{ fontSize: 13.5, marginTop: 7, lineHeight: 1.45 }}>
          Escribe tu correo y te enviaremos un enlace para restablecer tu contraseña.
        </p>
      </div>

      <MobileResetForm />
    </div>
  );
}

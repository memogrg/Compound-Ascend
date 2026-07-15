import type { Metadata } from "next";
import Link from "next/link";
import { MobileLoginForm } from "../components/mobile-login-form";
import { MobileGoogleButton } from "../components/mobile-google-button";

/**
 * Login del móvil (/m/login), rediseño premium (data-screen="login" del diseño).
 * Vive fuera del grupo (app): alcanzable sin sesión, es la puerta de entrada.
 * REUTILIZA la lógica de la web sin reimplementarla:
 *  - Google: MobileGoogleButton — native-aware. En la app Capacitor abre el navegador
 *    del sistema y canjea por deep link (flujo nativo, aterriza en /m); en un navegador
 *    normal cae al form de signInWithGoogleAction (web sin cambios).
 *  - Email/contraseña: signInAction vía MobileLoginForm, con next=/m → en éxito va a /m.
 * es-MX "tú", tema claro, safe areas.
 */
export const metadata: Metadata = { title: "Entrar · CARTERA+" };

export default function MobileLogin() {
  return (
    <div className="m-login">
      {/* Branding */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
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
          Bienvenido de vuelta
        </h1>
        <p className="muted" style={{ fontSize: 13.5, marginTop: 7, lineHeight: 1.45 }}>
          Tu asesor financiero te está esperando. Continúa donde lo dejaste.
        </p>
      </div>

      {/* Continuar con Google: native-aware (flujo nativo en la app, fallback web en navegador) */}
      <MobileGoogleButton />

      <div className="m-divider">o con tu correo</div>

      {/* Email / contraseña (reutiliza signInAction, next=/m) */}
      <MobileLoginForm />

      <div style={{ textAlign: "center", marginTop: 14, fontSize: 13 }}>
        <Link href="/m/reset-password" className="m-authlink">
          ¿Olvidaste tu contraseña?
        </Link>
      </div>

      <div style={{ textAlign: "center", marginTop: 14, fontSize: 13, color: "var(--text-muted)" }}>
        ¿No tienes cuenta?{" "}
        <Link href="/m/signup" className="m-authlink">
          Crea una
        </Link>
      </div>
    </div>
  );
}

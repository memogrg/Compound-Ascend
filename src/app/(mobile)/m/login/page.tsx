import type { Metadata } from "next";
import Link from "next/link";
import { signInWithGoogleAction } from "@/lib/auth/actions";
import { MobileLoginForm } from "../components/mobile-login-form";

/**
 * Login del móvil (/m/login), rediseño premium (data-screen="login" del diseño).
 * Vive fuera del grupo (app): alcanzable sin sesión, es la puerta de entrada.
 * REUTILIZA la lógica de la web sin reimplementarla:
 *  - Google: signInWithGoogleAction (OAuth; su redirect por defecto es /dashboard).
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

      {/* Continuar con Google (reutiliza signInWithGoogleAction) */}
      <form action={signInWithGoogleAction}>
        <button type="submit" className="m-oauth">
          <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
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
      </form>

      <div className="m-divider">o con tu correo</div>

      {/* Email / contraseña (reutiliza signInAction, next=/m) */}
      <MobileLoginForm />

      <div style={{ textAlign: "center", marginTop: 18, fontSize: 13, color: "var(--text-muted)" }}>
        ¿No tienes cuenta?{" "}
        <Link href="/signup" className="m-authlink">
          Crea una
        </Link>
      </div>
    </div>
  );
}

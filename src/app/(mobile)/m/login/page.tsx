import type { Metadata } from "next";
import Link from "next/link";
import { MobileLoginForm } from "../components/mobile-login-form";
import { MobileGoogleButton } from "../components/mobile-google-button";

/**
 * Login del móvil (/m/login). Vive fuera del grupo (app), así que NO pasa por la
 * guarda de sesión y es alcanzable sin sesión. Es la puerta de entrada: en éxito
 * la Server Action reutilizada redirige a /m. Piel del diseño (data-screen="login").
 */
export const metadata: Metadata = { title: "Entrar · CARTERA+" };

export default function MobileLogin() {
  return (
    <div className="m-scroll">
      <div className="m-pad">
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <span
            className="iso"
            style={{ width: 64, height: 64, borderRadius: 20, margin: "0 auto 16px" }}
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
          <div
            style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 26, letterSpacing: "-0.02em" }}
          >
            Bienvenido de vuelta
          </div>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 6 }}>
            Tu asesor financiero te está esperando.
          </div>
        </div>

        <MobileGoogleButton />

        <div className="m-divider">o con tu correo</div>

        <MobileLoginForm />

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 13, color: "var(--text-muted)" }}>
          ¿No tienes cuenta?{" "}
          <Link href="/signup" className="m-authlink">
            Crea una
          </Link>
        </div>
      </div>
    </div>
  );
}

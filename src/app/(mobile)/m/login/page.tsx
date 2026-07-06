import type { Metadata } from "next";
import Link from "next/link";

/**
 * Placeholder de login del móvil. Vive fuera del grupo (app), así que NO pasa por
 * la guarda de sesión (evita el bucle) y es alcanzable sin sesión. El login real
 * (formulario + Server Action de auth) llega en un delta posterior. Por ahora, si
 * ya tienes sesión web, entra directo a /m.
 */
export const metadata: Metadata = { title: "Entrar · CARTERA+" };

export default function MobileLoginPlaceholder() {
  return (
    <div className="m-scroll">
      <div className="m-pad" style={{ minHeight: "80dvh", display: "flex", flexDirection: "column", justifyContent: "center", gap: 22 }}>
        <div className="row" style={{ gap: 12 }}>
          <span className="iso" aria-hidden>
            <svg viewBox="0 0 64 64" fill="none">
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
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 22, letterSpacing: "-0.02em" }}>
              CARTERA+
            </div>
            <div className="muted" style={{ fontSize: 13 }}>
              Tu sistema financiero
            </div>
          </div>
        </div>

        <div className="wgt">
          <div className="sec-title" style={{ marginBottom: 8 }}>
            Inicia sesión
          </div>
          <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.55 }}>
            El acceso desde la app llega pronto. Por ahora, entra con tu cuenta en la web y vuelve a
            abrir tu Inicio.
          </div>
        </div>

        <Link href="/login" className="wgt" style={{ display: "block", textAlign: "center", background: "var(--accent)", color: "var(--accent-ink)", fontWeight: 700, padding: "16px", borderColor: "transparent" }}>
          Ir a iniciar sesión
        </Link>
        <Link href="/m" className="muted" style={{ textAlign: "center", fontSize: 13, fontWeight: 600 }}>
          Ya tengo sesión → ir a mi Inicio
        </Link>
      </div>
    </div>
  );
}

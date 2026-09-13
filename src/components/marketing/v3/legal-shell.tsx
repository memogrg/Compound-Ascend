import "./faqs.css";
import "./legal.css";
import Link from "next/link";
import { LEGAL_ACTUALIZADO, LEGAL_VERSION } from "@/lib/legal/version";

/**
 * Chasis de las páginas legales: el MISMO shell visual que /faqs (header con la marca,
 * ancho `.wrap`, pie), sin duplicar una línea de su CSS — `faqs.css` se importa acá y
 * `legal.css` solo agrega lo que un documento largo necesita.
 *
 * El pie lleva los enlaces a las tres páginas con TEXTO visible: Play Console y App Store
 * piden una URL de privacidad alcanzable, y un ícono sin texto no cumple.
 */
export function LegalShell({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="lp">
      <header className="hdr">
        <div className="wrap hd">
          <Link className="lp-brand" href="/" aria-label="CARTERA+">
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
            <Link href="/faqs">Preguntas frecuentes</Link>
          </nav>
        </div>
      </header>

      <main className="wrap">
        <article className="lg-doc">
          <h1>{titulo}</h1>
          <p className="lg-meta">
            Última actualización: {LEGAL_ACTUALIZADO} · Versión {LEGAL_VERSION}
          </p>
          <p className="lg-borrador">
            <strong>Borrador en revisión legal</strong> —{" "}
            <span className="lg-pendiente">[Razón social]</span>, Costa Rica. Este texto describe lo
            que la aplicación hace hoy; la versión definitiva se publica antes del lanzamiento en
            las tiendas.
          </p>
          {children}
        </article>
      </main>

      <footer className="pie">
        <div className="wrap in">
          <span>
            <span className="cw">
              CARTERA<i>+</i>
            </span>{" "}
            · Costa Rica
          </span>
          <span>
            <Link href="/privacidad">Privacidad</Link> · <Link href="/terminos">Términos</Link> ·{" "}
            <Link href="/eliminar-cuenta">Eliminar cuenta</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

import Link from "next/link";
import { BrandMark } from "@/components/layout/brand-mark";
import { Icon } from "@/components/ui/icon";

/** Cascarón premium de las pantallas de autenticación (CARTERA+ v2). */
export function AuthShell({
  title,
  titleHTML,
  subtitle,
  children,
  footer,
  showTrust = true,
}: {
  title?: string;
  titleHTML?: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  showTrust?: boolean;
}) {
  return (
    <div className="auth-wrap">
      <div className="auth-shell">
        {/* El logotipo es un enlace y hay una salida explícita. Estas pantallas eran un
            callejón: ni el logo ni ningún texto llevaba a la landing, y desde /login la
            única forma de volver a la página principal era escribir la URL. */}
        <Link href="/" className="auth-brand" aria-label="Volver a la página principal de CARTERA+">
          <BrandMark />
          <div className="brand-name">
            CARTERA<span className="ascend">+</span>
          </div>
        </Link>

        <div className="auth-card">
          <div className="auth-head">
            {titleHTML ? (
              <h1 className="auth-title" dangerouslySetInnerHTML={{ __html: titleHTML }} />
            ) : (
              <h1 className="auth-title">{title}</h1>
            )}
            <p className="auth-sub">{subtitle}</p>
          </div>

          {children}

          {footer ? <div className="auth-foot">{footer}</div> : null}
        </div>

        {showTrust ? (
          <div className="auth-trust">
            <Icon name="defense" />
            <span>Tus datos financieros están protegidos y solo vos podés acceder a ellos.</span>
          </div>
        ) : null}

        <Link href="/" className="auth-volver">
          ← Volver a CARTERA+
        </Link>
      </div>
    </div>
  );
}

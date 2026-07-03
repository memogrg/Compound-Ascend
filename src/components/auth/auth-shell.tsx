import { BrandMark } from "@/components/layout/brand-mark";
import { Icon } from "@/components/ui/icon";

/** Cascarón premium de las pantallas de autenticación. */
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
      <div className="auth-card">
        <div className="auth-brand">
          <BrandMark />
          <div>
            <div className="brand-name">
              CARTERA<span className="ascend">+</span>
            </div>
            <div className="brand-sub">Sistema Financiero</div>
          </div>
        </div>

        {titleHTML ? (
          <h1 className="auth-title" dangerouslySetInnerHTML={{ __html: titleHTML }} />
        ) : (
          <h1 className="auth-title">{title}</h1>
        )}
        <p className="auth-sub">{subtitle}</p>

        {children}

        {footer ? <div className="auth-foot">{footer}</div> : null}

        {showTrust ? (
          <div className="auth-trust">
            <Icon name="defense" />
            <span>Tus datos financieros están protegidos y solo tú puedes acceder a ellos.</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

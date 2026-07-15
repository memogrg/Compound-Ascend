import Link from "next/link";

/**
 * Estado de éxito de los flujos de auth móvil (registro / recuperar contraseña):
 * check verde + título + mensaje + enlace de regreso. Reutiliza las clases del login
 * móvil (`.iso`, `.m-btn`, tipografía display) — sin CSS nuevo.
 */
export function AuthSuccess({
  title,
  message,
  linkHref,
  linkLabel,
}: {
  title: string;
  message: string;
  linkHref: string;
  linkLabel: string;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <span
        className="iso"
        style={{
          width: 56,
          height: 56,
          borderRadius: 18,
          margin: "0 auto 16px",
          background: "var(--accent-soft)",
          color: "var(--accent)",
        }}
        aria-hidden
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" style={{ width: 30, height: 30 }}>
          <path d="m5 12 5 5 9-11" />
        </svg>
      </span>
      <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 21, margin: 0 }}>
        {title}
      </h2>
      <p className="muted" style={{ fontSize: 13.5, marginTop: 8, lineHeight: 1.5 }}>
        {message}
      </p>
      <Link href={linkHref} className="m-btn m-btn-block m-btn-primary" style={{ marginTop: 18 }}>
        {linkLabel}
      </Link>
    </div>
  );
}

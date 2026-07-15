import Link from "next/link";

import { MobileMenu } from "./mobile-menu";

/**
 * Header sticky de cristal, unificado para TODAS las pantallas /m. Se comporta como el de
 * Inicio: contenedor `.m-topbar m-glass` que se queda fijo y escarcha el contenido al hacer
 * scroll (cristal solo en el chrome; safe-area superior ya resuelta por .m-topbar).
 *
 * Debe montarse como PRIMER hijo de `.m-pad` (dispara `.m-scroll:has(.m-topbar)` → el inset
 * superior lo aporta el topbar, no el scroller). Acciones a la derecha SIEMPRE presentes:
 * Chat del agente (ruta /m/asistente, igual que Inicio), Campana + Menú (vía MobileMenu, que
 * ya agrupa ambos y portalea sus overlays a body, fuera del transform del cristal).
 *
 * variant="home": logo C+ + saludo/nombre.  variant="inner": Atrás (opcional) + eyebrow + título.
 */
export function MobileHeader({
  variant = "inner",
  greeting,
  name,
  eyebrow,
  title,
  backHref,
  backLabel = "Volver",
  badge,
}: {
  variant?: "home" | "inner";
  /** home */
  greeting?: string;
  name?: string;
  /** inner */
  eyebrow?: string;
  title?: string;
  backHref?: string;
  backLabel?: string;
  /** extra opcional a la izquierda de las acciones (p. ej. el % de Gastos) */
  badge?: React.ReactNode;
}) {
  return (
    <header className="between m-topbar m-glass" style={{ marginBottom: 16 }}>
      <div className="row" style={{ minWidth: 0, flex: 1, gap: 11 }}>
        {variant === "home" ? (
          <>
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
            <div style={{ minWidth: 0 }}>
              {greeting ? (
                <div className="muted" style={{ fontSize: 12 }}>
                  {greeting}
                </div>
              ) : null}
              <div
                className="m-greeting"
                style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {name}
              </div>
            </div>
          </>
        ) : (
          <>
            {backHref ? (
              <Link href={backHref} className="bk" aria-label={backLabel}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </Link>
            ) : null}
            <div style={{ minWidth: 0, flex: 1 }}>
              {eyebrow ? <div className="ov">{eyebrow}</div> : null}
              {title ? (
                <div className="h-title m-hd-title" style={{ marginTop: 2 }}>
                  {title}
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>

      <div className="row" style={{ gap: 6, flex: "none" }}>
        {badge}
        {/* Chat del agente: misma ruta que Inicio, presente en todas las pantallas. */}
        <Link href="/m/asistente" className="icon-btn" aria-label="Asistente IA" title="Asistente IA">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H8l-4 3V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />
            <path d="M12 8.5v4M10 10.5h4" />
          </svg>
        </Link>
        {/* Campana + Menú (overlays por portal a body). */}
        <MobileMenu />
      </div>
    </header>
  );
}

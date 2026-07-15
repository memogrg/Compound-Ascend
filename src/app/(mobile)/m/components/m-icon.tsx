import type { CSSProperties } from "react";

/**
 * Íconos monolínea del design system "Cristal Cálido" (rediseno-movil/iconos-sistema.svg):
 * trazo 1.4, esquinas redondeadas, un solo peso, `currentColor` (el color lo pone el contexto).
 * La retícula es CENTRADA en el origen (viewBox "-16 -16 32 32"), igual que la hoja de íconos,
 * así los `d` se copian tal cual del prototipo sin re-mapear coordenadas.
 *
 * Uso: <MIcon name="add" /> · el tamaño se controla con `size` (px) o por CSS (width/height).
 * Los emojis por pantalla se reemplazan progresivamente por estos glifos en R3.
 */
export type MIconName =
  // categorías
  | "food"
  | "housing"
  | "transport"
  | "services"
  | "dining"
  | "health"
  | "leisure"
  | "education"
  // ingresos / entidades
  | "salary"
  | "income"
  | "investment"
  | "rental"
  | "debt"
  | "protection"
  | "household"
  | "goal"
  // acciones / navegación
  | "add"
  | "transfer"
  | "template"
  | "rules"
  | "search"
  | "bell"
  | "home"
  | "portfolio";

/** Contenido de cada glifo (coordenadas centradas en 0,0, rango ~±16). */
const GLYPHS: Record<MIconName, React.ReactNode> = {
  // ---- categorías ----
  food: (
    <>
      <path d="M-14 -13 h4 l4 18 a1 1 0 0 0 1 .8 h12 a1 1 0 0 0 1 -.8 l2.5 -12 h-19" />
      <circle cx="-4" cy="14" r="1.6" />
      <circle cx="9" cy="14" r="1.6" />
    </>
  ),
  housing: <path d="M-16 4 l16 -14 l16 14 M-11 1 v13 h22 v-13" />,
  transport: (
    <>
      <path d="M-15 4 l3 -11 h18 l3 11 M-16 4 h32 v6 h-32z" />
      <circle cx="-9" cy="12" r="2" />
      <circle cx="9" cy="12" r="2" />
    </>
  ),
  services: <path d="M2 -16 l-11 15 h7 l-1 11 11 -15 h-7 l1 -11z" />,
  dining: <path d="M-11 -14 v9 a4 4 0 0 0 8 0 v-9 M-7 -5 v19 M9 -14 c-2 0 -3 4 -3 7 s1 4 3 4 v12" />,
  health: (
    <>
      <path d="M-12 8 c0 -10 5 -16 12 -16 c-3 4 -3 8 0 10 c5 3 3 9 -1 11" />
      <path d="M-13 12 h20" />
    </>
  ),
  leisure: (
    <>
      <rect x="-14" y="-9" width="28" height="19" rx="3" />
      <path d="M-14 -3 h28 M-8 5 h6" />
    </>
  ),
  education: (
    <>
      <path d="M-13 -10 h26 v20 h-26z M-13 -3 h26" />
      <circle cx="0" cy="4" r="3" />
    </>
  ),
  // ---- ingresos / entidades ----
  salary: (
    <>
      <rect x="-15" y="-8" width="30" height="18" rx="3" />
      <path d="M-7 -8 v-3 a3 3 0 0 1 3 -3 h8 a3 3 0 0 1 3 3 v3 M-15 -1 h30" />
    </>
  ),
  income: (
    <>
      <circle cx="0" cy="0" r="13" />
      <path d="M0 -6 v12 M-3 -3 h5 a2.5 2.5 0 0 1 0 5 h-4 a2.5 2.5 0 0 0 0 5 h5" />
    </>
  ),
  investment: <path d="M-14 12 V-2 M-5 12 V-8 M4 12 V-12 M13 12 V-5" />,
  rental: <path d="M-14 6 l3 -13 h16 l3 13z M-11 -7 v-4 h16 v4" />,
  debt: (
    <>
      <rect x="-14" y="-9" width="28" height="18" rx="3" />
      <circle cx="6" cy="0" r="3" />
    </>
  ),
  protection: <path d="M0 -14 l12 5 v7 c0 7 -6 11 -12 14 c-6 -3 -12 -7 -12 -14 v-7z" />,
  household: (
    <>
      <circle cx="0" cy="-3" r="6" />
      <path d="M-11 14 c0 -7 5 -10 11 -10 s11 3 11 10" />
    </>
  ),
  goal: (
    <>
      <circle cx="0" cy="0" r="13" />
      <path d="M-6 2 l4 4 8 -9" />
    </>
  ),
  // ---- acciones / navegación ----
  add: <path d="M0 -13 v26 M-13 0 h26" />,
  transfer: <path d="M-11 4 h22 l-4 -4 M11 -4 h-22 l4 4" />,
  template: <path d="M-8 -13 h12 l4 4 v18 a1 1 0 0 1 -1 1 h-15 a1 1 0 0 1 -1 -1 v-21 a1 1 0 0 1 1 -1z M4 -13 v5 h5" />,
  rules: <path d="M-12 -8 h24 M-12 0 h24 M-12 8 h16" />,
  search: (
    <>
      <circle cx="-2" cy="-2" r="9" />
      <path d="M6 6 l7 7" />
    </>
  ),
  bell: (
    <>
      <path d="M-9 -9 a6 6 0 0 1 18 0 c0 7 3 8 3 8 h-24 s3 -1 3 -8" />
      <path d="M-2 12 a2 2 0 0 0 4 0" />
    </>
  ),
  home: <path d="M-13 2 l13 -12 l13 12 M-9 -1 v11 h18 v-11" />,
  portfolio: <path d="M-13 12 V-6 M-4 12 V-12 M5 12 V-3 M13 12 V-9" />,
};

export function MIcon({
  name,
  size = 22,
  strokeWidth = 1.4,
  className,
  style,
  title,
}: {
  name: MIconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}) {
  return (
    <svg
      viewBox="-16 -16 32 32"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {GLYPHS[name]}
    </svg>
  );
}

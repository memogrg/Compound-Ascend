/**
 * Set de iconos (inline SVG) portado del design system (assets/shell.js).
 * Trazo por defecto 1.8; usa `filled` para iconos rellenos (spark).
 */
import type { CSSProperties } from "react";

export type IconName =
  | "dashboard"
  | "budget"
  | "income"
  | "expense"
  | "txn"
  | "savings"
  | "debt"
  | "invest"
  | "portfolio"
  | "networth"
  | "defense"
  | "profile"
  | "bell"
  | "gear"
  | "search"
  | "menu"
  | "sun"
  | "moon"
  | "spark"
  | "chev"
  | "x"
  | "send"
  | "check"
  | "edit"
  | "info"
  | "plus"
  | "scan"
  | "upload"
  | "dots"
  | "filter"
  | "repeat"
  | "lock";

const PATHS: Record<IconName, string> = {
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M4 12h16"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
  dots: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4-2v-4L3 5Z"/>',
  repeat: '<path d="M17 2l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  dashboard:
    '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  budget: '<path d="M3 7h18M6 7v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7M9 7V5a3 3 0 0 1 6 0v2"/>',
  income: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  expense: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  txn: '<path d="M4 7h13M4 7l3-3M4 7l3 3M20 17H7M20 17l-3-3M20 17l-3 3"/>',
  savings:
    '<path d="M19 7c0-1.7-3.1-3-7-3S5 5.3 5 7m14 0v10c0 1.7-3.1 3-7 3s-7-1.3-7-3V7m14 0c0 1.7-3.1 3-7 3S5 8.7 5 7"/>',
  debt: '<path d="M3 12c0-4 3.5-7 9-7s9 3 9 7-3.5 7-9 7c-1.6 0-3.1-.2-4.4-.7L3 20l1.4-3.6C3.5 15.2 3 13.7 3 12Z"/><path d="M9 12h6"/>',
  invest: '<path d="M3 17l5-5 4 4 8-9"/><path d="M14 7h6v6"/>',
  portfolio:
    '<path d="M4 7h16v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7Z"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M4 12h16"/>',
  networth:
    '<g transform="translate(24,0) scale(-1,1)"><path d="M12 3v18M5 8c0-1.7 1.5-3 4-3h6c2.5 0 4 1.3 4 3s-1.5 3-4 3H9c-2.5 0-4 1.3-4 3s1.5 3 4 3h6c2.5 0 4-1.3 4-3"/></g>',
  defense: '<path d="M12 2 4 6v6c0 5 3.4 9 8 10 4.6-1 8-5 8-10V6l-8-4Z"/><path d="m9 12 2 2 4-4"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  spark: '<path d="M12 3 13.6 8.5 19 10l-5.4 1.5L12 17l-1.6-5.5L5 10l5.4-1.5L12 3Z"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z"/>',
  check: '<path d="m5 12 5 5 9-11"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"/>',
};

type IconProps = {
  name: IconName;
  width?: number;
  filled?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function Icon({ name, width = 1.8, filled = false, className, style }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      // PATHS es un mapa constante interno tipado por IconName: nunca recibe
      // entrada de usuario, por eso el innerHTML es seguro aquí.
      // nosemgrep
      dangerouslySetInnerHTML={{ __html: PATHS[name] }}
    />
  );
}

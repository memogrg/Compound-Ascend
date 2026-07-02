/**
 * Modelo de navegación de CARTERA+ (en español).
 * Agrupado por las 5 capas de la "escalera financiera" de la Biblia:
 * Resumen · Presupuesto · Control · Crecimiento · Perfil.
 * "Mi Perfil Financiero" va al final (debajo de Patrimonio).
 *
 * Las rutas reflejan la estructura App Router /(dashboard)/...
 */
import type { IconName } from "@/components/ui/icon";

export type NavItem = {
  id: string;
  name: string;
  icon: IconName;
  href: string;
  badge?: string;
  dot?: string;
};

export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: "Resumen",
    items: [{ id: "dashboard", name: "Centro de mando", icon: "dashboard", href: "/dashboard" }],
  },
  {
    label: "Presupuesto",
    items: [
      { id: "base", name: "Mi Base Financiera", icon: "budget", href: "/mi-base-financiera" },
      { id: "income", name: "Ingresos", icon: "income", href: "/ingresos" },
      { id: "expenses", name: "Gastos", icon: "expense", href: "/gastos" },
      { id: "transactions", name: "Transacciones", icon: "txn", href: "/transacciones" },
    ],
  },
  {
    label: "Control",
    items: [
      { id: "control", name: "Ahorro", icon: "savings", href: "/control-financiero" },
      { id: "debts", name: "Deudas y Préstamos", icon: "debt", href: "/deudas" },
    ],
  },
  {
    label: "Crecimiento",
    items: [
      { id: "wealth", name: "Portafolio de inversiones", icon: "invest", href: "/patrimonio" },
      {
        id: "defense",
        name: "Defensa Patrimonial",
        icon: "defense",
        href: "/patrimonio/proteccion",
      },
      { id: "rich-life", name: "Patrimonio", icon: "networth", href: "/mi-rich-life" },
    ],
  },
  {
    label: "Perfil",
    items: [
      {
        id: "profile",
        name: "Mi Perfil Financiero",
        icon: "profile",
        href: "/mi-perfil-financiero",
      },
    ],
  },
];

/** Ítems de la barra inferior móvil (5 destinos principales). */
export const BOTTOM_NAV: NavItem[] = [
  { id: "dashboard", name: "Centro de mando", icon: "dashboard", href: "/dashboard" },
  { id: "base", name: "Base", icon: "budget", href: "/mi-base-financiera" },
  { id: "control", name: "Ahorro", icon: "savings", href: "/control-financiero" },
  { id: "wealth", name: "Portafolio de inversiones", icon: "invest", href: "/patrimonio" },
  { id: "rich-life", name: "Patrimonio", icon: "networth", href: "/mi-rich-life" },
];

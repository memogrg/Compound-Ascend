"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon, type IconName } from "@/components/ui/icon";
import { navV2Enabled } from "@/lib/flags";

import { gruposDrawerV2 } from "../lib/nav-v2-movil";
import { MobileBell } from "./mobile-bell";
import { MobilePortal } from "./mobile-portal";
import { useEdgeSwipe } from "../lib/use-edge-swipe";
import { pushOverlay } from "../lib/overlay-stack";

/**
 * Menú de navegación del móvil (botón ☰ + drawer), presente en el header de cada
 * pantalla /m. Replica el sidebar web (src/lib/constants/nav.ts): mismos grupos, labels
 * y orden canónicos, con cada ítem apuntando a su ruta /m. Así toda pantalla /m es
 * alcanzable desde el menú. es-MX, tema claro, safe areas.
 *
 * Mapeo web→/m: Centro de mando→/m (en el móvil se llama "Inicio") · Mis acciones→
 * /m/mis-acciones · Mi Base Financiera→/m/mi-base-financiera ·
 * Ingresos→/m/ingresos · Gastos→/m/gastos · Transacciones→/m/transacciones ·
 * Ahorro→/m/metas · Deudas y Préstamos→/m/deudas · Portafolio de inversiones→
 * /m/inversiones · Defensa Patrimonial→/m/proteccion · Patrimonio→/m/patrimonio ·
 * Mercado e indicadores→/m/indicadores · Mi Perfil Financiero→/m/mi-perfil-financiero ·
 * Configuración→/m/perfil.
 *
 * Bajo `navV2Enabled()` los grupos los da `gruposDrawerV2()`: los cinco núcleos del modelo
 * v2 más Configuración, derivados de `nav-v2.ts` y no escritos a mano. La tabla `MENU` de
 * abajo es la de la bandera APAGADA y se conserva intacta.
 */

type MenuGroup = {
  label: string;
  /** Solo bajo bandera: el icono del núcleo, junto a su nombre. */
  icon?: IconName;
  items: { name: string; href: string }[];
};

const MENU: MenuGroup[] = [
  {
    label: "Resumen",
    items: [
      { name: "Inicio", href: "/m" },
      { name: "Mis acciones", href: "/m/mis-acciones" },
    ],
  },
  {
    label: "Presupuesto",
    items: [
      { name: "Mi Base Financiera", href: "/m/mi-base-financiera" },
      { name: "Ingresos", href: "/m/ingresos" },
      { name: "Gastos", href: "/m/gastos" },
      { name: "Transacciones", href: "/m/transacciones" },
    ],
  },
  {
    label: "Control",
    items: [
      { name: "Ahorro", href: "/m/metas" },
      { name: "Deudas y Préstamos", href: "/m/deudas" },
    ],
  },
  {
    label: "Crecimiento",
    items: [
      { name: "Portafolio de inversiones", href: "/m/inversiones" },
      { name: "Defensa Patrimonial", href: "/m/proteccion" },
      { name: "Patrimonio", href: "/m/patrimonio" },
      { name: "Mercado e indicadores", href: "/m/indicadores" },
    ],
  },
  { label: "Perfil", items: [{ name: "Mi Perfil Financiero", href: "/m/mi-perfil-financiero" }] },
  {
    label: "Configuración",
    items: [
      // Entrada ESTABLE a los cuatro asistentes (paridad con el sidebar web):
      // el hub del Inicio no puede ser el único camino para volver a editar.
      { name: "Mi configuración", href: "/m/configurar" },
      { name: "Ajustes de la cuenta", href: "/m/perfil" },
    ],
  },
];

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  // Bajo bandera, los grupos salen del modelo v2 (5 núcleos + Configuración) en vez de la
  // tabla de arriba, que replica el sidebar v1. Mismo markup y mismas clases: lo único que
  // cambia es de dónde salen los destinos, y que el encabezado del grupo lleva su icono.
  const grupos: MenuGroup[] = navV2Enabled()
    ? gruposDrawerV2().map((g) => ({
        label: g.label,
        icon: g.icon,
        items: g.items.map((i) => ({ name: i.name, href: i.hrefM })),
      }))
    : MENU;
  const pathname = usePathname() ?? "/m";
  const close = () => setOpen(false);

  // Segunda vía para abrir, además del ☰: arrastrar desde el borde derecho. El icono vive
  // en la esquina superior derecha, que es donde peor llega el pulgar en un teléfono
  // grande — y desde que no hay barra de pestañas, casi toda la navegación pasa por ahí.
  const abrir = useCallback(() => setOpen(true), []);
  useEdgeSwipe(abrir, !open);

  // Con el menú abierto, el botón Atrás de Android lo cierra en vez de navegar.
  useEffect(() => {
    if (!open) return;
    return pushOverlay(() => setOpen(false));
  }, [open]);

  return (
    <>
      {/* Campana + menú: un solo item del header, presente en toda pantalla /m. */}
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <MobileBell />
        <button
          type="button"
          className="icon-btn"
          aria-label="Abrir menú"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </div>

      {open ? (
        // Portal a <body>: el drawer es position:fixed y el header contenedor tiene
        // .m-glass (transform/backdrop-filter). Sin portal quedaría atrapado (cuadro gris).
        <MobilePortal>
          <div className="m-menu-overlay" role="dialog" aria-modal="true" aria-label="Navegación">
            <button className="m-menu-backdrop" aria-label="Cerrar menú" onClick={close} />
            <nav className="m-menu-panel">
              <div className="m-menu-head">
                <span className="m-menu-brand">CARTERA+</span>
                <button type="button" className="icon-btn" aria-label="Cerrar menú" onClick={close}>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
              <div className="m-menu-scroll">
                {grupos.map((group) => (
                  <div key={group.label} className="m-menu-group">
                    <div className="m-menu-glabel">
                      {group.icon ? (
                        <Icon
                          name={group.icon}
                          style={{ width: 13, height: 13, marginRight: 6, verticalAlign: "-2px" }}
                        />
                      ) : null}
                      {group.label}
                    </div>
                    {group.items.map((it) => {
                      const active = pathname === it.href;
                      return (
                        <Link
                          key={it.href}
                          href={it.href}
                          className={`m-menu-item${active ? " on" : ""}`}
                          aria-current={active ? "page" : undefined}
                          onClick={close}
                        >
                          {it.name}
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </div>
            </nav>
          </div>
        </MobilePortal>
      ) : null}
    </>
  );
}

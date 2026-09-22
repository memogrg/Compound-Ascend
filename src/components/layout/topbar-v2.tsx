"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { BellNotifications } from "@/components/layout/bell-notifications";
import { CurrencySwitch } from "@/components/layout/currency-switch";
import { PeriodControl } from "@/components/layout/period-control";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Icon } from "@/components/ui/icon";
import { breadcrumb, nucleoDeRuta } from "@/lib/constants/nav-v2";
import { resolvePageMeta } from "@/lib/constants/page-meta";

/**
 * Barra superior v2. Mismo esqueleto que `Topbar` —hamburguesa a la izquierda, las mismas
 * acciones a la derecha— con dos cambios:
 *
 *  1. El breadcrumb sale de `nav-v2` («Flujo / Gastos y sobres») en vez de `page-meta`, que
 *     todavía usa los grupos viejos («Presupuesto / Gastos»).
 *  2. Aparece el control de periodo global, a la derecha del título.
 *
 * El `<h1>` SIGUE siendo el de `resolvePageMeta`: «Tus gastos» es copy de la pantalla y no
 * está en el modelo de navegación, que solo conoce el nombre de la pestaña.
 */
export function TopbarV2({
  onMenu,
  currency,
  defaultPeriod,
}: {
  onMenu: () => void;
  currency?: { display: string; primary: string };
  defaultPeriod?: string;
}) {
  const pathname = usePathname() ?? "/dashboard";
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ?? null;
  const meta = resolvePageMeta(pathname);

  const migas = breadcrumb(pathname, search);
  // Fuera del modelo (configuración, suscripción, wizards) no hay núcleo: ni breadcrumb de
  // nav-v2 ni periodo. Un selector de mes en «Cuenta y plan» no significa nada.
  const enElModelo = nucleoDeRuta(pathname, search) !== null;
  const [raiz, hoja] = enElModelo && migas.length === 2 ? migas : [meta.crumb, meta.title];

  return (
    <div className="topbar tb2">
      <div className="crumbs" style={{ alignItems: "center", gap: 14 }}>
        <button className="icon-btn hamburger" aria-label="Menú" onClick={onMenu}>
          <Icon name="menu" />
        </button>
        <div>
          <div className="crumbs" style={{ marginBottom: 3 }}>
            <span className="crumb-mut">{raiz}</span>
            <span className="crumb-sep">/</span>
            <span className="crumb-now">{hoja}</span>
          </div>
          <h1
            className="page-title"
            dangerouslySetInnerHTML={{ __html: meta.titleHTML ?? meta.title }}
          />
        </div>
        {enElModelo && defaultPeriod ? <PeriodControl defaultPeriod={defaultPeriod} /> : null}
      </div>

      <div className="topbar-actions">
        <div className="search">
          <Icon name="search" style={{ width: 14, height: 14, color: "var(--muted)" }} />
          <input placeholder="Buscar cuentas, inversiones…" aria-label="Buscar" />
          <span className="kbd">⌘K</span>
        </div>
        {currency ? <CurrencySwitch current={currency.display} primary={currency.primary} /> : null}
        <BellNotifications />
        <Link href="/configuracion" className="icon-btn" aria-label="Ajustes">
          <Icon name="gear" />
        </Link>
        <ThemeToggle />
      </div>
    </div>
  );
}

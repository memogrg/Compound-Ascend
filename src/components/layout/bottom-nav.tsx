"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BOTTOM_NAV } from "@/lib/constants/nav";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

/** Etiquetas cortas del tabbar (los nombres completos del NAV no caben en móvil). */
const SHORT_LABEL: Record<string, string> = {
  dashboard: "Centro",
  base: "Base",
  control: "Ahorro",
  wealth: "Portafolio",
  "rich-life": "Patrimonio",
};

/** Barra de navegación inferior — visible solo en móvil (CSS @media). */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      {BOTTOM_NAV.map((it) => {
        const active = pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link key={it.id} href={it.href} className={cn("bn-item", active && "active")}>
            <Icon name={it.icon} />
            <span>{SHORT_LABEL[it.id] ?? it.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}

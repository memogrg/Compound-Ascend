import type { Viewport } from "next";
import "./mobile.css";

/**
 * Layout raíz del grupo móvil (mobile)/m. NO hereda el shell de escritorio
 * (ese vive en (dashboard)/layout.tsx). Aplica la piel del diseño a TODAS las
 * rutas /m/* — incluida /m/login — vía el wrapper `.m-shell` (estilos scoped en
 * mobile.css, que Next carga solo para /m). La guarda de sesión y la tab bar
 * viven en el layout interno (app), para que /m/login quede fuera de la guarda.
 */
export const viewport: Viewport = {
  // Status bar acorde al tema oscuro del diseño + respeto de safe areas (notch/home).
  themeColor: "#15140F",
  viewportFit: "cover",
};

export default function MobileRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="m-shell" data-mobile>
      {children}
    </div>
  );
}

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
  // Status bar acorde a la canvas CLARA (tema por defecto) + safe areas (notch/home).
  themeColor: "#F1EFE8",
  viewportFit: "cover",
};

export default function MobileRootLayout({ children }: { children: React.ReactNode }) {
  // Tema CLARO por defecto (como el diseño). Para alternar a oscuro, cambiar este
  // atributo a data-theme="dark" (mobile.css tiene el scope listo). No se fuerza oscuro.
  return (
    <div className="m-shell" data-mobile data-theme="light">
      {children}
    </div>
  );
}

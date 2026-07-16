import type { Viewport } from "next";
import "./mobile.css";
import { MobileIntro } from "./components/mobile-intro";

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
  // Escalado BLOQUEADO: el WebView se comporta como una app nativa. Sin esto, iOS hace
  // zoom al enfocar un campo y al cerrar el teclado se queda agrandado, con scroll
  // lateral y sin forma de volver (maximumScale es lo que impide ese "zoom pegado").
  // La causa raíz —campos por debajo de 16px— se corrige aparte en .m-inp; esto es el
  // cinturón además de los tirantes.
  // Accesibilidad: el zoom del SISTEMA (Ajustes › Accesibilidad › Zoom en iOS,
  // Ampliación en Android) es independiente y sigue funcionando. Lo que sí se pierde
  // es el pellizco DENTRO de la app: WKWebView respeta esta directiva (Safari la
  // ignora), que es justo el comportamiento nativo que se busca aquí.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function MobileRootLayout({ children }: { children: React.ReactNode }) {
  // Tema CLARO por defecto (como el diseño). Para alternar a oscuro, cambiar este
  // atributo a data-theme="dark" (mobile.css tiene el scope listo). No se fuerza oscuro.
  return (
    <div className="m-shell" data-mobile data-theme="light">
      {/* Intro animada del logo al abrir la app (una vez por sesión; portal a body). */}
      <MobileIntro />
      {children}
    </div>
  );
}

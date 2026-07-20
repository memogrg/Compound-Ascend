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
  // Status bar acorde a la canvas de CADA tema. Con un solo color, al abrir la app en
  // oscuro la barra de estado se quedaba clara y se veía una franja ajena arriba.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F1EFE8" },
    { media: "(prefers-color-scheme: dark)", color: "#15140F" },
  ],
  // Le dice al WebView de qué color pintar lo que NO es nuestro: el fondo por debajo del
  // documento y los controles nativos. Sin esto asoma un flash blanco por los bordes al
  // hacer scroll con rebote, aunque la app ya esté en oscuro.
  colorScheme: "light dark",
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
  // SIN data-theme propio: la fuente de verdad es <html>, que fija el script
  // anti-parpadeo del layout raíz antes de pintar, y el shell lo hereda por CSS. Tenerlo
  // aquí obligaba a sincronizar dos atributos y dejaba el portal desincronizado.
  return (
    <div className="m-shell" data-mobile>
      {/* Intro animada del logo al abrir la app (una vez por sesión; portal a body). */}
      <MobileIntro />
      {children}
    </div>
  );
}

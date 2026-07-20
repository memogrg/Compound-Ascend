"use client";

/**
 * Proveedor de tema (claro/oscuro) con persistencia en localStorage ("ca-theme").
 * El script anti-parpadeo vive en el root layout y fija data-theme antes del
 * primer render, evitando flash.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";
type ThemeContextValue = { theme: Theme; toggle: () => void };

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    if (current === "dark" || current === "light") setTheme(current);
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem("ca-theme", next);
      } catch {
        /* almacenamiento no disponible: se ignora */
      }
      return next;
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme debe usarse dentro de <ThemeProvider>");
  return ctx;
}

/**
 * Preferencia de tema del usuario. "system" NO es un tema: es la instrucción de seguir
 * al sistema operativo, y se resuelve a claro u oscuro en cada arranque y cada vez que
 * el sistema cambia.
 */
export type ThemeMode = "system" | "light" | "dark";
export const THEME_KEY = "ca-theme";

/**
 * Script inline anti-parpadeo. Va en <head>, ANTES de hidratar: si el tema se aplicara
 * en un efecto, la pantalla pintaría en claro y saltaría a oscuro, y ese salto es justo
 * lo que delata a una app que quiere sentirse nativa.
 *
 * `pordefecto` es qué hacer cuando el usuario nunca eligió. Difiere por superficie a
 * propósito: la app móvil se comporta como una app del sistema y sigue al iPhone, y la
 * web siempre ha arrancado en claro — cambiarlo aquí sería modificar la web sin que
 * nadie lo haya pedido. La preferencia MANUAL, cuando existe, manda en las dos.
 */
export function themeInitScript(pordefecto: ThemeMode = "light"): string {
  return `(function(){try{
var m=localStorage.getItem(${JSON.stringify(THEME_KEY)})||${JSON.stringify(pordefecto)};
var d=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
document.documentElement.setAttribute("data-theme",d?"dark":"light");
}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`;
}

/**
 * El script que va en el layout RAÍZ, que sirve a las dos superficies.
 *
 * Elige el valor por defecto según la ruta porque `<head>` se ejecuta antes de que React
 * sepa nada, pero `location.pathname` ya está: `/m` y `/m/...` arrancan siguiendo al
 * sistema; el resto sigue en claro, como siempre. El patrón exige la barra o el final
 * para no capturar `/mi-base-financiera` ni `/mi-rich-life`.
 */
export const THEME_INIT_SCRIPT = `(function(){try{
var esMovil=/^\\/m(\\/|$)/.test(location.pathname);
var m=localStorage.getItem(${JSON.stringify(THEME_KEY)})||(esMovil?"system":"light");
var d=m==="dark"||(m==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);
document.documentElement.setAttribute("data-theme",d?"dark":"light");
}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`;

/** Resuelve la preferencia al tema efectivo consultando al sistema. */
export function resolveTheme(mode: ThemeMode): Theme {
  if (mode === "system") {
    return typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return mode;
}

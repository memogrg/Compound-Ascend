"use client";

import { useCallback, useEffect, useState } from "react";
import { THEME_KEY, resolveTheme, type ThemeMode } from "@/components/layout/theme-provider";

/**
 * Preferencia de tema del móvil: Sistema · Claro · Oscuro.
 *
 * "Sistema" no es un tema, es la instrucción de seguir al iPhone — por eso hay que
 * escuchar `prefers-color-scheme` mientras esté activa: si el usuario tiene el modo
 * automático por horario, la app debe cambiar con él sin reabrirla.
 *
 * El atributo se escribe en <html>, la misma fuente de verdad que fija el script
 * anti-parpadeo. Así el arranque y los cambios en caliente pasan por el mismo sitio.
 */
export function useThemeMode(): { mode: ThemeMode; setMode: (m: ThemeMode) => void } {
  // Arranca en "system" y se corrige al montar: en el servidor no hay localStorage, y
  // adivinar aquí provocaría un desajuste de hidratación.
  const [mode, setModeState] = useState<ThemeMode>("system");

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(THEME_KEY);
      if (guardado === "dark" || guardado === "light" || guardado === "system") {
        setModeState(guardado);
      }
    } catch {
      /* almacenamiento no disponible: se queda en "system" */
    }
  }, []);

  // Solo mientras la preferencia sea "system": si el usuario eligió un tema fijo, que el
  // sistema cambie no debe pisárselo.
  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const aplicar = () => {
      document.documentElement.setAttribute("data-theme", mq.matches ? "dark" : "light");
    };
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    document.documentElement.setAttribute("data-theme", resolveTheme(m));
    try {
      localStorage.setItem(THEME_KEY, m);
    } catch {
      /* almacenamiento no disponible: el cambio vale para esta sesión */
    }
  }, []);

  return { mode, setMode };
}

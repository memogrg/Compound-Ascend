"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Portal a document.body para overlays (menú, hojas, diálogos) del shell móvil.
 *
 * REGLA GENERAL "Cristal Cálido": ningún elemento position:fixed puede vivir dentro de un
 * ancestro con transform/backdrop-filter (p. ej. un `.m-glass` como el header pegajoso),
 * porque ese ancestro crea un containing block y el fixed deja de resolverse contra el
 * viewport (se "atrapa": aparece un cuadro recortado en vez de cubrir la pantalla). La
 * solución es renderizar el overlay por un portal a <body>, fuera de cualquier transform.
 *
 * El wrapper reusa la clase `.m-shell` para que resuelvan los tokens (--canvas, --text…) y
 * los selectores scoped (`.m-shell .m-menu-*`, `.m-sheet-*`…), pero con `display:contents`
 * NO genera caja propia (no pinta canvas ni ocupa alto): solo transporta variables/estilos.
 * El tema se copia del `.m-shell` raíz para respetar claro/oscuro.
 */
export function MobilePortal({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    setTheme(document.querySelector(".m-shell")?.getAttribute("data-theme") ?? "light");
    setHost(document.body);
  }, []);

  if (!host) return null; // SSR / primer render: nada hasta montar en cliente

  return createPortal(
    <div className="m-shell" data-mobile data-theme={theme} style={{ display: "contents" }}>
      {children}
    </div>,
    host,
  );
}

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
 * NO copia el tema: `data-theme` vive en <html> y el shell lo hereda por CSS. Antes se
 * leía del shell raíz UNA vez al montar, así que al cambiar de tema el portal se quedaba
 * con el anterior — un menú abierto en claro sobre una app ya en oscuro.
 */
export function MobilePortal({ children }: { children: ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.body);
  }, []);

  if (!host) return null; // SSR / primer render: nada hasta montar en cliente

  return createPortal(
    <div className="m-shell" data-mobile style={{ display: "contents" }}>
      {children}
    </div>,
    host,
  );
}

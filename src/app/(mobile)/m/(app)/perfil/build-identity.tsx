"use client";

/**
 * Pie de diagnóstico de /m/perfil: qué está cargando realmente el WebView.
 *
 * Existe porque el modo demo (el prototipo estático empaquetado) era indistinguible de la
 * app real desde dentro: no había forma de saber si estabas en producción, en un servidor
 * de LAN o en un binario mal compilado. Dos líneas de texto pequeño lo responden en dos
 * segundos, sin abrir un inspector ni recompilar.
 *
 * Se resuelve en el cliente (useEffect) a propósito: `window` no existe en el render del
 * servidor y `isNativeApp()` allí daría siempre false, lo que provocaría un desajuste de
 * hidratación. Mismo patrón que AppLockToggle.
 */
import { useEffect, useState } from "react";

import { isNativeApp } from "../../lib/app-lock";

export function BuildIdentity() {
  const [info, setInfo] = useState<{ origin: string; native: boolean } | null>(null);

  useEffect(() => {
    setInfo({ origin: window.location.origin, native: isNativeApp() });
  }, []);

  if (!info) return null;

  return (
    <div
      className="muted"
      style={{ fontSize: 11, lineHeight: 1.5, textAlign: "center", marginTop: 18 }}
    >
      {info.native ? "App nativa" : "Navegador"}
      {" · "}
      <span className="mono">{info.origin}</span>
    </div>
  );
}

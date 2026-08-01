"use client";

import { useEffect, useRef } from "react";

import { saveUserTimezone } from "@/modules/account/api/actions";

/**
 * Captura silenciosa de la zona horaria del dispositivo, una vez por carga.
 *
 * En el navegador `Intl…timeZone` SÍ conoce la zona real del usuario (el servidor no:
 * Vercel corre en UTC). Si el usuario aún NO tiene zona guardada, la persistimos en su
 * perfil y fijamos la cookie `tz`, para que el servidor calcule "hoy / mes actual" en
 * su zona. Si YA tiene una guardada, no se toca: manda su elección de Configuración.
 *
 * No pinta nada; se monta en los layouts autenticados (web y móvil).
 */
export function TimezoneSync({ savedTz }: { savedTz: string | null }) {
  const done = useRef(false);
  useEffect(() => {
    // Con preferencia ya guardada no se pisa (Configuración manda). Solo captura la 1ª vez.
    if (done.current || savedTz) return;
    done.current = true;

    let deviceTz: string | undefined;
    try {
      deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!deviceTz) return;

    // Cookie inmediata: el siguiente render server ya usa la zona sin esperar al perfil.
    document.cookie = `tz=${encodeURIComponent(deviceTz)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    void saveUserTimezone(deviceTz);
  }, [savedTz]);

  return null;
}

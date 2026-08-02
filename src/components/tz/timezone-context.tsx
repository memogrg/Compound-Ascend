"use client";

/**
 * Zona horaria del USUARIO en el cliente. El layout (server) la resuelve con
 * `knownUserTz()` —cookie `tz` → user_settings.timezone— y la baja por acá.
 *
 * `null` = todavía no se capturó ninguna (usuario nuevo, antes de que `TimezoneSync`
 * la persista). No es lo mismo que "está en UTC": con null el cliente cae a la zona del
 * DISPOSITIVO, que siempre es mejor que UTC. Ver `captureToday`.
 *
 * Se baja la ZONA, no la fecha ya calculada: en una sesión larga que cruza medianoche una
 * fecha fijada en el render quedaría vieja. Con la zona, cada captura la recalcula.
 */
import { createContext, useCallback, useContext } from "react";

import { captureToday } from "@/lib/time/user-time-core";

const TimezoneContext = createContext<string | null>(null);

export function TimezoneProvider({
  value,
  children,
}: {
  value: string | null;
  children: React.ReactNode;
}) {
  return <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>;
}

/** Zona del perfil, o null si todavía no se conoce. */
export function useUserTimezone(): string | null {
  return useContext(TimezoneContext);
}

/**
 * Devuelve una FUNCIÓN que calcula "hoy" para el default de una captura, no la fecha:
 * así se evalúa al momento de capturar y no en el render (que puede ser de ayer).
 *
 * `override` lo pasan las pantallas que viven fuera del provider (el asistente móvil, que
 * está fuera del grupo (app)); con undefined manda el contexto.
 */
export function useCaptureToday(override?: string | null): () => string {
  const fromContext = useContext(TimezoneContext);
  const tz = override ?? fromContext;
  return useCallback(() => captureToday(tz), [tz]);
}

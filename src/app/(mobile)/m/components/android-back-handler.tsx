"use client";

/**
 * Botón Atrás de Android. No renderiza nada: solo registra el listener nativo.
 *
 * Sin listener, Capacitor hace `history.back()` o cierra la app, y eso se equivoca en
 * tres situaciones: con una hoja o el menú abiertos navega por detrás en vez de
 * cerrarlos; en /m se sale sin aviso, perdiendo lo que hubiera a medio escribir; y con
 * el candado biométrico puesto navega DEBAJO del candado, así que al desbloquear
 * aparece otra pantalla. Registrar un listener desactiva ese comportamiento por
 * defecto y deja la decisión acá.
 *
 * El orden es el que espera quien usa un teléfono Android:
 *  1. Si hay algo encima, Atrás lo cierra. Solo lo de más arriba.
 *  2. Si no, Atrás es Atrás: vuelve en el historial, o al inicio si no hay a dónde.
 *  3. Ya en el inicio, salir exige confirmación: dos toques en menos de dos segundos.
 *
 * Solo Android. En iOS no hay botón Atrás, y `exitApp()` ahí es causal de rechazo.
 */
import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  capacitorApp,
  capacitorPlatform,
  isCapacitor,
  type PluginListenerHandle,
} from "@/lib/capacitor/native";

import { useToast } from "./form-kit/toast";
import { closeTopOverlay } from "../lib/overlay-stack";

/** Ventana para el segundo toque. Dos segundos es lo que usa Android de fábrica. */
const MARGEN_SALIDA_MS = 2000;

export function AndroidBackHandler() {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();

  // Espejos: el listener nativo se registra UNA vez y sobrevive a los cambios de ruta.
  // Sin estos refs leería el pathname del primer render y creería estar siempre en /m.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const ultimoToqueRef = useRef(0);

  useEffect(() => {
    if (!isCapacitor() || capacitorPlatform() !== "android") return;
    const app = capacitorApp();
    if (!app) return;

    // addListener es asíncrono: si el componente se desmonta mientras resuelve, el handle
    // llega cuando ya no hay a quién avisar. `desmontado` lo retira igual.
    let handle: PluginListenerHandle | null = null;
    let desmontado = false;

    void (async () => {
      const h = await app.addListener("backButton", (e) => {
        if (closeTopOverlay()) return;

        if (pathnameRef.current !== "/m") {
          // `canGoBack` lo dice la WebView. Si no hay historial —entrada por deep link,
          // por ejemplo— volver al inicio es mejor que cerrar la app.
          if (e.canGoBack) router.back();
          else router.replace("/m");
          return;
        }

        const ahora = Date.now();
        if (ahora - ultimoToqueRef.current < MARGEN_SALIDA_MS) {
          void app.exitApp();
          return;
        }
        ultimoToqueRef.current = ahora;
        toastRef.current.show("Tocá de nuevo para salir", "info");
      });
      if (desmontado) void h.remove();
      else handle = h;
    })();

    return () => {
      desmontado = true;
      void handle?.remove();
    };
  }, [router]);

  return null;
}

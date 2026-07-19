"use client";

/**
 * Overlay del candado (app-lock) con biometría. Se monta en el layout de /m/(app)
 * para tapar la UI lo antes posible al reanudar. NO es re-login: al desbloquear, la
 * app ya estaba autenticada y sigue tal cual (no se recarga ni se re-loguea).
 *
 * Ciclo de vida (@capacitor/app):
 *  - Cold start: si el flag está activo → bloquea + pide biometría.
 *  - A segundo plano (isActive=false): bloquea YA, para que el overlay cubra incluso
 *    el snapshot del app-switcher y al reanudar no se vea contenido.
 *  - A primer plano (isActive=true) y bloqueado: pide biometría.
 *  - Éxito → oculta. Fallo/cancelación → sigue bloqueado con "Reintentar".
 *
 * Recuperación: "Cerrar sesión" borra el flag y destruye la sesión (no revela la app);
 * evita quedar atrapado si la biometría del sistema quedó inaccesible con el candado activo.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { signOutAction } from "@/lib/auth/actions";

import {
  isNativeApp,
  isAppLockEnabled,
  verifyIdentity,
  clearAppLockFlagForRecovery,
  onAppPause,
  onAppResume,
  isSessionUnlocked,
  markSessionUnlocked,
  clearSessionUnlocked,
  APP_LOCK_EVENT,
} from "../lib/app-lock";
import { isIntroActive, onIntroDone } from "../lib/app-intro";

export function AppLockOverlay() {
  const [enabled, setEnabled] = useState(false); // ¿candado activo?
  const [locked, setLocked] = useState(false); // ¿mostrando overlay?
  const [prompting, setPrompting] = useState(false); // ¿biometría en curso?
  const [failed, setFailed] = useState(false);

  // Refs espejo para leer el estado actual dentro de los listeners nativos sin closures viejos.
  const enabledRef = useRef(false);
  const lockedRef = useRef(false);
  const promptingRef = useRef(false);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);
  useEffect(() => {
    promptingRef.current = prompting;
  }, [prompting]);

  const runUnlock = useCallback(async () => {
    if (promptingRef.current) return; // evita prompts solapados
    setPrompting(true);
    setFailed(false);
    const r = await verifyIdentity();
    setPrompting(false);
    if (r.ok) {
      // La sesión queda desbloqueada: navegar entre pantallas (aunque remonte el layout)
      // ya no vuelve a pedir biometría. Solo un `pause` real la revoca.
      markSessionUnlocked();
      setLocked(false);
      setFailed(false);
    } else {
      setFailed(true);
    }
  }, []);

  // Montaje: lee el flag; si está activo Y la sesión no está ya desbloqueada → bloquea. La
  // biometría se pide apenas termina la intro animada (o de inmediato si no hay intro), para
  // que el orden sea: intro a pantalla completa → candado → app.
  //
  // El guard de sesión es lo que distingue ABRIR la app de simplemente MONTAR el componente:
  // este overlay vive en el layout de /m/(app), y pantallas como el asistente o el perfil
  // financiero están fuera de ese grupo de rutas, así que ir y volver remonta el layout. Sin
  // el guard, cada viaje pedía biometría.
  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    void (async () => {
      const on = await isAppLockEnabled();
      if (cancelled) return;
      setEnabled(on);
      if (!on) return;
      if (isSessionUnlocked()) return; // ya se verificó en esta sesión: solo estamos navegando
      setLocked(true); // tapa la UI ya (bajo la intro); el prompt espera a la intro
      if (isIntroActive()) {
        unsubscribe = onIntroDone(() => {
          if (!cancelled) void runUnlock();
        });
      } else {
        void runUnlock();
      }
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [runUnlock]);

  // El toggle de Configuración avisa cuando el flag cambia (activar/desactivar en vivo).
  useEffect(() => {
    if (!isNativeApp()) return;
    const onChange = (e: Event) => {
      const on = Boolean((e as CustomEvent<{ enabled: boolean }>).detail?.enabled);
      setEnabled(on);
      if (!on) {
        setLocked(false); // al desactivar, no dejamos el overlay puesto
        clearSessionUnlocked();
      } else {
        // Activar el candado ya exigió biometría (enableAppLock la verifica), así que la
        // sesión cuenta como desbloqueada: sin esto, la siguiente navegación —que remonta
        // este overlay— pediría Face ID otra vez de inmediato.
        markSessionUnlocked();
      }
    };
    window.addEventListener(APP_LOCK_EVENT, onChange);
    return () => window.removeEventListener(APP_LOCK_EVENT, onChange);
  }, []);

  // Ciclo de vida: bloquea al irse al fondo; pide biometría al volver.
  //
  // pause/resume, NO appStateChange. appStateChange sale de willResignActive, que dispara
  // cualquier cosa que robe el foco un instante —el propio diálogo de Face ID, un banner de
  // notificación, el Centro de Control, el App Switcher, la cámara del escáner—, así que el
  // candado saltaba sin que la app se hubiera ido a ningún sitio. pause/resume salen de
  // didEnterBackground/willEnterForeground: solo la app yéndose de verdad al fondo
  // (verificado en @capacitor/app/ios/Sources/AppPlugin/AppPlugin.swift).
  //
  // Sin periodo de gracia a propósito: con el evento correcto no hace falta, y salir y
  // volver debe pedir SIEMPRE, aunque hayan pasado dos segundos.
  useEffect(() => {
    if (!isNativeApp()) return;
    const handles: { remove: () => Promise<void> }[] = [];
    let removed = false;
    const keep = (h: { remove: () => Promise<void> }) => {
      if (removed) void h.remove();
      else handles.push(h);
    };
    void (async () => {
      keep(
        await onAppPause(() => {
          if (!enabledRef.current) return;
          // Bloquea YA: así el snapshot del App Switcher sale tapado (privacidad), y la
          // sesión se revoca para que al volver se exija biometría.
          clearSessionUnlocked();
          setFailed(false);
          setLocked(true);
        }),
      );
      keep(
        await onAppResume(() => {
          if (!enabledRef.current) return;
          // La guarda de `prompting` vive dentro de runUnlock: pedir Face ID nunca debe
          // encadenar otro Face ID.
          if (lockedRef.current) void runUnlock();
        }),
      );
    })();
    return () => {
      removed = true;
      for (const h of handles) void h.remove();
    };
  }, [runUnlock]);

  const recover = useCallback(async () => {
    // Escape seguro: borra el flag y cierra sesión (destruye la sesión, no revela datos).
    await clearAppLockFlagForRecovery();
    await signOutAction("/m/login");
  }, []);

  if (!enabled || !locked) return null;

  return (
    <div className="m-lock" role="dialog" aria-modal="true" aria-label="CARTERA+ bloqueado">
      <div className="m-lock-brand">
        <span className="m-lock-badge" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="10" width="16" height="10" rx="2.5" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            <circle cx="12" cy="15" r="1.4" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <div className="m-lock-word">
          CARTERA<span className="m-lock-plus">+</span>
        </div>
        <div className="m-lock-sub">
          {/* El botón ya dice "Verificando…" mientras corre; repetirlo aquí llenaba la
              pantalla de la misma palabra dos veces. El subtítulo dice qué hacer, no en
              qué estado está. */}
          {failed ? "No pudimos verificarte." : "Toca para desbloquear"}
        </div>
      </div>

      <div className="m-lock-actions">
        <button type="button" className="m-btn m-btn-block m-btn-primary" onClick={() => void runUnlock()} disabled={prompting}>
          {prompting ? "Verificando…" : failed ? "Reintentar" : "Desbloquear"}
        </button>
        {failed ? (
          <button type="button" className="m-lock-recover" onClick={() => void recover()} disabled={prompting}>
            ¿Problemas con la biometría? Cerrar sesión
          </button>
        ) : null}
      </div>
    </div>
  );
}

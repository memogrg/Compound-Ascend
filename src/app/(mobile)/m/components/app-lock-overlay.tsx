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
  onAppStateChange,
  APP_LOCK_EVENT,
} from "../lib/app-lock";

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
      setLocked(false);
      setFailed(false);
    } else {
      setFailed(true);
    }
  }, []);

  // Carga inicial (cold start): lee el flag; si está activo → bloquea + pide biometría.
  useEffect(() => {
    if (!isNativeApp()) return;
    let cancelled = false;
    void (async () => {
      const on = await isAppLockEnabled();
      if (cancelled) return;
      setEnabled(on);
      if (on) {
        setLocked(true);
        void runUnlock();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runUnlock]);

  // El toggle de Configuración avisa cuando el flag cambia (activar/desactivar en vivo).
  useEffect(() => {
    if (!isNativeApp()) return;
    const onChange = (e: Event) => {
      const on = Boolean((e as CustomEvent<{ enabled: boolean }>).detail?.enabled);
      setEnabled(on);
      if (!on) setLocked(false); // al desactivar, no dejamos el overlay puesto
    };
    window.addEventListener(APP_LOCK_EVENT, onChange);
    return () => window.removeEventListener(APP_LOCK_EVENT, onChange);
  }, []);

  // Ciclo de vida de la app: bloquea al ir a segundo plano; pide biometría al volver.
  // Usa onAppStateChange de ../lib/app-lock (registerPlugin) — sin dynamic import (colgaba).
  useEffect(() => {
    if (!isNativeApp()) return;
    let handle: { remove: () => Promise<void> } | undefined;
    let removed = false;
    void (async () => {
      const h = await onAppStateChange((isActive) => {
        if (!enabledRef.current) return;
        if (!isActive) {
          // A segundo plano: bloquea inmediatamente (cubre el snapshot del switcher).
          setFailed(false);
          setLocked(true);
        } else if (lockedRef.current) {
          // A primer plano y bloqueado: pide biometría.
          void runUnlock();
        }
      });
      if (removed) void h.remove();
      else handle = h;
    })();
    return () => {
      removed = true;
      void handle?.remove();
    };
  }, [runUnlock]);

  const recover = useCallback(async () => {
    // Escape seguro: borra el flag y cierra sesión (destruye la sesión, no revela datos).
    await clearAppLockFlagForRecovery();
    await signOutAction();
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
          {prompting ? "Verificando…" : failed ? "No pudimos verificarte." : "Toca para desbloquear"}
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

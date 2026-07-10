"use client";

/**
 * Switch "Bloqueo con biometría" para la pantalla de Configuración (/m/perfil).
 * Reutiliza el Toggle del form-kit. Solo aparece dentro de la app nativa de Capacitor
 * (en la web normal se oculta). Activar corre una verificación de prueba (si el
 * dispositivo no tiene biometría, avisa y NO activa); desactivar pide biometría una vez.
 * Toda la lógica vive en ../lib/app-lock (no se duplica).
 */
import { useEffect, useState } from "react";

import { Toggle, useToast } from "./form-kit";
import { isNativeApp, isAppLockEnabled, enableAppLock, disableAppLock } from "../lib/app-lock";

export function AppLockToggle() {
  const toast = useToast();
  const [mounted, setMounted] = useState(false); // evita mismatch de hidratación (SSR → null)
  const [native, setNative] = useState(false);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMounted(true);
    const n = isNativeApp();
    setNative(n);
    if (n) void isAppLockEnabled().then(setOn);
  }, []);

  if (!mounted || !native) return null;

  const toggle = async (next: boolean) => {
    if (busy) return;
    setBusy(true);
    const res = next ? await enableAppLock() : await disableAppLock();
    setBusy(false);
    if (res.ok) {
      setOn(next);
      toast.show(next ? "Candado activado" : "Candado desactivado", "success");
    } else {
      // No tocamos `on`: el switch (controlado por `value`) permanece en su estado real.
      toast.show(res.message ?? "No se pudo cambiar el candado.", "error");
    }
  };

  return (
    <div className="card card-p" style={{ marginBottom: 14 }}>
      <div className="ov" style={{ marginBottom: 6 }}>
        Seguridad
      </div>
      <Toggle
        name="appLock"
        label="Bloqueo con biometría (Face ID / huella)"
        value={on}
        onChange={(v) => void toggle(v)}
        hint="Pide tu biometría al abrir o reanudar la app. No cierra tu sesión; solo bloquea la pantalla."
      />
    </div>
  );
}

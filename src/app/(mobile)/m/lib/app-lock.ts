/**
 * Candado local (app-lock) con biometría para la app híbrida (Capacitor).
 *
 * IMPORTANTE: NO es re-login. La sesión del WebView y de Supabase se MANTIENE;
 * esto solo tapa la UI ya autenticada con una pantalla de bloqueo hasta que el
 * usuario pase Face ID / huella (o la credencial del dispositivo como fallback).
 *
 * Acceso a los plugins nativos vía `registerPlugin` de @capacitor/core (SSR-safe: solo
 * crea un proxy en import; no ejecuta nada hasta llamarlo). Se usan los plugins YA
 * registrados por Capacitor ("BiometricAuthNative" y "Preferences") en lugar de los
 * wrappers JS: el `await import(...)` dinámico del wrapper @aparajita NO resuelve en el
 * WebView con remote URL y cuelga el toggle sin logs. Las llamadas siguen guardadas por
 * `isNativeApp()`, así que el candado solo aplica dentro del contenedor nativo.
 */
import { registerPlugin } from "@capacitor/core";

/** Clave del flag persistido en @capacitor/preferences. */
export const APP_LOCK_KEY = "appLock.enabled";

/** Evento in-app para que el overlay reaccione al cambiar el flag desde el toggle. */
export const APP_LOCK_EVENT = "cartera:applock";

type CapacitorGlobal = { isNativePlatform?: () => boolean };

/** ¿Estamos dentro del contenedor nativo de Capacitor? En la web normal → false. */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

// Interfaces locales mínimas de los plugins NATIVOS ya registrados por Capacitor.
interface BiometricAuthNativePlugin {
  checkBiometry(): Promise<{
    isAvailable: boolean;
    strongBiometryIsAvailable?: boolean;
    deviceIsSecure?: boolean;
    biometryType?: number;
    code?: string;
    reason?: string;
  }>;
  authenticate(options: {
    reason?: string;
    cancelTitle?: string;
    allowDeviceCredential?: boolean;
    androidTitle?: string;
    androidSubtitle?: string;
    iosFallbackTitle?: string;
  }): Promise<void>;
}

interface PreferencesPlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
}

interface AppLifecyclePlugin {
  addListener(
    event: "appStateChange",
    listener: (state: { isActive: boolean }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

// Proxies a los plugins nativos por su nombre registrado (probado: el objeto
// Capacitor.Plugins.BiometricAuthNative funciona de punta a punta en el emulador).
// registerPlugin solo crea el proxy en import → SSR-safe; el bridge se resuelve al llamar.
const BiometricAuthNative = registerPlugin<BiometricAuthNativePlugin>("BiometricAuthNative");
const Preferences = registerPlugin<PreferencesPlugin>("Preferences");
const AppLifecycle = registerPlugin<AppLifecyclePlugin>("App");

/**
 * Suscribe el cambio de estado de la app (foreground/background). Centraliza el acceso
 * al plugin App para que el overlay NO haga su propio dynamic import (que también colgaba).
 */
export function onAppStateChange(
  cb: (isActive: boolean) => void,
): Promise<{ remove: () => Promise<void> }> {
  return AppLifecycle.addListener("appStateChange", ({ isActive }) => cb(isActive));
}

/** Lee el flag persistido nativamente (false si no es la app nativa o falla). */
export async function isAppLockEnabled(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { value } = await Preferences.get({ key: APP_LOCK_KEY });
    return value === "true";
  } catch {
    return false;
  }
}

/** Persiste el flag. Uso interno (enable/disable lo hacen tras verificar biometría). */
async function writeFlag(enabled: boolean): Promise<void> {
  if (enabled) await Preferences.set({ key: APP_LOCK_KEY, value: "true" });
  else await Preferences.remove({ key: APP_LOCK_KEY });
}

/**
 * Borra el flag SIN pedir biometría. Solo para el modo de recuperación del overlay,
 * que además cierra la sesión: no revela la app (destruye la sesión), así que es un
 * escape seguro si la biometría del sistema quedó inaccesible con el candado activo.
 */
export async function clearAppLockFlagForRecovery(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await writeFlag(false);
  } catch {
    /* best-effort */
  }
}

/** Notifica a los listeners (overlay) que el flag cambió. */
function notifyChanged(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(APP_LOCK_EVENT, { detail: { enabled } }));
}

/**
 * Diagnóstico de biometría surfaceado a la UI (para ver la razón exacta sin Logcat).
 * `available` es el gate REAL de seguridad; el resto son señales del plugin para el
 * mensaje/log (no cambian el comportamiento, solo lo explican).
 */
export type BiometryDiagnostic = {
  available: boolean;
  reason: string;
  code: string;
  biometryType: number;
  strongBiometryIsAvailable: boolean;
  deviceIsSecure: boolean;
};

// Tipo PARCIAL local para leer el resultado de checkBiometry() de forma defensiva
// (por si en algún dispositivo/versión del plugin falta una prop). Evita `any`.
type BiometryProbe = {
  isAvailable?: boolean;
  reason?: string;
  code?: string;
  biometryType?: number;
  strongBiometryIsAvailable?: boolean;
  deviceIsSecure?: boolean;
};

/** ¿El dispositivo tiene biometría disponible y enrolada? Devuelve diagnóstico completo. */
export async function checkBiometryAvailable(): Promise<BiometryDiagnostic> {
  if (!isNativeApp()) {
    return {
      available: false,
      reason: "No es la app nativa.",
      code: "not-native",
      biometryType: 0,
      strongBiometryIsAvailable: false,
      deviceIsSecure: false,
    };
  }
  try {
    const r: BiometryProbe = await BiometricAuthNative.checkBiometry();
    console.warn("[app-lock] checkBiometry", r);
    return {
      available: r.isAvailable ?? false,
      reason: r.reason ?? "",
      code: r.code ?? "",
      biometryType: r.biometryType ?? 0,
      strongBiometryIsAvailable: r.strongBiometryIsAvailable ?? false,
      deviceIsSecure: r.deviceIsSecure ?? false,
    };
  } catch (e) {
    console.warn("[app-lock] checkBiometry error", e);
    const err = e as { code?: string; message?: string };
    return {
      available: false,
      reason: err.message ?? (e instanceof Error ? e.message : "?"),
      code: err.code ?? "check-failed",
      biometryType: 0,
      strongBiometryIsAvailable: false,
      deviceIsSecure: false,
    };
  }
}

/** Versión mayor de Android desde el user-agent del WebView (null si no es Android). */
function androidMajorVersion(): number | null {
  if (typeof navigator === "undefined") return null;
  const m = /Android (\d+)/.exec(navigator.userAgent);
  if (!m || !m[1]) return null;
  return parseInt(m[1], 10);
}

/**
 * ¿Permitir el fallback a la credencial del dispositivo (PIN/patrón/passcode)?
 *
 * Android 10 y anteriores (API ≤ 29) tienen un bug conocido de BiometricPrompt con
 * BIOMETRIC_STRONG|DEVICE_CREDENTIAL: la huella aparece pero NO completa la
 * autenticación (visto en Huawei/EMUI, p. ej. P30 con Android 10). Por eso el fallback
 * a credencial solo se habilita en Android 11+ (API 30+); en Android ≤ 10 la biometría
 * va sola (enable y verify). En iOS/web no aplica el bug → fallback permitido. Si aun
 * así no se puede autenticar, el escape es la recuperación por logout del overlay.
 */
function deviceCredentialAllowed(): boolean {
  const android = androidMajorVersion();
  return android === null || android >= 11;
}

// Opciones de la verificación. `allowDeviceCredential` se decide por plataforma/versión.
function authOptions() {
  const allowDeviceCredential = deviceCredentialAllowed();
  return {
    reason: "Desbloquea CARTERA+",
    cancelTitle: "Cancelar",
    allowDeviceCredential,
    androidTitle: "CARTERA+ bloqueado",
    androidSubtitle: allowDeviceCredential
      ? "Usa tu biometría o el bloqueo del dispositivo"
      : "Usa tu biometría",
    iosFallbackTitle: "Usar código",
  };
}

/** Corre la verificación biométrica. `ok=true` si autenticó; si no, incluye code + message. */
export async function verifyIdentity(): Promise<{ ok: boolean; code?: string; message?: string }> {
  if (!isNativeApp()) return { ok: false, code: "not-native" };
  try {
    await BiometricAuthNative.authenticate(authOptions());
    return { ok: true };
  } catch (e) {
    console.warn("[app-lock] authenticate error", e);
    const err = e as { code?: string; message?: string };
    return {
      ok: false,
      code: err.code ?? "unknown",
      message: err.message ?? (e instanceof Error ? e.message : undefined),
    };
  }
}

/**
 * Activa el candado: exige biometría disponible + una verificación de PRUEBA, y solo
 * si pasa persiste el flag. Si el dispositivo no tiene biometría/enrolamiento, NO se
 * activa (el flag nunca se guarda → la app no queda inaccesible).
 */
export async function enableAppLock(): Promise<{ ok: boolean; message?: string }> {
  const avail = await checkBiometryAvailable();
  if (!avail.available) {
    return {
      ok: false,
      message: `Biometría no disponible: ${avail.reason || "sin detalle"} [code=${avail.code}, strong=${avail.strongBiometryIsAvailable}, secure=${avail.deviceIsSecure}]`,
    };
  }
  const v = await verifyIdentity();
  if (!v.ok) {
    return { ok: false, message: `No se pudo verificar: ${v.message ?? "sin detalle"} [code=${v.code}]` };
  }
  await writeFlag(true);
  notifyChanged(true);
  return { ok: true };
}

/** Desactiva el candado: pide biometría una vez y borra el flag. */
export async function disableAppLock(): Promise<{ ok: boolean; message?: string }> {
  const v = await verifyIdentity();
  if (!v.ok) return { ok: false, message: "No se pudo verificar tu identidad." };
  await writeFlag(false);
  notifyChanged(false);
  return { ok: true };
}

"use client";

/**
 * Login con Google NATIVO para la app Capacitor (iOS/Android), vía @capgo/capacitor-social-login.
 *
 * Flujo (guía Supabase + Capgo): el plugin abre el selector de cuenta NATIVO y devuelve un
 * `idToken` de Google; lo canjeamos con `supabase.auth.signInWithIdToken`. Nonce anti-replay: a
 * Google se le pasa el nonce HASHEADO (SHA-256) y a Supabase el nonce RAW (Supabase re-hashea y
 * compara). El plugin vive en el shell nativo; aquí lo llamamos por el puente window.Capacitor.
 *
 * Solo aplica dentro de la app (isCapacitor). En web este módulo no se usa (el botón deja el
 * flujo OAuth existente). Client IDs = públicos (no secretos), iguales para cualquier usuario.
 */
import { createClient } from "@/lib/supabase/client";
import { capacitorSocialLogin } from "@/lib/capacitor/native";
import {
  isCancel,
  randomNonce,
  sha256hex,
  type NativeLoginResult,
} from "@/lib/capacitor/social-login-init";

// La inicialización del plugin, el nonce y la heurística de cancelación se mudaron a
// social-login-init.ts cuando entró Apple: no son de Google, son del plugin. Se re-exportan
// desde acá para no mover el import de quien ya los usaba.
export { initSocialLogin, type NativeLoginResult } from "@/lib/capacitor/social-login-init";

/**
 * Abre el login Google nativo y canjea el idToken con Supabase. Reintenta UNA vez tras logout
 * (limpia el caché de token de iOS que documenta Capgo). No reintenta si el usuario canceló.
 */
export async function nativeGoogleLogin(): Promise<NativeLoginResult> {
  const plugin = capacitorSocialLogin();
  if (!plugin) return { ok: false, error: "Abre la app instalada para entrar con Google." };

  try {
    await attempt(plugin);
    console.log("[google-native] done");
    return { ok: true };
  } catch (e1) {
    if (isCancel(e1)) return { ok: false, cancelled: true, error: "" };
    console.log("[google-native] retry");
    // Reintento: attempt() ya hace logout ANTES del login → idToken fresco (evita el caché de iOS).
    try {
      await attempt(plugin);
      console.log("[google-native] done");
      return { ok: true };
    } catch (e2) {
      if (isCancel(e2)) return { ok: false, cancelled: true, error: "" };
      return { ok: false, error: "No pudimos iniciar sesión con Google. Inténtalo de nuevo." };
    }
  }
}

/**
 * Un intento completo: logout → login nativo → signInWithIdToken. Lanza si algo falla.
 * El logout previo fuerza a iOS a mostrar el selector de cuenta FRESCO y no reusar en silencio
 * una sesión/idToken viejo cacheado. Los console.log "[google-native]" permiten leer el flujo en
 * la consola de Xcode / adb logcat.
 */
async function attempt(
  plugin: NonNullable<ReturnType<typeof capacitorSocialLogin>>,
): Promise<void> {
  console.log("[google-native] login:start");
  try {
    await plugin.logout({ provider: "google" });
  } catch {
    // Sin sesión previa del plugin: se ignora.
  }
  const rawNonce = randomNonce();
  const hashedNonce = await sha256hex(rawNonce);
  const res = await plugin.login({ provider: "google", options: { nonce: hashedNonce } });
  const idToken = res?.result?.idToken;
  if (!idToken) {
    console.log("[google-native] idToken:missing");
    throw new Error("google: sin idToken");
  }
  console.log("[google-native] idToken:ok");
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
    nonce: rawNonce,
  });
  if (error) {
    console.log("[google-native] signInWithIdToken:error", error.message);
    throw error;
  }
  console.log("[google-native] signInWithIdToken:ok");
}

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

// Client IDs públicos (Google Cloud Console, Fase 1). Compartidos por todos los usuarios.
const GOOGLE_IOS_CLIENT_ID =
  "127034942043-g6vhs1cte531dmjq1c5dibh80peae6rp.apps.googleusercontent.com";
// serverClientId (Web Client ID): lo usa Android como serverClientId y iOS para el token.
const GOOGLE_WEB_CLIENT_ID =
  "127034942043-kmc98j64ugbfbe1lihnkoc2c73kve192.apps.googleusercontent.com";

let initialized = false;

/** Inicializa el plugin una sola vez (idempotente). No-op fuera de la app nativa. */
export async function initSocialLogin(): Promise<void> {
  if (initialized) return;
  const plugin = capacitorSocialLogin();
  if (!plugin) return;
  try {
    await plugin.initialize({
      google: {
        iOSClientId: GOOGLE_IOS_CLIENT_ID,
        webClientId: GOOGLE_WEB_CLIENT_ID,
        mode: "online",
      },
    });
    initialized = true;
  } catch (e) {
    // No bloquea el arranque; si falta init, el login devolverá error y el usuario reintenta.
    console.warn("[google-native] initialize error", e);
  }
}

export type NativeLoginResult = { ok: true } | { ok: false; cancelled?: boolean; error: string };

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
async function attempt(plugin: NonNullable<ReturnType<typeof capacitorSocialLogin>>): Promise<void> {
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

/** Nonce raw aleatorio (32 bytes en hex). Web Crypto disponible en la WebView (contexto seguro). */
function randomNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/** SHA-256 del nonce raw, en hex (lo que se pasa a Google). */
async function sha256hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(new Uint8Array(digest));
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/** Heurística de cancelación del usuario (no mostrar error ni reintentar el selector). */
function isCancel(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e ?? "")).toLowerCase();
  return (
    m.includes("cancel") ||
    m.includes("cancell") ||
    m.includes("dismiss") ||
    m.includes("12501") || // Android: SIGN_IN_CANCELLED
    m.includes("the user canceled")
  );
}

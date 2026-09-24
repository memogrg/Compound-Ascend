"use client";

/**
 * Plomería compartida por los dos logins nativos (Google y Apple) de la app Capacitor.
 *
 * Vive aparte porque no es de ningún proveedor: el plugin @capgo se inicializa UNA vez
 * para todos, el nonce anti-replay se arma igual para los dos, y la heurística de
 * "el usuario canceló" es la misma. Tenerlo en google-native.ts obligaría a que el login
 * de Apple importara del de Google, que no tiene ningún sentido.
 */
import { capacitorPlatform, capacitorSocialLogin } from "@/lib/capacitor/native";

// Client IDs públicos (Google Cloud Console, Fase 1). Compartidos por todos los usuarios.
const GOOGLE_IOS_CLIENT_ID =
  "127034942043-g6vhs1cte531dmjq1c5dibh80peae6rp.apps.googleusercontent.com";
// serverClientId (Web Client ID): lo usa Android como serverClientId y iOS para el token.
const GOOGLE_WEB_CLIENT_ID =
  "127034942043-kmc98j64ugbfbe1lihnkoc2c73kve192.apps.googleusercontent.com";

let initialized = false;

/**
 * Inicializa el plugin una sola vez (idempotente). No-op fuera de la app nativa.
 *
 * Apple se declara SOLO en iOS: en Android el plugin haría el flujo web de Apple, que
 * necesita Services ID y redirectUrl a un backend, y eso no está montado. `redirectUrl: ""`
 * es lo que la propia librería documenta para iOS ("Use empty string '' for iOS to prevent
 * redirect"), y `clientId` no hace falta porque usa el bundle id de la app.
 */
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
      ...(capacitorPlatform() === "ios" ? { apple: { redirectUrl: "" } } : {}),
    });
    initialized = true;
  } catch (e) {
    // No bloquea el arranque; si falta init, el login devolverá error y el usuario reintenta.
    console.warn("[social-login] initialize error", e);
  }
}

/** Resultado de un login nativo, igual para Google y Apple. */
export type NativeLoginResult = { ok: true } | { ok: false; cancelled?: boolean; error: string };

/** Nonce raw aleatorio (32 bytes en hex). Web Crypto disponible en la WebView (contexto seguro). */
export function randomNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/**
 * SHA-256 del nonce raw, en hex. Es lo que se le pasa AL PROVEEDOR; a Supabase va el raw,
 * que re-hashea y compara. Ninguno de los dos proveedores hashea por su cuenta: en iOS el
 * plugin asigna `request.nonce = nonce` literal (AppleProvider.swift), así que si mandáramos
 * el raw a los dos, Supabase compararía hash contra raw y el canje fallaría.
 */
export async function sha256hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return toHex(new Uint8Array(digest));
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * ¿El usuario canceló? Entonces no se muestra error ni se reintenta el selector.
 *
 * Es una heurística sobre el MENSAJE porque el código no llega: el plugin hace
 * `call.reject(error.localizedDescription)` y el bridge de Capacitor entrega solo texto. En
 * Apple eso es la descripción de `ASAuthorizationError.canceled`, localizada por el sistema
 * — "The user canceled the request." o "El usuario canceló la solicitud." —, y las dos
 * contienen "cancel".
 */
export function isCancel(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e ?? "")).toLowerCase();
  return (
    m.includes("cancel") ||
    m.includes("cancell") ||
    m.includes("dismiss") ||
    m.includes("12501") || // Android: SIGN_IN_CANCELLED
    m.includes("the user canceled")
  );
}

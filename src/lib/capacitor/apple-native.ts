"use client";

/**
 * Sign in with Apple NATIVO para la app Capacitor en iOS, vía @capgo/capacitor-social-login.
 *
 * Existe por obligación: Apple 4.8 exige ofrecer Sign in with Apple en cuanto la app ofrece
 * otro login social, y nosotros ofrecemos Google.
 *
 * Flujo, igual que Google: el plugin abre la hoja nativa del sistema y devuelve un `idToken`
 * de Apple, que se canjea con `supabase.auth.signInWithIdToken`. El nonce anti-replay va
 * HASHEADO al plugin y RAW a Supabase, que re-hashea y compara. El plugin NO hashea por su
 * cuenta —en iOS asigna `request.nonce = nonce` literal—, así que mandarle el raw haría que
 * Supabase comparase hash contra raw y el canje fallaría.
 *
 * Solo iOS. En Android el flujo de Apple sería el web, que necesita Services ID y un
 * redirectUrl a un backend; nada de eso está montado, y el botón ni siquiera se renderiza.
 *
 * Sin el reintento tras logout que sí tiene Google: ese existe para el caché de idToken de
 * Google en iOS, y Apple no lo tiene.
 */
import { createClient } from "@/lib/supabase/client";
import { capacitorSocialLogin } from "@/lib/capacitor/native";
import {
  isCancel,
  randomNonce,
  sha256hex,
  type NativeLoginResult,
} from "@/lib/capacitor/social-login-init";
import { setDisplayNameFromProviderAction } from "@/modules/account/api/actions";

export async function nativeAppleLogin(): Promise<NativeLoginResult> {
  const plugin = capacitorSocialLogin();
  if (!plugin) return { ok: false, error: "Abre la app instalada para entrar con Apple." };

  try {
    console.log("[apple-native] login:start");
    const rawNonce = randomNonce();
    const hashedNonce = await sha256hex(rawNonce);
    const res = await plugin.login({
      provider: "apple",
      options: { nonce: hashedNonce, scopes: ["name", "email"] },
    });

    const idToken = res?.result?.idToken;
    if (!idToken) {
      console.log("[apple-native] idToken:missing");
      return { ok: false, error: "No pudimos iniciar sesión con Apple. Inténtalo de nuevo." };
    }
    console.log("[apple-native] idToken:ok");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithIdToken({
      provider: "apple",
      token: idToken,
      nonce: rawNonce,
    });
    if (error) {
      console.log("[apple-native] signInWithIdToken:error", error.message);
      return { ok: false, error: "No pudimos iniciar sesión con Apple. Inténtalo de nuevo." };
    }
    console.log("[apple-native] signInWithIdToken:ok");

    await guardarNombreDeApple(res?.result?.profile);
    return { ok: true };
  } catch (e) {
    if (isCancel(e)) return { ok: false, cancelled: true, error: "" };
    console.log("[apple-native] error", e);
    return { ok: false, error: "No pudimos iniciar sesión con Apple. Inténtalo de nuevo." };
  }
}

/**
 * Apple manda el nombre UNA SOLA VEZ: en el primer login de cada Apple ID. Si se pierde, no
 * vuelve — reinstalar la app no alcanza, hay que revocar el acceso desde Ajustes. Por eso se
 * guarda apenas llega, y por eso la action de destino nunca pisa un nombre ya puesto.
 *
 * Best-effort: el login ya está hecho y es válido. Que el nombre no se guarde es feo, no
 * roto, y fallar acá dejaría a la persona fuera de una sesión que el servidor ya le dio.
 */
async function guardarNombreDeApple(
  profile: {
    givenName?: string | null;
    familyName?: string | null;
  } | null = null,
): Promise<void> {
  const givenName = profile?.givenName ?? "";
  const familyName = profile?.familyName ?? "";
  if (!givenName && !familyName) return;
  try {
    await setDisplayNameFromProviderAction({ givenName, familyName });
  } catch (e) {
    console.log("[apple-native] display_name:skip", e);
  }
}

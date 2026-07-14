import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * LEGACY / FALLBACK: login Google por NAVEGADOR del sistema. Reemplazado por el login NATIVO por
 * idToken (@capgo/capacitor-social-login; ver src/lib/capacitor/google-native.ts). Se conserva como
 * fallback para apps sin el plugin y como camino web; pendiente de decidir su borrado.
 *
 * Inicio de OAuth Google para la app Capacitor (flujo nativo).
 *
 * A diferencia de `signInWithGoogleAction` (que hace redirect() del navegador, lo cual
 * Google BLOQUEA dentro de una WebView), aquí pedimos la URL con `skipBrowserRedirect`
 * y la devolvemos como JSON para que /m/login la abra en el navegador del SISTEMA.
 *
 * Efecto clave: al ejecutarse como Route Handler, `signInWithOAuth` (PKCE) escribe el
 * `code_verifier` en una cookie de ESTA respuesta → queda en el cookie jar del WebView.
 * Más tarde `/auth/callback` (navegación same-origin del WebView) lee esa cookie para
 * `exchangeCodeForSession`. Por eso ambos extremos deben ser requests del WebView.
 *
 * `redirectTo` = deep link registrado en el shell nativo (AndroidManifest / Info.plist)
 * y en la allowlist de Redirect URLs de Supabase. El `next` NO viaja por Supabase: lo
 * agrega el WebView al construir la URL de /auth/callback tras recibir el deep link.
 */
export const runtime = "nodejs";

const NATIVE_REDIRECT = "com.compoundascend.cartera://auth-callback";

/** Solo rutas internas ("/algo"), nunca "//externo". Default /m para el móvil. */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/m";
  return next;
}

export async function GET(request: Request) {
  const next = safeNext(new URL(request.url).searchParams.get("next"));

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true },
  });

  if (error || !data?.url) {
    logger.error("OAuth Google nativo: init fallido", { code: error?.code });
    return NextResponse.json({ error: "oauth_init_failed" }, { status: 502 });
  }

  return NextResponse.json({ url: data.url, next });
}

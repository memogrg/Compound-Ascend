/**
 * Callback de autenticación: intercambia el `code` (OAuth / enlaces de email)
 * por una sesión y redirige a `next` (validado para evitar open-redirects).
 */
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import { attributeReferralFromCookie } from "@/lib/referrals/service";
import { safeInternalPath } from "@/lib/security/safe-redirect";

export const runtime = "nodejs";

/**
 * A dónde mandar cuando la autenticación no prosperó. El móvil tiene su propia
 * pantalla de entrada: mandarlo a `/login` lo sacaría del shell nativo.
 */
function rutaDeError(next: string): string {
  return next === "/m" || next.startsWith("/m/") ? "/m/login?error=auth" : "/login?error=auth";
}

const pendingCallbackExchange = new Map<string, Promise<NextResponse>>();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeInternalPath(url.searchParams.get("next"), "/dashboard");

  if (!code) {
    return NextResponse.redirect(new URL(rutaDeError(next), url.origin));
  }

  if (pendingCallbackExchange.has(code)) {
    return pendingCallbackExchange.get(code)!;
  }

  const exchangePromise = handleCallbackExchange(url, code, next);
  pendingCallbackExchange.set(code, exchangePromise);

  try {
    return await exchangePromise;
  } finally {
    pendingCallbackExchange.delete(code);
  }
}

async function handleCallbackExchange(url: URL, code: string, next: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    logger.warn("exchangeCodeForSession fallido", {
      code: error.code,
      message: error.message,
    });

    // Código ya consumido: el caso LEGÍTIMO es abrir dos veces el enlace del correo
    // —o el prefetch del cliente de correo adelantándose—, y ahí la sesión ya existe
    // de la primera vez. Antes se redirigía a `next` sin comprobar nada, así que un
    // `code` inventado con un `next` hostil servía de trampolín con la pinta de un
    // enlace nuestro. Ahora el pase lo da la SESIÓN, no el mensaje de error.
    const yaConsumido =
      error.status === 400 ||
      error.message?.toLowerCase().includes("already been used") ||
      error.message?.toLowerCase().includes("invalid grant");

    if (yaConsumido) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) return NextResponse.redirect(new URL(next, url.origin));
    }

    return NextResponse.redirect(new URL(rutaDeError(next), url.origin));
  }

  // Atribución del referido: acá es donde converge TODO camino de alta (OAuth de
  // Google y el enlace de confirmación por correo pasan por este mismo
  // callback), y es el primer punto en el que la cuenta ya existe. La cookie
  // sobrevivió el viaje a Google porque es `sameSite: lax`.
  //
  // `await` y no fire-and-forget: en serverless la respuesta termina el proceso
  // y una promesa suelta se cancelaría a mitad. No puede lanzar —devuelve un
  // resultado, nunca throw— así que no arriesga el login.
  const attribution = await attributeReferralFromCookie();
  if (attribution === "atribuido") logger.info("referido atribuido");

  return NextResponse.redirect(new URL(next, url.origin));
}

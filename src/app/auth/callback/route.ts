/**
 * Callback de autenticación: intercambia el `code` (OAuth / enlaces de email)
 * por una sesión y redirige a `next` (validado para evitar open-redirects).
 */
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/** Solo permitimos redirecciones internas (mismo sitio). */
function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

const pendingCallbackExchange = new Map<string, Promise<NextResponse>>();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=auth", url.origin));
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

    if (
      error.status === 400 ||
      error.message?.toLowerCase().includes("already been used") ||
      error.message?.toLowerCase().includes("invalid grant")
    ) {
      return NextResponse.redirect(new URL(next, url.origin));
    }

    return NextResponse.redirect(new URL("/login?error=auth", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/** Rutas públicas de PÁGINA (no requieren sesión). */
const PUBLIC_PREFIXES = ["/login", "/signup", "/reset-password", "/auth"];
/** Rutas de autenticación: si ya hay sesión, redirigir al panel. */
const AUTH_PAGES = ["/login", "/signup", "/reset-password"];

function isPublic(pathname: string): boolean {
  // Las rutas /api gestionan su propia autenticación y responden JSON; el
  // middleware nunca debe redirigirlas a /login (rompería los fetch).
  if (pathname.startsWith("/api/")) return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * Refresca la sesión y aplica protección de rutas.
 * Si Supabase no está configurado (env vacío en dev), deja pasar todo.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANTE: getUser() revalida el token con el servidor de Auth.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", pathname);
    return NextResponse.redirect(redirect);
  }

  if (user && AUTH_PAGES.includes(pathname)) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/dashboard";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }

  return response;
}

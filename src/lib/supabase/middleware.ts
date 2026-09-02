import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { isValidReferralCode, normalizeReferralCode } from "@/lib/referrals/code";
import { REFERRAL_COOKIE, referralCookieOptions } from "@/lib/referrals/cookie";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/** Rutas públicas de PÁGINA (no requieren sesión). */
// `/invitacion` debe ser pública: el invitado sin sesión llega por el enlace del
// correo y la propia página decide si pedir registro/login o aceptar.
// `/m` = grupo móvil (app híbrida). Su propio layout (mobile)/m/(app) es dueño de
// la guarda de sesión y redirige a /m/login cuando no hay sesión; el middleware no
// debe interceptarlo hacia /login (rompería el flujo de auth del móvil). Ninguna ruta
// web existente empieza con "/m/" ni es exactamente "/m" (p. ej. "/mi-perfil…" no
// coincide), así que este prefijo no afecta a la web.
// `/v2` es la vitrina del landing nuevo mientras convive con el viejo: es una página de
// marketing, así que tiene que verse sin sesión igual que la raíz. Cuando el v2 reemplace
// a `/`, este prefijo se va con la ruta.
const PUBLIC_PREFIXES = [
  "/login",
  "/signup",
  "/reset-password",
  "/auth",
  "/invitacion",
  "/m",
  "/v2",
];
/** Rutas de autenticación: si ya hay sesión, redirigir al panel. */
const AUTH_PAGES = ["/login", "/signup", "/reset-password"];

function isPublic(pathname: string): boolean {
  // Las rutas /api gestionan su propia autenticación y responden JSON; el
  // middleware nunca debe redirigirlas a /login (rompería los fetch).
  if (pathname.startsWith("/api/")) return true;
  // La raíz es la landing pública; page.tsx redirige a /dashboard si hay sesión.
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/**
 * Captura `?ref=CODE` en una cookie.
 *
 * Vive en el middleware —y no en la página de signup— por dos razones. La
 * primera es técnica: un Server Component no puede escribir cookies durante el
 * render, y el middleware sí, sobre la respuesta. La segunda es de cobertura:
 * acá el código se captura ENTRE en la ruta que entre (web `/signup`, móvil
 * `/m/signup` o la landing), sin repetir la lógica en cada una.
 *
 * Solo escribe si el código tiene forma válida: así un `?ref=` con basura no
 * pisa una atribución legítima previa.
 */
function captureReferral(request: NextRequest, response: NextResponse): void {
  const raw = request.nextUrl.searchParams.get("ref");
  if (!raw) return;
  const code = normalizeReferralCode(raw);
  if (!isValidReferralCode(code)) return;
  response.cookies.set(
    REFERRAL_COOKIE,
    code,
    referralCookieOptions(process.env.NODE_ENV === "production"),
  );
}

/**
 * Refresca la sesión y aplica protección de rutas.
 * Si Supabase no está configurado (env vacío en dev), deja pasar todo.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    const passthrough = NextResponse.next({ request });
    captureReferral(request, passthrough);
    return passthrough;
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
    const res = NextResponse.redirect(redirect);
    captureReferral(request, res);
    return res;
  }

  if (user && AUTH_PAGES.includes(pathname)) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/dashboard";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }

  captureReferral(request, response);
  return response;
}

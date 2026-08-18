import "server-only";

/**
 * Cliente Supabase para Server Components / Server Actions / Route Handlers.
 * Lee y escribe la sesión vía cookies de Next. Sujeto a RLS.
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/supabase/database.types";
import { getSimAuthContext } from "@/lib/auth/sim-auth";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function createSupabaseServerClient() {
  // Precedencia: la sesión por COOKIE (request scope real) SIEMPRE gana. `cookies()` lanza
  // fuera de un request scope; SOLO ahí (headless/test) se cae al AuthContext ambiente del
  // ALS (withSimAuth). En prod siempre hay request scope → el ALS se ignora → byte-idéntico.
  let cookieStore: Awaited<ReturnType<typeof cookies>>;
  try {
    cookieStore = await cookies();
  } catch (err) {
    const sim = getSimAuthContext();
    if (sim) return sim.db;
    throw err;
  }
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Llamado desde un Server Component (no puede escribir cookies):
            // el middleware se encarga de refrescar la sesión. Se ignora.
          }
        },
      },
    },
  );
}

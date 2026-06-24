import "server-only";

/**
 * Contexto de autorización inyectable para reusar la lógica de datos tanto en el
 * camino con SESIÓN (cookies + RLS) como en el camino SIN sesión (cron/push con
 * cliente service-role + userId explícito).
 *
 * Regla de oro: si `ctx` es undefined, resolveAuth() se comporta EXACTAMENTE como
 * hoy (requireUser + createSupabaseServerClient), así la rama de sesión queda
 * byte-idéntica. Cuando se inyecta `ctx`, el cliente service-role bypassa RLS, por
 * lo que TODA query debe filtrar SIEMPRE por `userId` explícito.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";

export type AuthContext = {
  db: SupabaseClient<Database>;
  userId: string;
};

/** Resuelve {db, userId}: del ctx inyectado o, si no hay, de la sesión actual. */
export async function resolveAuth(ctx?: AuthContext): Promise<AuthContext> {
  if (ctx) return ctx;
  const user = await requireUser();
  const db = await createSupabaseServerClient();
  return { db, userId: user.id };
}

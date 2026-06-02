import "server-only";

/**
 * Cliente Supabase con SERVICE ROLE — omite RLS. Uso EXCLUSIVO de backend para
 * operaciones controladas (contadores de IA/tokens, auditoría, webhooks).
 *
 * Reglas:
 * - Nunca importar desde el cliente (protegido por "server-only").
 * - Nunca exponer la key. No usar para operaciones que deban respetar RLS.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { getServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";

export function createServiceRoleClient() {
  const env = getServerEnv();
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new AppError("INTERNAL", undefined, "SUPABASE_SERVICE_ROLE_KEY ausente");
  }
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

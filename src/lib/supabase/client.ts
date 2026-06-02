"use client";

/**
 * Cliente Supabase para el navegador (sujeto a RLS con la sesión del usuario).
 * Usa la anon key pública; nunca toca secretos.
 */
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";
import { getClientEnv } from "@/lib/env";

export function createClient() {
  const env = getClientEnv();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

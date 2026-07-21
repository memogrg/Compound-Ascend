import "server-only";

/**
 * Estilo de vida DESEADO mensual (insumo del número de libertad). Es dato
 * PERSONAL — vive en personal_profiles.extra del usuario, NO se comparte con el
 * hogar. Read-modify-write para no pisar otras claves de `extra`.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";

const KEY = "desiredMonthlyLifestyle";

export async function getDesiredMonthlyLifestyle(): Promise<number | null> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("personal_profiles")
    .select("extra")
    .eq("user_id", user.id)
    .maybeSingle();
  const v = (data?.extra as Record<string, unknown> | null)?.[KEY];
  return typeof v === "number" && v > 0 ? v : null;
}

/** Guarda (o borra con null) el estilo de vida deseado, preservando el resto de `extra`. */
export async function setDesiredMonthlyLifestyle(amount: number | null): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("personal_profiles")
    .select("extra")
    .eq("user_id", user.id)
    .maybeSingle();
  const extra = { ...((data?.extra as Record<string, unknown> | null) ?? {}) };
  if (amount != null && amount > 0) extra[KEY] = amount;
  else delete extra[KEY];
  const { error } = await supabase
    .from("personal_profiles")
    .update({ extra })
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
}

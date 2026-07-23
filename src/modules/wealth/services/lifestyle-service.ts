import "server-only";

/**
 * Estilo de vida DESEADO mensual (insumo del número de libertad). Es dato
 * PERSONAL — vive en personal_profiles.extra del usuario, NO se comparte con el
 * hogar. Read-modify-write para no pisar otras claves de `extra`.
 *
 * Antes se guardaba un NÚMERO pelado, sin moneda. Eso significaba que el mismo valor se
 * reinterpretaba al cambiar la moneda de visualización del topbar: "quiero gastar 5.000 al
 * mes" pasaba de dólares a colones sin tocar nada. Ahora se guarda `{ amount, currency }`,
 * y quien lo lee para calcular lo convierte a su moneda de cálculo.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { getPrimaryCurrency } from "@/modules/financial-base";

const KEY = "desiredMonthlyLifestyle";

export type DesiredLifestyle = { amount: number; currency: string };

/**
 * Normaliza el valor crudo de `extra.desiredMonthlyLifestyle`, sea cual sea su forma:
 *  · `{ amount, currency }` — la forma nueva.
 *  · un número suelto — la forma vieja, SIN moneda. Se interpreta en la moneda que se pase
 *    como `fallbackCurrency` (la principal del usuario): es la suposición menos mala para
 *    los valores ya guardados, y para quien nunca cambió el topbar coincide con lo que veía.
 *  · cualquier otra cosa / ≤ 0 — no definido.
 *
 * Pura (sin acceso a red): la usan tanto el getter como `patrimonio-service`, que lee
 * `extra` por su cuenta.
 */
export function parseDesiredLifestyle(
  raw: unknown,
  fallbackCurrency: string,
): DesiredLifestyle | null {
  if (typeof raw === "number") {
    return raw > 0 ? { amount: raw, currency: fallbackCurrency } : null;
  }
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const amount = typeof o.amount === "number" ? o.amount : NaN;
    const currency = typeof o.currency === "string" ? o.currency : fallbackCurrency;
    return amount > 0 ? { amount, currency } : null;
  }
  return null;
}

export async function getDesiredMonthlyLifestyle(): Promise<DesiredLifestyle | null> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const [{ data }, primary] = await Promise.all([
    supabase.from("personal_profiles").select("extra").eq("user_id", user.id).maybeSingle(),
    getPrimaryCurrency(),
  ]);
  const raw = (data?.extra as Record<string, unknown> | null)?.[KEY];
  return parseDesiredLifestyle(raw, primary);
}

/** Guarda (o borra con null) el estilo de vida deseado, preservando el resto de `extra`.
 *  La moneda se guarda JUNTO al importe: el número por sí solo no significa nada. */
export async function setDesiredMonthlyLifestyle(
  amount: number | null,
  currency: string,
): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("personal_profiles")
    .select("extra")
    .eq("user_id", user.id)
    .maybeSingle();
  const extra = { ...((data?.extra as Record<string, unknown> | null) ?? {}) };
  if (amount != null && amount > 0) extra[KEY] = { amount, currency };
  else delete extra[KEY];
  const { error } = await supabase
    .from("personal_profiles")
    .update({ extra })
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
}

import "server-only";

/** Datos de cuenta: plan, consumo de IA, moneda y limpieza de datos. */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUser, isSupabaseConfigured, requireUser } from "@/lib/auth/session";
import { isValidTimeZone } from "@/lib/time/user-time";
import { aiTokenLimit, type Plan } from "@/lib/plan";
import {
  setNotificationChannel,
  mergeNotificationPrefs,
  type NotificationPrefs,
  type NotificationChannel,
} from "@/lib/notifications/preferences";

/**
 * Tablas de datos financieros de nivel superior (para "empezar de cero").
 * Las tablas hijas (goal_contributions, debt_payments, holdings…) se eliminan
 * en cascada al borrar sus padres.
 */
const FINANCIAL_TABLES = [
  "income_sources",
  "expense_items",
  "transactions",
  "savings_goals",
  "debts",
  "investments",
  "insurance_policies",
  "assets",
  "liabilities",
] as const;

export type AccountInfo = {
  email: string | null;
  name: string | null;
  plan: Plan;
  tokensUsed: number;
  tokenLimit: number;
  currency: string;
  notifications: NotificationPrefs;
  configured: boolean;
};

function currentPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export async function getAccountInfo(): Promise<AccountInfo> {
  const user = await getUser();
  const name = (user?.user_metadata?.display_name as string | undefined) ?? null;
  const email = user?.email ?? null;

  if (!isSupabaseConfigured() || !user) {
    return {
      email,
      name,
      plan: "ninguno",
      tokensUsed: 0,
      tokenLimit: aiTokenLimit("ninguno"),
      currency: "CRC",
      notifications: mergeNotificationPrefs(null),
      configured: false,
    };
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: profile }, { data: usage }, { data: settings }] = await Promise.all([
    supabase.from("profiles").select("plan,display_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("ai_usage_ledger")
      .select("tokens_used")
      .eq("user_id", user.id)
      .eq("period", currentPeriod())
      .maybeSingle(),
    supabase
      .from("user_settings")
      .select("primary_currency,notifications")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  const plan = (profile?.plan ?? "ninguno") as Plan;
  return {
    email,
    name: profile?.display_name ?? name,
    plan,
    currency: settings?.primary_currency ?? "CRC",
    tokensUsed: Number(usage?.tokens_used ?? 0),
    tokenLimit: aiTokenLimit(plan),
    notifications: mergeNotificationPrefs(
      (settings?.notifications ?? null) as Record<string, unknown> | null,
    ),
    configured: true,
  };
}

/** Enciende/apaga un canal de notificación del usuario en sesión. */
export async function updateNotificationChannel(
  channel: NotificationChannel,
  enabled: boolean,
): Promise<void> {
  const user = await requireUser();
  await setNotificationChannel(user.id, channel, enabled);
}

/** True si los datos actuales provienen de la plantilla de ejemplo. */
export async function isDemoData(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const user = await getUser();
  if (!user) return false;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("personal_profiles")
    .select("extra")
    .eq("user_id", user.id)
    .maybeSingle();
  const extra = (data?.extra ?? {}) as { demo?: boolean };
  return extra.demo === true;
}

/** Cambia la moneda principal del usuario (afecta formato y nuevos ítems). */
export async function updatePrimaryCurrency(code: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("user_settings")
    .upsert({ user_id: user.id, primary_currency: code }, { onConflict: "user_id" });
}

/**
 * Guarda la zona horaria IANA del usuario (user_settings.timezone). El cálculo de
 * "mes/día actual" del servidor la usa para no depender de la hora del servidor (UTC).
 * Devuelve false si la zona no es válida (no se persiste basura).
 */
export async function updateUserTimezone(tz: string): Promise<boolean> {
  if (!isValidTimeZone(tz)) return false;
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: user.id, timezone: tz }, { onConflict: "user_id" });
  return !error;
}

/** Borra todos los datos financieros del usuario y la marca de ejemplo. */
export async function clearAllFinancialData(): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await Promise.all(FINANCIAL_TABLES.map((t) => supabase.from(t).delete().eq("user_id", user.id)));
  // Quita la marca de demo del perfil.
  await supabase.from("personal_profiles").update({ extra: {} }).eq("user_id", user.id);
}

/**
 * Contexto para la zona de peligro (#82): si el usuario es DUEÑO de un hogar con
 * otros miembros activos, borrar su cuenta arrastra TODA la data del hogar → copy
 * más fuerte. Lee con el cliente de sesión (RLS ve su propio hogar).
 */
export async function getAccountDeletionInfo(): Promise<{ isOwnerWithMembers: boolean }> {
  const user = await getUser();
  if (!user) return { isOwnerWithMembers: false };
  const supabase = await createSupabaseServerClient();
  const { data: mine } = await supabase
    .from("household_members")
    .select("household_id, role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!mine?.household_id || mine.role !== "owner") return { isOwnerWithMembers: false };
  const { count } = await supabase
    .from("household_members")
    .select("*", { count: "exact", head: true })
    .eq("household_id", mine.household_id)
    .eq("status", "active")
    .neq("user_id", user.id);
  return { isOwnerWithMembers: (count ?? 0) > 0 };
}

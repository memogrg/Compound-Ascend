import "server-only";

/** Datos de cuenta: plan, consumo de IA, moneda y limpieza de datos. */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUser, isSupabaseConfigured, requireUser } from "@/lib/auth/session";
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
      plan: "free",
      tokensUsed: 0,
      tokenLimit: aiTokenLimit("free"),
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
  const plan = (profile?.plan ?? "free") as Plan;
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

/** Borra todos los datos financieros del usuario y la marca de ejemplo. */
export async function clearAllFinancialData(): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  await Promise.all(FINANCIAL_TABLES.map((t) => supabase.from(t).delete().eq("user_id", user.id)));
  // Quita la marca de demo del perfil.
  await supabase.from("personal_profiles").update({ extra: {} }).eq("user_id", user.id);
}

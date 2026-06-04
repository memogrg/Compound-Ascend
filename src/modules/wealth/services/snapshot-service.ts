import "server-only";

/**
 * Servicio de snapshots de portafolio.
 * Generación automática (una vez al día) y lectura por período.
 * Las escrituras usan service-role para omitir RLS.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import type { PortfolioSnapshot } from "@/modules/wealth/types";

export type SnapshotPeriod = "1M" | "3M" | "6M" | "1Y" | "all";

function rowToSnapshot(r: {
  id: string;
  date: string;
  portfolio_value: number;
  investment_value: number;
  net_worth: number;
  currency: string;
}): PortfolioSnapshot {
  return {
    id: r.id,
    date: r.date,
    portfolioValue: Number(r.portfolio_value),
    investmentValue: Number(r.investment_value),
    netWorth: Number(r.net_worth),
    currency: r.currency,
  };
}

/** Devuelve snapshots del portafolio filtrados por período. */
export async function getSnapshotHistory(period: SnapshotPeriod): Promise<PortfolioSnapshot[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  const cutoff = periodCutoff(period);
  let query = supabase
    .from("portfolio_snapshots")
    .select("id,date,portfolio_value,investment_value,net_worth,currency")
    .eq("user_id", user.id)
    .order("date", { ascending: true });

  if (cutoff) query = query.gte("date", cutoff);

  const { data } = await query;
  return (data ?? []).map(rowToSnapshot);
}

/**
 * Genera y almacena un snapshot del portafolio para el día de hoy.
 * Si ya existe uno para hoy, no lo duplica (UNIQUE constraint).
 * La escritura usa service-role para funcionar tanto en context de usuario
 * como en llamadas de cron sin sesión.
 *
 * @param userId           ID del usuario propietario del snapshot.
 * @param portfolioValue   Valor de mercado del portafolio (moneda principal).
 * @param investmentValue  Costo base total (moneda principal).
 * @param netWorth         Patrimonio neto total (moneda principal).
 * @param currency         Moneda principal.
 */
export async function generateAndSaveSnapshot(
  userId: string,
  portfolioValue: number,
  investmentValue: number,
  netWorth: number,
  currency: string,
): Promise<PortfolioSnapshot | null> {
  try {
    const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = createServiceRoleClient();
    const today = new Date().toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("portfolio_snapshots")
      .upsert(
        { user_id: userId, date: today, portfolio_value: portfolioValue, investment_value: investmentValue, net_worth: netWorth, currency },
        { onConflict: "user_id,date", ignoreDuplicates: false },
      )
      .select("id,date,portfolio_value,investment_value,net_worth,currency")
      .maybeSingle();

    if (error || !data) return null;
    return rowToSnapshot(data);
  } catch {
    return null;
  }
}

/**
 * Genera automáticamente un snapshot para hoy si no existe uno.
 * Llamado como efecto secundario al cargar el portafolio.
 */
export async function maybeGenerateSnapshot(
  userId: string,
  portfolioValue: number,
  investmentValue: number,
  netWorth: number,
  currency: string,
): Promise<void> {
  try {
    const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
    const supabase = createServiceRoleClient();
    const today = new Date().toISOString().slice(0, 10);

    // Verifica si ya existe snapshot de hoy antes de intentar insertar.
    const { data: existing } = await supabase
      .from("portfolio_snapshots")
      .select("id")
      .eq("user_id", userId)
      .eq("date", today)
      .maybeSingle();

    if (existing) return;

    await supabase.from("portfolio_snapshots").insert({
      user_id: userId,
      date: today,
      portfolio_value: portfolioValue,
      investment_value: investmentValue,
      net_worth: netWorth,
      currency,
    });
  } catch {
    // Silencioso: no bloquear la carga del portafolio por un fallo de snapshot.
  }
}

function periodCutoff(period: SnapshotPeriod): string | null {
  if (period === "all") return null;
  const d = new Date();
  switch (period) {
    case "1M": d.setMonth(d.getMonth() - 1); break;
    case "3M": d.setMonth(d.getMonth() - 3); break;
    case "6M": d.setMonth(d.getMonth() - 6); break;
    case "1Y": d.setFullYear(d.getFullYear() - 1); break;
  }
  return d.toISOString().slice(0, 10);
}

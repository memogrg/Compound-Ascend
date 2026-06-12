import "server-only";

/**
 * Servicio de snapshots de portafolio.
 * Generación automática (una vez al día) y lectura por período.
 * Las escrituras usan service-role para omitir RLS.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { convertCurrency } from "@/lib/fx";
import { computePortfolioAnalytics } from "@/modules/wealth/engine/portfolio-engine";
import { fetchNormalizedPrices } from "@/modules/wealth/services/portfolio-service";
import { rowToHolding, HOLDING_COLS } from "@/modules/wealth/services/holdings-service";
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
        {
          user_id: userId,
          date: today,
          portfolio_value: portfolioValue,
          investment_value: investmentValue,
          net_worth: netWorth,
          currency,
        },
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

/**
 * Genera el snapshot del día para un usuario SIN sesión (modo cron).
 *
 * A diferencia de getPortfolioReport/getRichLifeSummary (atados a requireUser
 * por cookies), aquí todo se lee con service-role: holdings y moneda principal
 * del usuario indicado, precios/FX con lib/market-data (no requieren sesión) y
 * la misma normalización del portfolio (fetchNormalizedPrices).
 *
 * net_worth: se arrastra el último valor conocido (carry-forward del snapshot
 * más reciente). Calcularlo fresco exigiría replicar rich-life con service-role
 * — pendiente documentado en docs/revision/02-pendientes-fase3.md.
 *
 * Devuelve null si el usuario no tiene holdings (no hay nada que snapshotear).
 */
export async function generateSnapshotForUserCron(
  userId: string,
): Promise<PortfolioSnapshot | null> {
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  const supabase = createServiceRoleClient();

  const [{ data: settings }, { data: holdingRows }] = await Promise.all([
    supabase.from("user_settings").select("primary_currency").eq("user_id", userId).maybeSingle(),
    supabase.from("investment_holdings").select(HOLDING_COLS).eq("user_id", userId),
  ]);
  if (!holdingRows || holdingRows.length === 0) return null;

  const currency = settings?.primary_currency ?? "CRC";
  const holdings = holdingRows.map(rowToHolding);
  const rates = await getFxRates();

  const normalized = holdings.map((h) => ({
    ...h,
    averageCost: convertCurrency(h.averageCost, h.currency, currency, rates),
  }));
  // fetchNormalizedPrices solo usa symbol y assetType — no depende del
  // averageCost normalizado (mismo orden que el camino con sesión).
  const prices = await fetchNormalizedPrices(holdings, currency, rates);
  const analytics = computePortfolioAnalytics(normalized, prices);

  const { data: last } = await supabase
    .from("portfolio_snapshots")
    .select("net_worth")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last) {
    logger.warn("cron-snapshot: sin snapshot previo; net_worth cae a portfolioValue", { userId });
  }
  const netWorth = last ? Number(last.net_worth) : analytics.totalPortfolioValue;

  const snap = await generateAndSaveSnapshot(
    userId,
    analytics.totalPortfolioValue,
    analytics.totalCostBasis,
    netWorth,
    currency,
  );
  if (!snap) {
    // generateAndSaveSnapshot devuelve null tanto por duplicado como por fallo
    // de escritura; en cron eso seria invisible sin este log.
    logger.warn("cron-snapshot: generateAndSaveSnapshot devolvio null", { userId });
  }
  return snap;
}

function periodCutoff(period: SnapshotPeriod): string | null {
  if (period === "all") return null;
  const d = new Date();
  switch (period) {
    case "1M":
      d.setMonth(d.getMonth() - 1);
      break;
    case "3M":
      d.setMonth(d.getMonth() - 3);
      break;
    case "6M":
      d.setMonth(d.getMonth() - 6);
      break;
    case "1Y":
      d.setFullYear(d.getFullYear() - 1);
      break;
  }
  return d.toISOString().slice(0, 10);
}

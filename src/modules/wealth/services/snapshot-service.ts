import "server-only";
import { getActiveHouseholdId, householdMemberIds } from "@/lib/household/active";

/**
 * Servicio de snapshots de portafolio.
 * Generación automática (una vez al día) y lectura por período.
 * Las escrituras usan service-role para omitir RLS.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
import { now as simNow } from "@/lib/time/clock";
import { logger } from "@/lib/logger";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { computePortfolioAnalytics } from "@/modules/wealth/engine/portfolio-engine";
import {
  fetchNormalizedPrices,
  normalizeHoldings,
} from "@/modules/wealth/services/portfolio-service";
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
export async function getSnapshotHistory(
  period: SnapshotPeriod,
  ctx?: AuthContext,
): Promise<PortfolioSnapshot[]> {
  const { db: supabase, userId } = await resolveAuth(ctx);

  const memberIds = await householdMemberIds(supabase, userId);
  const cutoff = periodCutoff(period);
  let query = supabase
    .from("portfolio_snapshots")
    .select("id,date,portfolio_value,investment_value,net_worth,currency")
    .in("user_id", memberIds)
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
/**
 * El hogar del usuario, para etiquetar la fila.
 *
 * Sin `household_id` la fila es INVISIBLE para el resto del hogar: la RLS filtra por él, así
 * que Marta no vería los puntos de patrimonio que sí ve José. Se le escapó al guardián que ya
 * existe (`tests/unit/household-propagation.test.ts`) porque esta escritura no pasa por el
 * orquestador: la hace el cron con el cliente de servicio. Medido en producción antes del
 * arreglo: 16 filas, 4 sin `household_id` ni `created_by`.
 *
 * `null` es una respuesta legítima —modo «solo», sin hogar—: la fila se escribe igual, porque
 * es SU patrimonio, y `created_by` sigue diciendo quién la puso. Inventar un hogar sería peor.
 *
 * Nunca revienta: un snapshot es best-effort y no puede tumbar ni el cron ni la pantalla.
 */
async function hogarDe(
  supabase: Parameters<typeof getActiveHouseholdId>[0],
  userId: string,
): Promise<string | null> {
  try {
    return await getActiveHouseholdId(supabase, userId);
  } catch {
    return null;
  }
}

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
    const today = simNow().toISOString().slice(0, 10);
    const householdId = await hogarDe(supabase, userId);

    const { data, error } = await supabase
      .from("portfolio_snapshots")
      .upsert(
        {
          user_id: userId,
          household_id: householdId,
          created_by: userId,
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
    const today = simNow().toISOString().slice(0, 10);

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
      household_id: await hogarDe(supabase, userId),
      created_by: userId,
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
 * net_worth: se calcula FRESCO con el motor de patrimonio (`computeNetWorth` de
 * rich-life, con el mismo cliente service-role). Antes se arrastraba el valor del
 * snapshot anterior porque el motor parecía atado a la sesión; no lo está —
 * `aggregateNetWorth` acepta un AuthContext—. El arrastre solo sobrevive como
 * degradación si la agregación falla (ver `netWorthDelUsuario`).
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

  // Misma normalización de moneda que el camino con sesión (averageCost +
  // currentValueManual + rentalIncome a moneda principal).
  const normalized = normalizeHoldings(holdings, currency, rates);
  // fetchNormalizedPrices solo usa symbol y assetType — no depende del
  // averageCost normalizado (mismo orden que el camino con sesión).
  // ctx service-role: habilita el respaldo desde market_price_cache también sin sesión.
  const prices = await fetchNormalizedPrices(holdings, currency, rates, { db: supabase, userId });
  const analytics = computePortfolioAnalytics(normalized, prices);

  const netWorth = await netWorthDelUsuario(supabase, userId, analytics.totalPortfolioValue);

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

/**
 * Patrimonio neto del usuario para el snapshot de cron, en orden de preferencia:
 *
 *  1. el MOTOR (`computeNetWorth` con service-role): líquido + inversiones + activos −
 *     deudas, el mismo número que ve el usuario en pantalla;
 *  2. el último snapshot (arrastre) si la agregación falla o el usuario no tiene aún
 *     activos ni pasivos registrados;
 *  3. el valor del portafolio, último recurso cuando tampoco hay historia.
 *
 * Los pasos 2 y 3 son degradación con log, no la ruta normal: una corrida de cron no
 * debe quedarse sin snapshot porque un proveedor de precios se cayó.
 *
 * El import es dinámico a propósito: `rich-life` importa el barrel de `wealth`, y este
 * archivo se exporta desde ese barrel — estáticamente sería un ciclo.
 */
async function netWorthDelUsuario(
  supabase: SupabaseClient<Database>,
  userId: string,
  portfolioValue: number,
): Promise<number> {
  try {
    const { computeNetWorth } =
      await import("@/modules/rich-life/services/net-worth-snapshot-service");
    // "cache": el cron ya salió a los proveedores arriba (fetchNormalizedPrices) y esa
    // llamada persiste en market_price_cache; repetir la ronda en vivo sería pagarla dos
    // veces por usuario.
    const calc = await computeNetWorth({ db: supabase, userId }, { precios: "cache" });
    if (calc) return Math.round(calc.indicators.netWorth);
    logger.warn("cron-snapshot: usuario sin activos ni pasivos; net_worth por arrastre", {
      userId,
    });
  } catch (err) {
    logger.warn("cron-snapshot: falló el motor de patrimonio; net_worth por arrastre", {
      userId,
      err,
    });
  }

  const { data: last } = await supabase
    .from("portfolio_snapshots")
    .select("net_worth")
    .eq("user_id", userId)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last) return Number(last.net_worth);

  logger.warn("cron-snapshot: sin snapshot previo; net_worth cae a portfolioValue", { userId });
  return portfolioValue;
}

function periodCutoff(period: SnapshotPeriod): string | null {
  if (period === "all") return null;
  const d = simNow();
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

/**
 * Barrido diario de `portfolio_snapshots` para TODOS los usuarios (service role, sin sesión).
 *
 * Sustituye a `ensureTodaySnapshot()`, que escribía el punto de hoy al cargar
 * `/m/patrimonio`. Esa lectura-que-escribe tenía dos precios:
 *
 *  · **El gráfico cambiaba de forma entre dos visitas seguidas.** Capturando las 200 pantallas
 *    dos veces contra el MISMO build y el MISMO servidor, nueve comparaciones difieren:
 *    `/patrimonio` y `/m/patrimonio` en todos sus anchos y temas. Recortando la zona que
 *    cambia, el escalón de la curva está en otra x — la serie tiene un punto más. Lo creó la
 *    primera visita.
 *  · **El snapshot es del CIERRE del día, no del momento en que alguien abrió una pantalla.**
 *    Quien abría la app dos veces con el mercado moviéndose escribía el primer precio del día
 *    y ya; quien no la abría no tenía punto. La serie dependía del hábito de mirarla.
 *
 * Mismo patrón que `generateSnapshotsForAllUsers` (financial-base) y
 * `generateNetWorthSnapshotsForAllUsers` (rich-life): recorre `profiles` con el cliente de
 * servicio y delega en el camino sin sesión, que ya existía
 * (`generateSnapshotForUserCron`) y que resuelve precios desde `market_price_cache`.
 *
 * Un usuario que falla NO detiene el barrido, y se registra con su id: en un cron, un fallo
 * silencioso es un agujero que nadie ve.
 */
export async function generatePortfolioSnapshotsForAllUsers(): Promise<{
  users: number;
  written: number;
  failed: number;
}> {
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  const admin = createServiceRoleClient();
  const { data: users } = await admin.from("profiles").select("id");
  let written = 0;
  let failed = 0;
  for (const u of users ?? []) {
    try {
      if (await generateSnapshotForUserCron(u.id)) written += 1;
    } catch (err) {
      failed += 1;
      logger.warn("barrido de snapshots: un usuario falló", { userId: u.id, err });
    }
  }
  return { users: users?.length ?? 0, written, failed };
}

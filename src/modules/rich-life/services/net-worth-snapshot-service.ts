import "server-only";

/**
 * Snapshots de PATRIMONIO NETO (`net_worth_snapshots`): la serie histórica real de
 * "cómo cambió mi patrimonio".
 *
 * Por qué existe: la tabla estaba creada desde la migración 0007 pero NADIE la
 * escribía, así que el asesor respondía la pregunta con `portfolio_snapshots` —el
 * valor de las INVERSIONES, no el patrimonio—. Aquí se escribe con el mismo motor
 * que pinta la pantalla (`computeRichLifeIndicators` sobre `aggregateNetWorth`):
 * líquido + inversiones + activos − deudas, ya normalizado a moneda principal.
 *
 * PERIODO = mes natural, guardado como el día 1 (`YYYY-MM-01`), igual convención que
 * `monthly_snapshots`. El cron mensual (`/api/base/snapshot`) escribe el mes recién
 * CERRADO; las pantallas de patrimonio escriben el mes EN CURSO al cargar
 * (best-effort, idempotente por el unique `(user_id, period)`), para que la historia
 * arranque el día que se usa la app y no el 1 del mes siguiente.
 *
 * `household_id`: se etiqueta con el hogar activo para que el resto del hogar lo vea
 * (regla del repo). Ojo: cada miembro escribe SU fila, pero el valor es el mismo —
 * `aggregateNetWorth` ya agrega activos y pasivos de todo el hogar—. Por eso la
 * lectura DEDUPLICA por periodo en vez de sumar.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
import { getActiveHouseholdId, householdMemberIds } from "@/lib/household/active";
import { logger } from "@/lib/logger";
import type { Database } from "@/lib/supabase/database.types";
import { computeWealthBreakdown } from "@/lib/ai/wealth-breakdown";
import { computeRichLifeIndicators } from "@/modules/rich-life/engine/rich-life-engine";
import { aggregateNetWorth } from "@/modules/rich-life/services/rich-life-service";

/** Mes al que pertenece el snapshot. Estructural: no acopla al `Period` de financial-base. */
export type PeriodoMes = { year: number; month: number };

export type NetWorthSnapshotPoint = {
  /** Día 1 del mes, "YYYY-MM-01". */
  period: string;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  /** Moneda en la que se escribió el snapshot (vive en `breakdown`; la tabla no tiene columna). */
  currency: string | null;
};

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Clave de periodo del mes: "YYYY-MM-01". */
export function periodKey(p: PeriodoMes): string {
  return `${p.year}-${pad(Math.min(12, Math.max(1, p.month)))}-01`;
}

/**
 * Calcula y persiste (upsert) el patrimonio neto del `periodo` para un usuario.
 *
 * - Sin `ctx`: usuario en sesión (cliente por cookies, RLS).
 * - Con `ctx`: cron/webhook sin sesión (service-role + userId explícito).
 *
 * `precios`: el camino de sesión mira precios en VIVO (igual que la pantalla); el cron
 * multi-usuario pasa "cache" — recorre a todos los usuarios y salir a los proveedores
 * por cada holding lo haría eterno; `market_price_cache` ya lo alimentan las cargas de
 * página y `/api/market-data/refresh`.
 *
 * Devuelve null si el usuario no tiene NADA que snapshotear (sin activos ni pasivos):
 * escribir ceros ensuciaría la serie con meses planos que nunca existieron.
 */
export async function generateNetWorthSnapshot(
  periodo: PeriodoMes,
  ctx?: AuthContext,
  opts: { precios?: "vivo" | "cache" } = {},
): Promise<NetWorthSnapshotPoint | null> {
  const { db, userId } = await resolveAuth(ctx);
  const agg = await aggregateNetWorth(ctx, opts);

  if (agg.assets.length === 0 && agg.liabilities.length === 0) return null;

  const ind = computeRichLifeIndicators({
    assets: agg.assets,
    liabilities: agg.liabilities,
    passiveIncomeMonthly: agg.passiveIncomeMonthly,
    monthlyExpenses: agg.monthlyExpenses,
    freeCashflow: agg.freeCashflow,
    protectionScore: agg.protection.score,
    diversification: agg.portfolio.diversification,
    previous: agg.previousNetWorth !== null ? { netWorth: agg.previousNetWorth } : null,
    currency: agg.currency,
  });

  return upsertNetWorthSnapshot(db, userId, periodo, ind, agg.currency, agg.assets);
}

/**
 * Escritura propiamente dicha. Separada de la agregación para que las PANTALLAS puedan
 * registrar el mes con los indicadores que YA calcularon (getRichLifeSummary), sin
 * volver a agregar todo el patrimonio en la misma carga.
 */
async function upsertNetWorthSnapshot(
  db: SupabaseClient<Database>,
  userId: string,
  periodo: PeriodoMes,
  ind: { netWorth: number; totalAssets: number; totalLiabilities: number },
  currency: string,
  assets: { assetClass: string; value: number }[],
): Promise<NetWorthSnapshotPoint | null> {
  const period = periodKey(periodo);
  const desglose = computeWealthBreakdown(assets);

  const { error } = await db.from("net_worth_snapshots").upsert(
    {
      user_id: userId,
      household_id: await getActiveHouseholdId(db, userId),
      period,
      total_assets: Math.round(ind.totalAssets),
      total_liabilities: Math.round(ind.totalLiabilities),
      net_worth: Math.round(ind.netWorth),
      // La moneda va en `breakdown` porque la tabla no tiene columna propia y NO se
      // migra: quien lee la serie necesita saber en qué moneda están las cifras.
      breakdown: { currency, ...(desglose ?? {}) },
    },
    { onConflict: "user_id,period" },
  );

  if (error) {
    logger.warn("net-worth-snapshot: upsert falló", { userId, period, error: error.message });
    return null;
  }

  return {
    period,
    netWorth: Math.round(ind.netWorth),
    totalAssets: Math.round(ind.totalAssets),
    totalLiabilities: Math.round(ind.totalLiabilities),
    currency,
  };
}

/**
 * Cron multi-usuario (service role): escribe el patrimonio del periodo para todos los
 * usuarios con datos. Un fallo por usuario NO aborta el resto — un portafolio roto no
 * puede dejar sin historial a los demás.
 */
export async function generateNetWorthSnapshotsForAllUsers(
  periodo: PeriodoMes,
): Promise<{ users: number; written: number }> {
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  const admin = createServiceRoleClient();
  const { data: users } = await admin.from("profiles").select("id");

  let written = 0;
  for (const u of users ?? []) {
    try {
      const snap = await generateNetWorthSnapshot(
        periodo,
        { db: admin, userId: u.id },
        { precios: "cache" },
      );
      if (snap) written += 1;
    } catch (err) {
      logger.warn("net-worth-snapshot: usuario omitido", { userId: u.id, err });
    }
  }
  return { users: users?.length ?? 0, written };
}

/**
 * Best-effort desde la carga de pantalla (web y móvil): deja registrado el mes EN CURSO.
 * NUNCA lanza — si falla, la pantalla se pinta igual, solo se queda sin el punto del mes.
 *
 * Mismo patrón (y misma razón) que `ensureTodaySnapshot` en Patrimonio: sin esto la
 * serie no arranca hasta que corra el cron del día 1, y el asesor seguiría sin historial
 * de patrimonio durante todo el primer mes.
 *
 * Recibe el resumen ya calculado por la página: `getRichLifeSummary()` es el trabajo
 * caro de esa carga y ninguno de los dos servicios usa React cache(), así que volver a
 * agregarlo aquí duplicaría la consulta más pesada de la pantalla.
 */
export async function ensureCurrentNetWorthSnapshot(summary: {
  snapshot: { indicators: { netWorth: number; totalAssets: number; totalLiabilities: number } };
  allAssets: { assetClass: string; value: number }[];
  currency: string;
}): Promise<void> {
  try {
    const { userCurrentPeriod } = await import("@/lib/time/user-time");
    const [user, supabase, p] = await Promise.all([
      requireUser(),
      createSupabaseServerClient(),
      userCurrentPeriod(),
    ]);
    await upsertNetWorthSnapshot(
      supabase,
      user.id,
      { year: p.year, month: p.month },
      summary.snapshot.indicators,
      summary.currency,
      summary.allAssets,
    );
  } catch (err) {
    logger.warn("ensureCurrentNetWorthSnapshot: no se pudo guardar el mes en curso", { err });
  }
}

/**
 * Serie histórica de patrimonio neto del hogar, en orden cronológico ascendente.
 *
 * Deduplica por periodo (ver cabecera: las filas de los miembros del hogar contienen el
 * MISMO patrimonio agregado, sumarlas lo multiplicaría). Se prefiere la fila propia.
 */
export async function getNetWorthHistory(): Promise<NetWorthSnapshotPoint[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  return readNetWorthHistory(supabase, user.id);
}

async function readNetWorthHistory(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<NetWorthSnapshotPoint[]> {
  const memberIds = await householdMemberIds(supabase, userId);
  const { data } = await supabase
    .from("net_worth_snapshots")
    .select("user_id,period,total_assets,total_liabilities,net_worth,breakdown")
    .in("user_id", memberIds)
    .order("period", { ascending: true });

  const porPeriodo = new Map<string, NetWorthSnapshotPoint>();
  for (const r of data ?? []) {
    const previo = porPeriodo.get(r.period);
    // La fila propia gana; si aún no hay ninguna, sirve la de cualquier miembro.
    if (previo && r.user_id !== userId) continue;
    const bd = (r.breakdown ?? {}) as { currency?: unknown };
    porPeriodo.set(r.period, {
      period: r.period,
      netWorth: Number(r.net_worth),
      totalAssets: Number(r.total_assets),
      totalLiabilities: Number(r.total_liabilities),
      currency: typeof bd.currency === "string" ? bd.currency : null,
    });
  }

  return [...porPeriodo.values()].sort((a, b) => a.period.localeCompare(b.period));
}

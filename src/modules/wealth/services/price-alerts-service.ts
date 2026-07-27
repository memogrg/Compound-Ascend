import "server-only";

/**
 * Alertas de inversión (CRUD del usuario + lecturas del cron). Tres tipos:
 *   · price     — símbolo cotizado (etf/accion/cripto) + objetivo + dirección.
 *   · time_held — años invertido: se evalúa contra holding.purchaseDate en el cron.
 *   · vesting   — fecha objetivo que fija el usuario.
 * Extensible: un tipo nuevo = una rama de validación acá + un case en el engine.
 * El alcance de hogar sigue el patrón del resto (lectura miembros; escritura dueño/editor,
 * RLS es el candado). Las funciones del cron usan service-role (sin sesión).
 *
 * NOTA: la tabla se llama `price_alerts` por continuidad de migración, pero guarda los 3 tipos.
 */
import { requireUser } from "@/lib/auth/session";
import { householdMemberIds, householdWriteScope, getActiveHouseholdId } from "@/lib/household/active";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AlertDirection, AlertKind } from "@/modules/wealth/engine/price-alerts";

const QUOTED_TYPES = new Set(["etf", "accion", "cripto"]);

export type InvestmentAlert = {
  id: string;
  kind: AlertKind;
  holdingId: string | null;
  symbol: string | null;
  assetType: string | null;
  targetPrice: number | null;
  currency: string | null;
  direction: AlertDirection | null;
  yearsThreshold: number | null;
  triggerDate: string | null;
  active: boolean;
  oneShot: boolean;
  triggeredAt: string | null;
};

export type CreateAlertInput =
  | {
      kind: "price";
      holdingId?: string | null;
      symbol: string;
      assetType: string;
      targetPrice: number;
      currency: string;
      direction: AlertDirection;
    }
  | { kind: "time_held"; holdingId: string; yearsThreshold: number }
  | { kind: "vesting"; holdingId: string; triggerDate: string };

type AlertRow = {
  id: string;
  kind: string;
  holding_id: string | null;
  symbol: string | null;
  asset_type: string | null;
  target_price: number | null;
  currency: string | null;
  direction: string | null;
  years_threshold: number | null;
  trigger_date: string | null;
  active: boolean;
  one_shot: boolean;
  triggered_at: string | null;
};

function normKind(k: string): AlertKind {
  return k === "time_held" || k === "vesting" ? k : "price";
}

function rowToAlert(r: AlertRow): InvestmentAlert {
  return {
    id: r.id,
    kind: normKind(r.kind),
    holdingId: r.holding_id,
    symbol: r.symbol,
    assetType: r.asset_type,
    targetPrice: r.target_price === null ? null : Number(r.target_price),
    currency: r.currency,
    direction: r.direction === "below" ? "below" : r.direction === "above" ? "above" : null,
    yearsThreshold: r.years_threshold === null ? null : Number(r.years_threshold),
    triggerDate: r.trigger_date,
    active: r.active,
    oneShot: r.one_shot,
    triggeredAt: r.triggered_at,
  };
}

const SELECT =
  "id, kind, holding_id, symbol, asset_type, target_price, currency, direction, years_threshold, trigger_date, active, one_shot, triggered_at";

/** Alertas del usuario/hogar, opcionalmente filtradas por holding. Más nuevas primero. */
export async function listInvestmentAlerts(holdingId?: string): Promise<InvestmentAlert[]> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const memberIds = await householdMemberIds(supabase, user.id);
  let q = supabase
    .from("price_alerts")
    .select(SELECT)
    .in("user_id", memberIds)
    .order("created_at", { ascending: false });
  if (holdingId) q = q.eq("holding_id", holdingId);
  const { data, error } = await q;
  if (error || !data) return [];
  return data.map(rowToAlert);
}

/** Crea una alerta según su tipo. Valida los campos propios del kind. */
export async function createInvestmentAlert(
  input: CreateAlertInput,
): Promise<{ ok: boolean; id?: string; message?: string }> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const household_id = await getActiveHouseholdId(supabase, user.id);

  const base = { user_id: user.id, household_id, active: true, one_shot: true, kind: input.kind };
  let row: typeof base & {
    holding_id?: string | null;
    symbol?: string;
    asset_type?: string;
    target_price?: number;
    currency?: string;
    direction?: AlertDirection;
    years_threshold?: number;
    trigger_date?: string;
  };

  if (input.kind === "price") {
    const symbol = input.symbol.trim().toUpperCase();
    if (!symbol) return { ok: false, message: "Falta el símbolo." };
    if (!QUOTED_TYPES.has(input.assetType)) return { ok: false, message: "Este activo no tiene precio de mercado." };
    if (!(input.targetPrice > 0)) return { ok: false, message: "El precio objetivo debe ser mayor a 0." };
    row = {
      ...base,
      holding_id: input.holdingId ?? null,
      symbol,
      asset_type: input.assetType,
      target_price: input.targetPrice,
      currency: input.currency,
      direction: input.direction,
    };
  } else if (input.kind === "time_held") {
    if (!input.holdingId) return { ok: false, message: "Falta la inversión." };
    if (!(input.yearsThreshold > 0)) return { ok: false, message: "Los años deben ser mayores a 0." };
    row = { ...base, holding_id: input.holdingId, years_threshold: input.yearsThreshold };
  } else {
    if (!input.holdingId) return { ok: false, message: "Falta la inversión." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.triggerDate)) return { ok: false, message: "Fecha inválida." };
    row = { ...base, holding_id: input.holdingId, trigger_date: input.triggerDate };
  }

  const { data, error } = await supabase.from("price_alerts").insert(row).select("id").maybeSingle();
  if (error || !data) return { ok: false, message: error?.message ?? "No se pudo crear la alerta." };
  return { ok: true, id: data.id };
}

/** Edita objetivo/dirección/umbral/fecha/activación. Reactivar limpia triggered_at (vuelve a vigilar). */
export async function updateInvestmentAlert(
  id: string,
  patch: {
    targetPrice?: number;
    direction?: AlertDirection;
    yearsThreshold?: number;
    triggerDate?: string;
    active?: boolean;
  },
): Promise<{ ok: boolean; message?: string }> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);

  const update: {
    target_price?: number;
    direction?: AlertDirection;
    years_threshold?: number;
    trigger_date?: string;
    active?: boolean;
    triggered_at?: string | null;
  } = {};
  if (patch.targetPrice !== undefined) {
    if (!(patch.targetPrice > 0)) return { ok: false, message: "El precio objetivo debe ser mayor a 0." };
    update.target_price = patch.targetPrice;
  }
  if (patch.direction !== undefined) update.direction = patch.direction;
  if (patch.yearsThreshold !== undefined) {
    if (!(patch.yearsThreshold > 0)) return { ok: false, message: "Los años deben ser mayores a 0." };
    update.years_threshold = patch.yearsThreshold;
  }
  if (patch.triggerDate !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.triggerDate)) return { ok: false, message: "Fecha inválida." };
    update.trigger_date = patch.triggerDate;
  }
  if (patch.active !== undefined) {
    update.active = patch.active;
    if (patch.active) update.triggered_at = null; // reactivar → volver a vigilar
  }
  if (Object.keys(update).length === 0) return { ok: true };

  const { error } = await supabase.from("price_alerts").update(update).eq("id", id).in("user_id", scope);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/** Borra una alerta. */
export async function deleteInvestmentAlert(id: string): Promise<{ ok: boolean; message?: string }> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);
  const { error } = await supabase.from("price_alerts").delete().eq("id", id).in("user_id", scope);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

// ── Cron (service-role, sin sesión) ────────────────────────────────────────

export type ActiveInvestmentAlert = {
  id: string;
  userId: string;
  householdId: string | null;
  holdingId: string | null;
  kind: AlertKind;
  symbol: string | null;
  assetType: string | null;
  targetPrice: number | null;
  currency: string | null;
  direction: AlertDirection | null;
  yearsThreshold: number | null;
  triggerDate: string | null;
  oneShot: boolean;
};

/** TODAS las alertas activas (service-role) para el barrido del cron. */
export async function getActiveInvestmentAlerts(): Promise<ActiveInvestmentAlert[]> {
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("price_alerts")
    .select(`user_id, household_id, one_shot, ${SELECT}`)
    .eq("active", true);
  if (error || !data) return [];
  return data.map((r) => {
    const a = rowToAlert(r as AlertRow);
    return {
      id: a.id,
      userId: (r as { user_id: string }).user_id,
      householdId: (r as { household_id: string | null }).household_id,
      holdingId: a.holdingId,
      kind: a.kind,
      symbol: a.symbol,
      assetType: a.assetType,
      targetPrice: a.targetPrice,
      currency: a.currency,
      direction: a.direction,
      yearsThreshold: a.yearsThreshold,
      triggerDate: a.triggerDate,
      oneShot: a.oneShot,
    };
  });
}

/**
 * Marca una alerta como disparada (service-role): sella triggered_at y, si es one_shot,
 * la desactiva para no re-avisar. Idempotente por alerta.
 */
export async function markInvestmentAlertTriggered(
  id: string,
  oneShot: boolean,
  triggeredAtIso: string,
): Promise<void> {
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  const admin = createServiceRoleClient();
  await admin
    .from("price_alerts")
    .update({ triggered_at: triggeredAtIso, active: oneShot ? false : true })
    .eq("id", id);
}

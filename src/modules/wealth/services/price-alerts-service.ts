import "server-only";

/**
 * Alertas de precio (CRUD del usuario + lecturas del cron). Solo símbolos cotizados
 * (etf/accion/cripto). El alcance de hogar sigue el patrón del resto: lectura por
 * miembros, escritura por dueño/editor (RLS es el candado final). Las funciones del
 * cron usan service-role (sin sesión) para recorrer todos los usuarios.
 */
import { requireUser } from "@/lib/auth/session";
import { householdMemberIds, householdWriteScope, getActiveHouseholdId } from "@/lib/household/active";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AlertDirection } from "@/modules/wealth/engine/price-alerts";

const QUOTED_TYPES = new Set(["etf", "accion", "cripto"]);

export type PriceAlert = {
  id: string;
  holdingId: string | null;
  symbol: string;
  assetType: string;
  targetPrice: number;
  currency: string;
  direction: AlertDirection;
  active: boolean;
  oneShot: boolean;
  triggeredAt: string | null;
};

export type CreatePriceAlertInput = {
  holdingId?: string | null;
  symbol: string;
  assetType: string;
  targetPrice: number;
  currency: string;
  direction: AlertDirection;
};

function rowToAlert(r: {
  id: string;
  holding_id: string | null;
  symbol: string;
  asset_type: string;
  target_price: number;
  currency: string;
  direction: string;
  active: boolean;
  one_shot: boolean;
  triggered_at: string | null;
}): PriceAlert {
  return {
    id: r.id,
    holdingId: r.holding_id,
    symbol: r.symbol,
    assetType: r.asset_type,
    targetPrice: Number(r.target_price),
    currency: r.currency,
    direction: r.direction === "below" ? "below" : "above",
    active: r.active,
    oneShot: r.one_shot,
    triggeredAt: r.triggered_at,
  };
}

const SELECT = "id, holding_id, symbol, asset_type, target_price, currency, direction, active, one_shot, triggered_at";

/** Alertas del usuario/hogar, opcionalmente filtradas por holding. Más nuevas primero. */
export async function listPriceAlerts(holdingId?: string): Promise<PriceAlert[]> {
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

/** Crea una alerta. Solo símbolos cotizados; target > 0. */
export async function createPriceAlert(input: CreatePriceAlertInput): Promise<{ ok: boolean; id?: string; message?: string }> {
  const user = await requireUser();
  const symbol = input.symbol.trim().toUpperCase();
  if (!symbol) return { ok: false, message: "Falta el símbolo." };
  if (!QUOTED_TYPES.has(input.assetType)) return { ok: false, message: "Este activo no tiene precio de mercado." };
  if (!(input.targetPrice > 0)) return { ok: false, message: "El precio objetivo debe ser mayor a 0." };

  const supabase = await createSupabaseServerClient();
  const household_id = await getActiveHouseholdId(supabase, user.id);
  const { data, error } = await supabase
    .from("price_alerts")
    .insert({
      user_id: user.id,
      household_id,
      holding_id: input.holdingId ?? null,
      symbol,
      asset_type: input.assetType,
      target_price: input.targetPrice,
      currency: input.currency,
      direction: input.direction,
      active: true,
      one_shot: true,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, message: error?.message ?? "No se pudo crear la alerta." };
  return { ok: true, id: data.id };
}

/** Edita objetivo/dirección/activación. Reactivar limpia triggered_at (vuelve a vigilar). */
export async function updatePriceAlert(
  id: string,
  patch: { targetPrice?: number; direction?: AlertDirection; active?: boolean },
): Promise<{ ok: boolean; message?: string }> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);

  const update: {
    target_price?: number;
    direction?: AlertDirection;
    active?: boolean;
    triggered_at?: string | null;
  } = {};
  if (patch.targetPrice !== undefined) {
    if (!(patch.targetPrice > 0)) return { ok: false, message: "El precio objetivo debe ser mayor a 0." };
    update.target_price = patch.targetPrice;
  }
  if (patch.direction !== undefined) update.direction = patch.direction;
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
export async function deletePriceAlert(id: string): Promise<{ ok: boolean; message?: string }> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const scope = await householdWriteScope(supabase, user.id);
  const { error } = await supabase.from("price_alerts").delete().eq("id", id).in("user_id", scope);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

// ── Cron (service-role, sin sesión) ────────────────────────────────────────

export type ActivePriceAlert = {
  id: string;
  userId: string;
  householdId: string | null;
  holdingId: string | null;
  symbol: string;
  assetType: string;
  targetPrice: number;
  currency: string;
  direction: AlertDirection;
  oneShot: boolean;
};

/** TODAS las alertas activas (service-role) para el barrido del cron. */
export async function getActivePriceAlerts(): Promise<ActivePriceAlert[]> {
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("price_alerts")
    .select("id, user_id, household_id, holding_id, symbol, asset_type, target_price, currency, direction, one_shot")
    .eq("active", true);
  if (error || !data) return [];
  return data.map((r) => ({
    id: r.id,
    userId: r.user_id,
    householdId: r.household_id,
    holdingId: r.holding_id,
    symbol: r.symbol,
    assetType: r.asset_type,
    targetPrice: Number(r.target_price),
    currency: r.currency,
    direction: r.direction === "below" ? "below" : "above",
    oneShot: r.one_shot,
  }));
}

/**
 * Marca una alerta como disparada (service-role): sella triggered_at y, si es one_shot,
 * la desactiva para no re-avisar. Idempotente por alerta.
 */
export async function markPriceAlertTriggered(id: string, oneShot: boolean, triggeredAtIso: string): Promise<void> {
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  const admin = createServiceRoleClient();
  await admin
    .from("price_alerts")
    .update({ triggered_at: triggeredAtIso, active: oneShot ? false : true })
    .eq("id", id);
}

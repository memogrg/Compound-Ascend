import "server-only";

/**
 * Watchlist del Monitor de Fondos (Fase 4). Respeta RLS (user_id) y comparte
 * household_id en el insert. Degrada con [] si la tabla aún no existe (las
 * migraciones 20260617000002/3 pueden no estar aplicadas todavía) — así
 * /patrimonio nunca rompe por esto.
 *
 * La columna en BD es `asset_type` (migración ...0003); el campo de dominio que
 * expone el módulo se llama `kind` (WatchKind). El mapeo vive solo aquí.
 */
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { getActiveHouseholdId } from "@/lib/household/active";

export type WatchKind = "stock" | "etf" | "crypto";
export type WatchItem = { id: string; symbol: string; kind: WatchKind };

export async function listWatchlist(): Promise<WatchItem[]> {
  try {
    const user = await requireUser();
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("watchlist_symbols")
      .select("id,symbol,asset_type")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (error) return [];
    return (data ?? []).map((r) => ({ id: r.id, symbol: r.symbol, kind: r.asset_type as WatchKind }));
  } catch {
    return [];
  }
}

export async function addWatchlistSymbol(symbolRaw: string, kind: WatchKind): Promise<void> {
  const symbol = symbolRaw.trim().toUpperCase();
  if (!symbol || symbol.length > 12) throw new Error("Símbolo inválido");
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const household_id = await getActiveHouseholdId(supabase, user.id);
  // Idempotente: si ya está (unique user_id+symbol), no duplica.
  const { error } = await supabase
    .from("watchlist_symbols")
    .upsert(
      { user_id: user.id, household_id, symbol, asset_type: kind },
      { onConflict: "user_id,symbol", ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);
}

export async function removeWatchlistSymbol(id: string): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("watchlist_symbols")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) throw new Error(error.message);
}

import "server-only";

/**
 * Watchlist del Monitor de Fondos (Fase 4). Respeta RLS (user_id) y comparte
 * household_id en el insert. Degrada con [] si la tabla aún no existe (la
 * migración 20260617000002 puede no estar aplicada todavía) — así /patrimonio
 * nunca rompe por esto.
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
      .select("id,symbol,kind")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });
    if (error) return [];
    return (data ?? []).map((r) => ({ id: r.id, symbol: r.symbol, kind: r.kind as WatchKind }));
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
      { user_id: user.id, household_id, symbol, kind },
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

"use server";

/**
 * Acciones del Monitor de Fondos (Fase 4). Precios en vivo batched reutilizando
 * el market-data layer (getMarketPrice: cadena de proveedores + caché en memoria
 * + persistencia). La caché por símbolo evita superar el rate-limit de Finnhub
 * (60/min) en cargas repetidas; el batch se limita a un máximo prudente.
 */
import { getMarketPrice } from "@/lib/market-data";
import {
  listWatchlist,
  addWatchlistSymbol,
  removeWatchlistSymbol,
  type WatchItem,
  type WatchKind,
} from "@/modules/wealth/services/watchlist-service";

export type MonitorQuote = {
  symbol: string;
  kind: WatchKind;
  price: number | null;
  currency: string | null;
  cached: boolean;
};

const MAX_SYMBOLS = 30;

/** Precios en vivo para una lista de símbolos (curados + watchlist). */
export async function getMonitorQuotesAction(
  symbols: { symbol: string; kind: WatchKind }[],
): Promise<MonitorQuote[]> {
  // Dedup por símbolo+kind y cap para no abusar de los proveedores.
  const seen = new Set<string>();
  const list = symbols
    .filter((s) => {
      const k = `${s.kind}:${s.symbol.toUpperCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, MAX_SYMBOLS);

  return Promise.all(
    list.map(async (s) => {
      const quote = await getMarketPrice(s.symbol, s.kind);
      return {
        symbol: s.symbol.toUpperCase(),
        kind: s.kind,
        price: quote?.price ?? null,
        currency: quote?.currency ?? null,
        cached: quote?.cached ?? false,
      };
    }),
  );
}

export async function listWatchlistAction(): Promise<WatchItem[]> {
  return listWatchlist();
}

export async function addWatchlistAction(
  symbol: string,
  kind: WatchKind,
): Promise<{ ok: boolean; message?: string }> {
  try {
    await addWatchlistSymbol(symbol, kind);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "No se pudo agregar." };
  }
}

export async function removeWatchlistAction(id: string): Promise<{ ok: boolean }> {
  try {
    await removeWatchlistSymbol(id);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

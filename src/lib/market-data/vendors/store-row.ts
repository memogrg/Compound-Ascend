import { isValidPrice } from "../validity.ts";
import type { ChainRow } from "./chain.ts";

/** Una fila de `market_price_cache` tal como la manda el upsert. */
export type StoreRow = {
  symbol: string;
  asset_type: string;
  price: number;
  currency: string;
  provider: string;
  fetched_at: string;
  ttl_seconds: number;
  ath_usd?: number;
  ath_date?: string | null;
  high_24h?: number | null;
  high_kind?: "ath" | "52w" | null;
};

/**
 * Arma el payload del upsert, o `null` si NO hay que escribir.
 *
 * - Precio inválido (≤0, null, NaN) → null. La fila del store queda como estaba: conserva el
 *   último precio bueno y su fecha. Nunca un "$0".
 * - Máximo inválido → se OMITEN las columnas del máximo (no se mandan en null). El upsert
 *   fusiona, así que el ATH/52 semanas bueno de antes sobrevive.
 *
 * `ath_usd` guarda también el máximo de 52 semanas de las acciones (`high_kind` dice cuál es) y,
 * a pesar del nombre, va en la moneda de la cotización.
 */
export function buildStoreRow(
  row: ChainRow,
  assetType: string,
  now: Date = new Date(),
): StoreRow | null {
  if (!isValidPrice(row.price)) return null;
  const out: StoreRow = {
    symbol: row.symbol,
    asset_type: assetType,
    price: row.price,
    currency: (row.currency || "USD").toUpperCase().slice(0, 3),
    provider: row.provider,
    fetched_at: now.toISOString(),
    ttl_seconds: assetType === "crypto" ? 300 : 60,
  };
  if (isValidPrice(row.high)) {
    out.ath_usd = row.high;
    out.ath_date = row.highDate;
    out.high_24h = isValidPrice(row.high24h) ? row.high24h : null;
    out.high_kind = row.highKind;
  }
  return out;
}

/**
 * Mapeos puros para ensamblar PatrimonioInput desde datos reales (sin IO).
 */
import type { AssetClassKey } from "@/modules/wealth/engine/patrimonio-engine";

/** APR a partir del cual una deuda se considera "cara"/mala (decisión de producto). */
export const BAD_DEBT_APR = 25;

/** Suma valores por clase de activo (las 5 del repo). Clases desconocidas se ignoran. */
export function sumAssetsByClass(
  assets: { assetClass: string; value: number }[],
): Record<AssetClassKey, number> {
  const out: Record<AssetClassKey, number> = {
    liquido: 0,
    inversion: 0,
    productivo: 0,
    uso_personal: 0,
    especial: 0,
  };
  for (const a of assets) {
    if (a.assetClass in out) out[a.assetClass as AssetClassKey] += a.value;
  }
  return out;
}

/** Deuda mala = clasificada como crítica, o con APR ≥ BAD_DEBT_APR. */
export function isBadDebt(classification: string | null, apr: number | null): boolean {
  return classification === "critica" || (apr ?? 0) >= BAD_DEBT_APR;
}

/**
 * Mapeos puros de liquidez para la agregación de patrimonio (sin IO).
 * Traducen los valores crudos de la BD al campo `liquidity` del modelo Asset.
 */

export type LiquidityLevel = "alta" | "media" | "baja";

/**
 * Liquidez de una inversión, desde `investments.liquidity`:
 *   rapida → alta · penalidad → media · largo_plazo → baja · no_se/null → null.
 */
export function mapInvestmentLiquidity(raw: string | null): LiquidityLevel | null {
  switch (raw) {
    case "rapida":
      return "alta";
    case "penalidad":
      return "media";
    case "largo_plazo":
      return "baja";
    default:
      return null; // "no_se", null o cualquier valor desconocido.
  }
}

/**
 * Liquidez de una meta de ahorro, desde `savings_goals.stored_in` (texto libre).
 * Efectivo/banco/cuenta/ahorro → alta; plazo/CDP → baja; desconocido/null → media.
 */
export function savingsLiquidity(storedIn: string | null): LiquidityLevel {
  const v = (storedIn ?? "").toLowerCase();
  if (!v) return "media";
  if (/(efectivo|banco|cuenta|ahorro)/.test(v)) return "alta";
  if (/(plazo|cdp|certificado)/.test(v)) return "baja";
  return "media";
}

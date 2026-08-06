/**
 * Composición del patrimonio LÍQUIDO (puro, sin IO). Responde "¿qué está contando
 * como mi colchón?" a partir de los mismos activos que alimentan `liquidWealth` del
 * motor patrimonial — no recalcula nada, solo los agrupa para poder explicarlos.
 *
 * Existe porque el líquido de este usuario NO es solo el fondo de paz: también el
 * ROP, el ahorro de la asociación y el saldo de cada meta. Ver 24 renglones sueltos
 * en un tooltip no sirve, así que se muestran los más pesados y el resto se agrega.
 */
import type { Asset } from "@/modules/rich-life/types";

export type LiquidityPart = { name: string; value: number };

export type LiquidityComposition = {
  /** Suma de TODO lo líquido = `liquidWealth` del reporte (misma lista de activos). */
  total: number;
  /** Los componentes más pesados, de mayor a menor. */
  top: LiquidityPart[];
  /** Los que no entraron en `top`: cuántos son y cuánto suman entre todos. */
  restCount: number;
  restValue: number;
};

/**
 * `assets` debe venir ya normalizado a la moneda de visualización (el `allAssets` de
 * getRichLifeSummary lo está), porque acá se suman montos sin convertir.
 */
export function composeLiquidity(assets: Asset[], maxItems = 3): LiquidityComposition {
  const liquid = assets
    .filter((a) => a.assetClass === "liquido" && a.value > 0)
    .sort((a, b) => b.value - a.value);
  const top = liquid.slice(0, maxItems).map((a) => ({ name: a.name, value: a.value }));
  const rest = liquid.slice(maxItems);
  return {
    total: liquid.reduce((s, a) => s + a.value, 0),
    top,
    restCount: rest.length,
    restValue: rest.reduce((s, a) => s + a.value, 0),
  };
}

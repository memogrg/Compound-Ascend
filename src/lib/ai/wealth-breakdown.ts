/**
 * Motor puro del DESGLOSE de patrimonio para el asesor. Agrupa los activos (ya normalizados
 * a la moneda principal por aggregateNetWorth) por `assetClass` y deriva cuánto está
 * INVERTIDO, cuánto LÍQUIDO/ahorros y cuánto en OTROS, más las clases principales por monto.
 * Determinista, sin IO. Lo consumen ambos canales (WhatsApp y web) sobre el MISMO set de
 * activos, para dar el mismo desglose ("cuánto ya invertido / cuánto en ahorros / cómo
 * distribuido") sin recalcular de memoria.
 *
 * Mapeo (enum real de AssetClass = "liquido" | "inversion" | "productivo" | "uso_personal" |
 * "especial"):
 *   - "inversion"                                   → invertido (acciones/bonos/fondos/cripto…)
 *   - "liquido"                                     → líquido / ahorros
 *   - "productivo" | "uso_personal" | "especial"    → otros (bienes raíces, vehículo, etc.)
 *   - cualquier clase desconocida                   → otros (defensivo)
 */

export type WealthClassSlice = { label: string; value: number };

export type WealthBreakdown = {
  invested: number;
  liquid: number;
  other: number;
  topClasses: WealthClassSlice[];
};

/** Forma mínima que necesitamos de un activo (structural: no acopla al tipo Asset). */
type AssetLike = { assetClass: string; value: number };

/** Etiquetas legibles por clase (mismas que el dashboard Rich Life). */
const CLASS_LABEL: Record<string, string> = {
  liquido: "Líquidos",
  inversion: "Inversión",
  productivo: "Productivos",
  uso_personal: "Uso personal",
  especial: "Especiales",
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Agrupa `assets` por clase y devuelve el desglose invertido/líquido/otros + las 3 clases
 * principales por monto (solo con valor > 0), todo en moneda principal. Devuelve `undefined`
 * si no hay activos o si el total no es positivo (nada útil que desglosar).
 */
export function computeWealthBreakdown(assets: AssetLike[]): WealthBreakdown | undefined {
  if (!Array.isArray(assets) || assets.length === 0) return undefined;

  const byClass = new Map<string, number>();
  let invested = 0;
  let liquid = 0;
  let other = 0;

  for (const a of assets) {
    const cls = typeof a?.assetClass === "string" ? a.assetClass : "";
    const value = Number(a?.value);
    if (!Number.isFinite(value)) continue;
    byClass.set(cls, (byClass.get(cls) ?? 0) + value);
    if (cls === "inversion") invested += value;
    else if (cls === "liquido") liquid += value;
    else other += value;
  }

  if (invested + liquid + other <= 0) return undefined;

  const topClasses: WealthClassSlice[] = [...byClass.entries()]
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cls, value]) => ({ label: CLASS_LABEL[cls] ?? cls, value: round2(value) }));

  return {
    invested: round2(invested),
    liquid: round2(liquid),
    other: round2(other),
    topClasses,
  };
}

/**
 * Planeador PURO del aporte a una posición EXISTENTE. No toca la BD ni React: decide qué
 * números resultan de aportar `amount` a un holding según su tipo. La escritura (merge de
 * costo para cotizados, subida de valor para manuales), su guarda de moneda y el rollback
 * viven en holdings-service; esto es la aritmética aislada, para poder fijarla con un test
 * de multimoneda.
 *
 * Regla de moneda: TODO queda en la moneda del holding — nunca se convierte, igual que la
 * captura del resto del módulo. Un holding en USD produce un plan en USD aunque la moneda
 * principal sea CRC. Convertir aquí sería el bug que la auditoría de moneda ya cerró.
 */
import type { AssetType } from "@/modules/wealth/types";

/** Cotizados: aportar promedia el costo unitario (más unidades). Manuales/flujo (certificado,
 *  inmueble, bono, fondo, pensión…): aportar sube el valor invertido y el valor actual. */
const QUOTED_TYPES = new Set<AssetType>(["etf", "accion", "cripto"]);

export function isQuotedType(assetType: AssetType): boolean {
  return QUOTED_TYPES.has(assetType);
}

export type ContributionPlan =
  | { kind: "quoted"; quantity: number; unitPrice: number; currency: string }
  | { kind: "manual"; addedAmount: number; newInvested: number; newValue: number; currency: string };

export function planContribution(
  holding: {
    assetType: AssetType;
    currency: string;
    quantity: number;
    averageCost: number;
    currentValueManual?: number | null;
  },
  input: { amount: number; unitPrice?: number },
): ContributionPlan {
  if (isQuotedType(holding.assetType)) {
    // Cotizado: sin precio no hay forma de saber cuántas unidades compró el importe, y el
    // costo base se corrompería. Se exige el precio (lo prefija la hoja con el costo promedio).
    if (!input.unitPrice || input.unitPrice <= 0) {
      throw new Error("Un aporte a una inversión cotizada necesita el precio por unidad.");
    }
    return {
      kind: "quoted",
      quantity: input.amount / input.unitPrice,
      unitPrice: input.unitPrice,
      currency: holding.currency,
    };
  }
  // Manual: el valor de referencia es el manual si existe; si no, el invertido (cantidad×costo).
  const oldInvested = holding.quantity * holding.averageCost;
  const oldValue = holding.currentValueManual ?? oldInvested;
  return {
    kind: "manual",
    addedAmount: input.amount,
    newInvested: oldInvested + input.amount,
    newValue: oldValue + input.amount,
    currency: holding.currency,
  };
}

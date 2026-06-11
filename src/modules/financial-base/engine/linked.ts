/**
 * Builders puros del orquestador de vínculos (Fase 1). Mapean un evento de
 * otro módulo (pago de deuda, dividendo, renta, aporte a meta) al input de
 * transacción vinculada. Sin IO: testeables de forma aislada.
 */
import type { TxnInput } from "@/modules/financial-base/schemas";

export type LinkedTxnInput = TxnInput;

/** Pago de deuda → gasto vinculado. El monto es el total que salió (cuota + extra). */
export function debtPaymentToTxn(args: {
  debtId: string;
  debtName: string;
  currency: string;
  paymentDate: string;
  amount: number;
  extraAmount?: number;
  categoryId?: string | null;
}): LinkedTxnInput {
  return {
    kind: "gasto",
    amount: args.amount + (args.extraAmount ?? 0),
    currency: args.currency,
    occurredOn: args.paymentDate,
    categoryId: args.categoryId ?? null,
    merchantOrSource: args.debtName,
    description: `Pago — ${args.debtName}`,
    status: "confirmed",
    origin: "manual",
    linkedKind: "debt",
    linkedId: args.debtId,
  };
}

/** Aporte a meta de ahorro → gasto vinculado (sale del flujo del mes). */
export function goalContributionToTxn(args: {
  goalId: string;
  goalName: string;
  currency: string;
  contributionDate: string;
  amount: number;
  categoryId?: string | null;
}): LinkedTxnInput {
  return {
    kind: "gasto",
    amount: args.amount,
    currency: args.currency,
    occurredOn: args.contributionDate,
    categoryId: args.categoryId ?? null,
    merchantOrSource: args.goalName,
    description: `Aporte — ${args.goalName}`,
    status: "confirmed",
    origin: "manual",
    linkedKind: "goal",
    linkedId: args.goalId,
  };
}

/** Dividendo recibido → ingreso vinculado al holding. */
export function dividendToTxn(args: {
  holdingId: string;
  label: string;
  currency: string;
  paymentDate: string;
  amount: number;
  categoryId?: string | null;
}): LinkedTxnInput {
  return {
    kind: "ingreso",
    amount: args.amount,
    currency: args.currency,
    occurredOn: args.paymentDate,
    categoryId: args.categoryId ?? null,
    merchantOrSource: args.label,
    description: `Dividendo — ${args.label}`,
    status: "confirmed",
    origin: "manual",
    linkedKind: "holding",
    linkedId: args.holdingId,
  };
}

/**
 * Monto del gasto de una compra/aporte de inversión (Fase 4.1): lo PAGADO,
 * es decir cantidad × costo unitario. El valor manual del activo es
 * valuación (puede venir apreciado), no flujo de caja — solo se usa como
 * fallback si no se ingresó costo.
 */
export function purchaseExpenseAmount(args: {
  isRental: boolean;
  quantity: number;
  averageCost: number;
  currentValueManual?: number | null;
}): number {
  const paid = args.quantity * args.averageCost;
  const amount =
    paid > 0 ? paid : args.isRental ? (args.currentValueManual ?? 0) : paid;
  return Math.round(amount * 100) / 100;
}

/**
 * Monto del gasto cuando un edit aumenta la posición (Fase 4.1): solo el
 * delta positivo cuenta como aporte; un delta ≤ 0 (corrección o venta por
 * edit) no genera gasto. Devuelve 0 si no hay aporte.
 */
export function positionIncreaseAmount(args: {
  isRental: boolean;
  oldQuantity: number;
  newQuantity: number;
  averageCost: number;
  oldManualValue?: number | null;
  newManualValue?: number | null;
}): number {
  if (args.isRental) {
    const delta = (args.newManualValue ?? 0) - (args.oldManualValue ?? 0);
    return delta > 0 ? Math.round(delta * 100) / 100 : 0;
  }
  const delta = args.newQuantity - args.oldQuantity;
  return delta > 0 ? Math.round(delta * args.averageCost * 100) / 100 : 0;
}

/** Compra/aporte de inversión → gasto vinculado al holding (Fase 4.1). */
export function holdingPurchaseToTxn(args: {
  holdingId: string;
  label: string;
  currency: string;
  purchaseDate: string;
  amount: number;
  verb: "Compra" | "Aporte";
  categoryId?: string | null;
}): LinkedTxnInput {
  return {
    kind: "gasto",
    amount: args.amount,
    currency: args.currency,
    occurredOn: args.purchaseDate,
    categoryId: args.categoryId ?? null,
    merchantOrSource: args.label,
    description: `${args.verb} — ${args.label}`,
    status: "confirmed",
    origin: "manual",
    linkedKind: "holding",
    linkedId: args.holdingId,
  };
}

/** Venta/retiro parcial de una posición → ingreso vinculado al holding. */
export function holdingSaleToTxn(args: {
  holdingId: string;
  label: string;
  currency: string;
  saleDate: string;
  amount: number;
  categoryId?: string | null;
}): LinkedTxnInput {
  return {
    kind: "ingreso",
    amount: args.amount,
    currency: args.currency,
    occurredOn: args.saleDate,
    categoryId: args.categoryId ?? null,
    merchantOrSource: args.label,
    description: `Venta — ${args.label}`,
    status: "confirmed",
    origin: "manual",
    linkedKind: "holding",
    linkedId: args.holdingId,
  };
}

/** Retiro de una meta de ahorro → ingreso vinculado a la meta. */
export function goalWithdrawalToTxn(args: {
  goalId: string;
  goalName: string;
  currency: string;
  withdrawalDate: string;
  amount: number;
  note?: string;
}): LinkedTxnInput {
  const note = args.note?.trim();
  return {
    kind: "ingreso",
    amount: args.amount,
    currency: args.currency,
    occurredOn: args.withdrawalDate,
    categoryId: null,
    merchantOrSource: args.goalName,
    description: note ? `Retiro — ${args.goalName} · ${note}` : `Retiro — ${args.goalName}`,
    status: "confirmed",
    origin: "manual",
    linkedKind: "goal",
    linkedId: args.goalId,
  };
}

/** Renta cobrada (inmueble/Airbnb/etc.) → ingreso vinculado al activo. */
export function rentalPaymentToTxn(args: {
  holdingId: string;
  label: string;
  currency: string;
  receivedOn: string;
  amount: number;
  categoryId?: string | null;
}): LinkedTxnInput {
  return {
    kind: "ingreso",
    amount: args.amount,
    currency: args.currency,
    occurredOn: args.receivedOn,
    categoryId: args.categoryId ?? null,
    merchantOrSource: args.label,
    description: `Renta — ${args.label}`,
    status: "confirmed",
    origin: "manual",
    linkedKind: "rental",
    linkedId: args.holdingId,
  };
}

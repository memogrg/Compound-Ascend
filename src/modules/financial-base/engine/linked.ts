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
}): LinkedTxnInput {
  return {
    kind: "ingreso",
    amount: args.amount,
    currency: args.currency,
    occurredOn: args.withdrawalDate,
    categoryId: null,
    merchantOrSource: args.goalName,
    description: `Retiro — ${args.goalName}`,
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

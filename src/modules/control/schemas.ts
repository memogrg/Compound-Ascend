/** Validación Zod de objetivos y deudas (Módulo 3). */
import { z } from "zod";
import { notFutureDate, NOT_FUTURE_MSG } from "@/lib/validation";

export const goalInputSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre").max(120),
  goalType: z.string().max(40).optional(),
  targetAmount: z.number().nonnegative("No puede ser negativo"),
  currentAmount: z.number().nonnegative().default(0),
  monthlyContribution: z.number().nonnegative().default(0),
  currency: z.string().length(3),
  targetDate: z.string().optional(),
  priority: z.enum(["alta", "media", "baja"]).optional(),
});

export const debtInputSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre").max(120),
  debtType: z.string().max(40).optional(),
  bank: z.string().trim().max(80).optional(),
  balance: z.number().nonnegative("No puede ser negativo"),
  minPayment: z.number().nonnegative().default(0),
  currentPayment: z.number().nonnegative().default(0),
  apr: z.number().min(0).max(200).optional(),
  currency: z.string().length(3),
  delinquency: z.enum(["no", "1_30", "31_60", "60_mas"]).optional(),
  stress: z.number().int().min(1).max(10).optional(),
  // ── Calculadora / amortización ──
  originalAmount: z.number().nonnegative().optional(),
  rateType: z.enum(["fija", "variable"]).optional(),
  rateIndex: z.enum(["prime", "tbp", "tri"]).optional(),
  rateSpread: z.number().min(0).max(100).optional(),
  introFixedMonths: z.number().int().min(0).max(600).optional(),
  introApr: z.number().min(0).max(200).optional(),
  termMonths: z.number().int().min(0).max(1200).optional(),
  startDate: z.string().optional(),
  extraMonthly: z.number().nonnegative().optional(),
  insurance: z.number().nonnegative().optional(),
  notes: z.string().max(500).optional(),
});

/** Pago reportado sobre una deuda. */
export const debtPaymentInputSchema = z.object({
  debtId: z.string().uuid(),
  paymentDate: z.string().min(1).refine(notFutureDate, { message: NOT_FUTURE_MSG }),
  amount: z.number().nonnegative(),
  extraAmount: z.number().nonnegative().default(0),
  extraMode: z.enum(["tiempo", "cuota"]).optional(),
  kind: z.enum(["ordinario", "extraordinario"]).default("ordinario"),
});

export type GoalInput = z.infer<typeof goalInputSchema>;
export type DebtInputForm = z.infer<typeof debtInputSchema>;
export type DebtPaymentInput = z.infer<typeof debtPaymentInputSchema>;

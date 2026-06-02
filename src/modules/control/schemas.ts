/** Validación Zod de objetivos y deudas (Módulo 3). */
import { z } from "zod";

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
  balance: z.number().nonnegative("No puede ser negativo"),
  minPayment: z.number().nonnegative().default(0),
  currentPayment: z.number().nonnegative().default(0),
  apr: z.number().min(0).max(200).optional(),
  currency: z.string().length(3),
  delinquency: z.enum(["no", "1_30", "31_60", "60_mas"]).optional(),
  stress: z.number().int().min(1).max(10).optional(),
});

export type GoalInput = z.infer<typeof goalInputSchema>;
export type DebtInputForm = z.infer<typeof debtInputSchema>;

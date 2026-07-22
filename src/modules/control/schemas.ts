/** Validación Zod de objetivos y deudas (Módulo 3). */
import { z } from "zod";
import { notFutureDate, NOT_FUTURE_MSG } from "@/lib/validation";

export const goalInputSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre").max(120),
  goalType: z.string().max(40).optional(),
  // Tipo de ahorro: 'meta' (con objetivo) o 'sobre' (acumulador sin meta).
  kind: z.enum(["meta", "sobre"]).default("meta"),
  // Nullable/opcional: un sobre no lleva meta.
  targetAmount: z.number().nonnegative("No puede ser negativo").nullable().optional(),
  currentAmount: z.number().nonnegative().default(0),
  monthlyContribution: z.number().nonnegative().default(0),
  currency: z.string().length(3),
  targetDate: z.string().optional(),
  priority: z.enum(["alta", "media", "baja"]).optional(),
  // Frascos recurrentes: cadencia de reinicio. 'ninguna' = one-shot (default).
  recurrence: z
    .enum(["ninguna", "mensual", "trimestral", "semestral", "anual"])
    .default("ninguna"),
  // Monto pleno del período (al que se restaura target_amount). Opcional: si se
  // omite en un frasco recurrente, se usa targetAmount.
  periodAmount: z.number().nonnegative().optional(),
  // Categoría por defecto del frasco (opcional): se precarga al gastar.
  defaultCategoryId: z.string().uuid().optional().nullable(),
  // Póliza vinculada (meta de ahorro de la prima de un seguro de Defensa).
  policyId: z.string().uuid().optional().nullable(),
  isEssential: z.boolean().optional(),
  // Referencia "dónde está el dinero" (columna stored_in reusada): texto libre
  // informativo que además alimenta la liquidez de Rich Life (savingsLiquidity).
  storedIn: z.string().trim().max(120).optional().nullable(),
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
  isEssential: z.boolean().optional(),
});

/** Pago reportado sobre una deuda. */
export const debtPaymentInputSchema = z.object({
  debtId: z.string().uuid(),
  paymentDate: z.string().min(1).refine(notFutureDate, { message: NOT_FUTURE_MSG }),
  amount: z.number().nonnegative(),
  extraAmount: z.number().nonnegative().default(0),
  extraMode: z.enum(["tiempo", "cuota"]).optional(),
  kind: z.enum(["ordinario", "extraordinario"]).default("ordinario"),
  /**
   * Moneda en la que viene `amount`. Opcional por compatibilidad con quien no la manda,
   * pero cuando llega, el servicio comprueba que sea la de la deuda y rechaza si no.
   *
   * Existe porque el importe y su etiqueta salían de sitios distintos: el formulario
   * precargaba la cuota convertida a la moneda principal y el guardado la escribía con la
   * moneda de la deuda. Ese desajuste no se podía expresar, así que se guardaba callado.
   */
  currency: z.string().length(3).optional(),
});

export type GoalInput = z.infer<typeof goalInputSchema>;
export type DebtInputForm = z.infer<typeof debtInputSchema>;
export type DebtPaymentInput = z.infer<typeof debtPaymentInputSchema>;

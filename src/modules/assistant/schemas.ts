/** Validación del asistente IA: transacciones y solicitudes de chat. */
import { z } from "zod";

export const transactionInputSchema = z
  .object({
    kind: z.enum(["ingreso", "gasto"]),
    description: z.string().trim().min(1, "Describe la transacción").max(160),
    amount: z
      .number({ error: "Monto inválido" })
      .positive("El monto debe ser mayor a 0"),
    currency: z.string().length(3),
    occurredOn: z.string().min(8).max(10), // YYYY-MM-DD
    category: z.string().max(60).optional(), // etiqueta legible (display); no persiste
    // El SOBRE (hoja) elegido/confirmado por el usuario en la card. null = "Sin sobre"
    // (cae a "Por clasificar"). El display "Frasco › Sobre" no viaja: se deriva del id.
    categoryId: z.string().uuid().nullable().optional(),
    source: z.enum(["manual", "chat", "receipt"]).default("chat"),
    // Fase 5: la IA puede proponer la transacción ya vinculada a una entidad.
    // El usuario la ve y confirma; nunca se ejecuta sola.
    linkedKind: z.enum(["debt", "goal", "holding", "policy", "rental"]).nullable().optional(),
    linkedId: z.string().uuid().nullable().optional(),
  })
  .refine((d) => !d.linkedKind || !!d.linkedId, {
    message: "Un vínculo necesita la entidad (linkedId).",
    path: ["linkedId"],
  });

export type TransactionInput = z.infer<typeof transactionInputSchema>;

/**
 * Alerta de PRECIO propuesta por el asistente (símbolo + objetivo). La DIRECCIÓN no viaja: la
 * infiere el servidor con el precio actual (createInvestmentAlert). assetType gatea "cotizable".
 */
export const priceAlertInputSchema = z.object({
  symbol: z.string().trim().min(1, "Falta el símbolo").max(12),
  targetPrice: z.number({ error: "Precio inválido" }).positive("El precio objetivo debe ser mayor a 0"),
  assetType: z.enum(["etf", "accion", "cripto"]),
  currency: z.string().length(3),
});

export type PriceAlertInput = z.infer<typeof priceAlertInputSchema>;

/**
 * Confirmaciones de las acciones que nacen de un CONSEJO. Los ids ya vienen resueltos contra los
 * datos reales por `resolveActionProposal`; acá se valida la forma antes de ejecutar el dominio.
 */
export const setDcaInputSchema = z.object({
  holdingId: z.string().uuid(),
  monthlyContribution: z.number().nonnegative(),
});
export type SetDcaInput = z.infer<typeof setDcaInputSchema>;

export const adjustBudgetInputSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  amount: z.number().nonnegative(),
  currency: z.string().length(3),
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(2000).max(3000),
});
export type AdjustBudgetInput = z.infer<typeof adjustBudgetInputSchema>;

export const debtExtraPaymentInputSchema = z.object({
  debtId: z.string().uuid(),
  amount: z.number().positive(),
  paymentDate: z.string().min(1),
  currency: z.string().length(3).optional(),
});
export type DebtExtraPaymentInput = z.infer<typeof debtExtraPaymentInputSchema>;

/**
 * Alta EN LOTE de las transacciones que faltaban del estado de cuenta.
 *
 * Es una action nueva y no N llamadas a confirmTransactionAction: con 12 filas serían 12 round
 * trips y, sobre todo, 12 resultados sueltos que la tarjeta no podría reportar como un todo. Acá
 * el lote se ejecuta fila por fila con `createTransaction` —la MISMA función del alta individual,
 * así que cada una pasa por el pipeline central (auto-categorización, vínculos, household)— y se
 * devuelve cuántas entraron y cuáles no.
 */
export const batchTransactionsInputSchema = z.object({
  rows: z
    .array(
      z.object({
        kind: z.enum(["ingreso", "gasto"]),
        description: z.string().trim().min(1).max(160),
        amount: z.number().positive(),
        currency: z.string().length(3),
        occurredOn: z.string().min(8).max(10),
        categoryId: z.string().uuid().nullable().optional(),
      }),
    )
    .min(1)
    // Tope duro: un estado de cuenta pegado son decenas de filas, no cientos. Sin tope, un pegado
    // accidental dispararía cientos de inserts detrás de un solo tap.
    .max(60),
});
export type BatchTransactionsInput = z.infer<typeof batchTransactionsInputSchema>;

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(20)
    .default([]),
  /**
   * Mensaje del historial que el usuario está CITANDO (chat_messages.id). El servidor lo resuelve
   * bajo RLS antes de usarlo: un id ajeno o ya borrado por la retención se degrada con aviso.
   */
  replyToMessageId: z.string().uuid().nullish(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

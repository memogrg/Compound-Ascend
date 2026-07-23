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

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) }))
    .max(20)
    .default([]),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

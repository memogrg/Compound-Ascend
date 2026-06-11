"use server";

/**
 * Acción de confirmación de transacción. Es el ÚNICO punto que ejecuta la
 * creación tras la confirmación explícita del usuario (desde el wizard, la
 * tarjeta de acción de IA o el receipt scanner). El endpoint de chat nunca crea.
 */
import { revalidatePath } from "next/cache";
import { transactionInputSchema } from "@/modules/assistant/schemas";
import { createTransaction } from "@/modules/assistant/services/transaction-service";
import { isSupabaseConfigured } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

export type ConfirmResult = { ok: boolean; message?: string };

export async function confirmTransactionAction(raw: unknown): Promise<ConfirmResult> {
  const parsed = transactionInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Conecta Supabase para guardar la transacción." };
  }
  try {
    await createTransaction(parsed.data);
    revalidatePath("/mi-base-financiera");
    revalidatePath("/dashboard");
    // El pipeline central puede vincular/propagar (Fase 5).
    revalidatePath("/transacciones");
    revalidatePath("/deudas");
    revalidatePath("/ahorro");
    return { ok: true };
  } catch (err) {
    logger.error("confirmTransaction fallido", { message: err instanceof Error ? err.message : "?" });
    // La validación de entidad vinculada (Fase 6.1) es un mensaje para el
    // usuario ("...ya no existe o no te pertenece"), no un error técnico.
    const msg =
      err instanceof Error && err.message.includes("ya no existe o no te pertenece")
        ? err.message
        : "No pudimos guardar la transacción.";
    return { ok: false, message: msg };
  }
}

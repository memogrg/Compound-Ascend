"use server";

/**
 * Acción de confirmación de transacción. Es el ÚNICO punto que ejecuta la
 * creación tras la confirmación explícita del usuario (desde el wizard, la
 * tarjeta de acción de IA o el receipt scanner). El endpoint de chat nunca crea.
 */
import { revalidatePath } from "next/cache";
import { transactionInputSchema } from "@/modules/assistant/schemas";
import { createTransaction } from "@/modules/assistant/services/transaction-service";
import { listSobresForKind, getSobreRemaining } from "@/modules/financial-base";
import type { SobreOption, SobreRemaining } from "@/modules/financial-base";
import { createGoal, goalInputSchema } from "@/modules/control";
import { isSupabaseConfigured } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

/** `sobre` viaja solo para un GASTO con sobre → mensaje de restante en el chat. */
export type ConfirmResult = { ok: boolean; message?: string; sobre?: SobreRemaining };

/**
 * Sobres (hojas) del usuario para el selector de la card de confirmación, con su frasco para
 * mostrar "Frasco › Sobre". Reusa el motor de categorización; RLS acota al hogar. Best-effort:
 * si no hay sesión/Supabase, devuelve vacío y la card muestra solo "Sin sobre".
 */
export async function listSobresForKindAction(
  kind: "gasto" | "ingreso",
): Promise<SobreOption[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    return await listSobresForKind(kind);
  } catch (err) {
    logger.warn("listSobresForKind fallido", { message: err instanceof Error ? err.message : "?" });
    return [];
  }
}

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
    // Restante del sobre para el mensaje del chat — SOLO gasto con sobre (ingreso / "Sin sobre"
    // no aplican). Best-effort: lo lee DESPUÉS de crear, así ya descuenta esta transacción; si
    // falla, se degrada al éxito genérico sin cifra inventada.
    let sobre: SobreRemaining | undefined;
    if (parsed.data.kind === "gasto" && parsed.data.categoryId) {
      sobre =
        (await getSobreRemaining(parsed.data.categoryId, parsed.data.occurredOn)) ?? undefined;
    }
    return sobre ? { ok: true, sobre } : { ok: true };
  } catch (err) {
    logger.error("confirmTransaction fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    // La validación de entidad vinculada (Fase 6.1) es un mensaje para el
    // usuario ("...ya no existe o no te pertenece"), no un error técnico.
    const msg =
      err instanceof Error && err.message.includes("ya no existe o no te pertenece")
        ? err.message
        : "No pudimos guardar la transacción.";
    return { ok: false, message: msg };
  }
}

/**
 * Confirma y crea una meta de ahorro propuesta por la IA. Mismo patrón que
 * confirmTransactionAction: valida con goalInputSchema y crea recién tras la confirmación
 * explícita del usuario (la ActionCard). El endpoint de chat nunca crea.
 */
export async function confirmGoalAction(raw: unknown): Promise<ConfirmResult> {
  const parsed = goalInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Conecta Supabase para guardar la meta." };
  }
  try {
    await createGoal(parsed.data);
    revalidatePath("/ahorro");
    revalidatePath("/dashboard");
    revalidatePath("/control-financiero");
    return { ok: true };
  } catch (err) {
    logger.error("confirmGoal fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos crear la meta." };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { notFutureDate, NOT_FUTURE_MSG } from "@/lib/validation";
import {
  goalInputSchema,
  debtInputSchema,
  debtPaymentInputSchema,
} from "@/modules/control/schemas";
import {
  createGoal,
  createDebt,
  updateGoal,
  updateDebt,
  deleteGoal,
  deleteDebt,
  addDebtPayment,
  updateDebtPayment,
  deleteDebtPayment,
  addGoalContribution,
  withdrawFromGoal,
} from "@/modules/control/services/control-service";
import { addPolicyAction } from "@/modules/wealth";
import { isSupabaseConfigured } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

export type ActionResult = { ok: boolean; fieldErrors?: Record<string, string>; message?: string };

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "form");
    if (!out[k]) out[k] = i.message;
  }
  return out;
}

export async function addGoalAction(raw: unknown): Promise<ActionResult> {
  const parsed = goalInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await createGoal(parsed.data);
    revalidatePath("/control-financiero");
    return { ok: true };
  } catch (err) {
    logger.error("addGoal fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos guardar el objetivo." };
  }
}

/**
 * Alta de una póliza de defensa desde el flujo de ahorro (toggle "Defensa").
 * Delega en la action de Patrimonio (misma validación/persistencia; sin duplicar
 * servicio) y además revalida la pantalla de Ahorro desde la que se creó.
 */
export async function addDefensePolicyAction(raw: unknown): Promise<ActionResult> {
  const res = await addPolicyAction(raw);
  if (res.ok) revalidatePath("/control-financiero");
  return res;
}

export async function addDebtAction(raw: unknown): Promise<ActionResult> {
  const parsed = debtInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await createDebt(parsed.data);
    revalidatePath("/control-financiero");
    return { ok: true };
  } catch (err) {
    logger.error("addDebt fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos guardar la deuda." };
  }
}

export async function editGoalAction(id: string, raw: unknown): Promise<ActionResult> {
  const parsed = goalInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await updateGoal(id, parsed.data);
    revalidatePath("/control-financiero");
    return { ok: true };
  } catch (err) {
    logger.error("editGoal fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos actualizar el objetivo." };
  }
}

export async function editDebtAction(id: string, raw: unknown): Promise<ActionResult> {
  const parsed = debtInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await updateDebt(id, parsed.data);
    revalidatePath("/control-financiero");
    return { ok: true };
  } catch (err) {
    logger.error("editDebt fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos actualizar la deuda." };
  }
}

export async function reportPaymentAction(raw: unknown): Promise<ActionResult> {
  const parsed = debtPaymentInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await addDebtPayment(parsed.data);
    revalidatePath("/deudas");
    revalidatePath(`/deudas/${parsed.data.debtId}`);
    // El pago también nace como transacción vinculada (Fase 1 · orquestador).
    revalidatePath("/transacciones");
    revalidatePath("/mi-base-financiera");
    return { ok: true };
  } catch (err) {
    logger.error("reportPayment fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos registrar el pago." };
  }
}

/** Edita un pago reportado (actualiza pago + transacción vinculada). */
export async function updateDebtPaymentAction(
  paymentId: string,
  raw: unknown,
): Promise<ActionResult> {
  const parsed = debtPaymentInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await updateDebtPayment(paymentId, parsed.data);
    revalidatePath("/deudas");
    revalidatePath(`/deudas/${parsed.data.debtId}`);
    revalidatePath("/transacciones");
    revalidatePath("/mi-base-financiera");
    return { ok: true };
  } catch (err) {
    logger.error("updateDebtPayment fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos actualizar el pago." };
  }
}

/** Elimina un pago reportado y revierte su transacción vinculada. */
export async function deleteDebtPaymentAction(
  paymentId: string,
  debtId: string,
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await deleteDebtPayment(paymentId);
    revalidatePath("/deudas");
    revalidatePath(`/deudas/${debtId}`);
    revalidatePath("/transacciones");
    revalidatePath("/mi-base-financiera");
    return { ok: true };
  } catch (err) {
    logger.error("deleteDebtPayment fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos eliminar el pago." };
  }
}

const goalContributionSchema = z.object({
  goalId: z.string().uuid(),
  amount: z.number().positive("Debe ser mayor a 0"),
  contributionDate: z.string().min(8).max(10).refine(notFutureDate, { message: NOT_FUTURE_MSG }),
});

/** Aporte a meta: sube current_amount y crea la transacción vinculada. */
export async function addGoalContributionAction(raw: unknown): Promise<ActionResult> {
  const parsed = goalContributionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await addGoalContribution(parsed.data);
    revalidatePath("/control-financiero");
    revalidatePath("/ahorro");
    revalidatePath("/transacciones");
    revalidatePath("/mi-base-financiera");
    return { ok: true };
  } catch (err) {
    logger.error("addGoalContribution fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos registrar el aporte." };
  }
}

const goalWithdrawalSchema = z.object({
  goalId: z.string().uuid(),
  amount: z.number().positive("Debe ser mayor a 0"),
  withdrawalDate: z.string().min(8).max(10).refine(notFutureDate, { message: NOT_FUTURE_MSG }),
  note: z.string().max(280).optional(),
});

/** Retiro de meta: baja current_amount y crea el ingreso vinculado (Fase 4). */
export async function withdrawGoalAction(raw: unknown): Promise<ActionResult> {
  const parsed = goalWithdrawalSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await withdrawFromGoal(parsed.data);
    revalidatePath("/control-financiero");
    revalidatePath("/ahorro");
    revalidatePath("/transacciones");
    revalidatePath("/mi-base-financiera");
    return { ok: true };
  } catch (err) {
    logger.error("withdrawGoal fallido", { message: err instanceof Error ? err.message : "?" });
    // La validación de saldo es un mensaje para el usuario, no un error técnico.
    const msg =
      err instanceof Error && err.message.startsWith("No puedes retirar")
        ? err.message
        : "No pudimos registrar el retiro.";
    return { ok: false, message: msg };
  }
}

export async function removeGoalAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await deleteGoal(id);
    revalidatePath("/control-financiero");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function removeDebtAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await deleteDebt(id);
    revalidatePath("/control-financiero");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

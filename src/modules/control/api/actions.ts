"use server";

import { revalidatePath } from "next/cache";
import { goalInputSchema, debtInputSchema, debtPaymentInputSchema } from "@/modules/control/schemas";
import {
  createGoal,
  createDebt,
  updateGoal,
  updateDebt,
  deleteGoal,
  deleteDebt,
  addDebtPayment,
} from "@/modules/control/services/control-service";
import { isSupabaseConfigured } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

export type ActionResult = { ok: boolean; fieldErrors?: Record<string, string>; message?: string };

function fieldErrors(issues: { path: (string | number)[]; message: string }[]) {
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
    revalidatePath("/control-financiero/deudas");
    revalidatePath(`/control-financiero/deudas/${parsed.data.debtId}`);
    return { ok: true };
  } catch (err) {
    logger.error("reportPayment fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos registrar el pago." };
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

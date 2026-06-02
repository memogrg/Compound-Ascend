"use server";

/**
 * Server Actions del Módulo 2. Validan con Zod y persisten respetando RLS.
 * Revalidan la ruta para reflejar cambios. No persisten si Supabase no está
 * configurado (dev), devolviendo un resultado controlado.
 */
import { revalidatePath } from "next/cache";
import { incomeInputSchema, expenseInputSchema } from "@/modules/financial-base/schemas";
import {
  createIncome,
  createExpense,
  deleteIncome,
  deleteExpense,
} from "@/modules/financial-base/services/base-service";
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

export async function addIncomeAction(raw: unknown): Promise<ActionResult> {
  const parsed = incomeInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await createIncome(parsed.data);
    revalidatePath("/mi-base-financiera");
    return { ok: true };
  } catch (err) {
    logger.error("addIncome fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos guardar el ingreso." };
  }
}

export async function addExpenseAction(raw: unknown): Promise<ActionResult> {
  const parsed = expenseInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await createExpense(parsed.data);
    revalidatePath("/mi-base-financiera");
    return { ok: true };
  } catch (err) {
    logger.error("addExpense fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos guardar el gasto." };
  }
}

export async function removeIncomeAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await deleteIncome(id);
    revalidatePath("/mi-base-financiera");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function removeExpenseAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await deleteExpense(id);
    revalidatePath("/mi-base-financiera");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

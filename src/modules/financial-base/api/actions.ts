"use server";

/**
 * Server Actions del Módulo 2. Validan con Zod y persisten respetando RLS.
 * Revalidan la ruta para reflejar cambios. No persisten si Supabase no está
 * configurado (dev), devolviendo un resultado controlado.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { incomeInputSchema, expenseInputSchema } from "@/modules/financial-base/schemas";
import {
  createIncome,
  createExpense,
  updateIncome,
  updateExpense,
  deleteIncome,
  deleteExpense,
} from "@/modules/financial-base/services/base-service";
import {
  setOpeningBalance,
  reconcileBalance,
} from "@/modules/financial-base/services/liquidity-service";
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

export async function editIncomeAction(id: string, raw: unknown): Promise<ActionResult> {
  const parsed = incomeInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await updateIncome(id, parsed.data);
    revalidatePath("/mi-base-financiera");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    logger.error("editIncome fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos actualizar el ingreso." };
  }
}

export async function editExpenseAction(id: string, raw: unknown): Promise<ActionResult> {
  const parsed = expenseInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await updateExpense(id, parsed.data);
    revalidatePath("/mi-base-financiera");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    logger.error("editExpense fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos actualizar el gasto." };
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

// ── Saco de Liquidez ("Tu Liquidez") ──
const openingSchema = z.number().min(0, "El saldo no puede ser negativo.");
const reconcileSchema = z.number().min(0, "El saldo no puede ser negativo.");

/** Fija el saldo inicial de liquidez (estado vacío). */
export async function setOpeningBalanceAction(amount: number): Promise<ActionResult> {
  const parsed = openingSchema.safeParse(amount);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Monto no válido." };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await setOpeningBalance(parsed.data);
    revalidatePath("/mi-base-financiera");
    return { ok: true };
  } catch (err) {
    logger.error("setOpeningBalance fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos guardar tu saldo inicial." };
  }
}

/** Reconciliación 1-toque: ajusta el saldo al valor real de hoy. */
export async function reconcileBalanceAction(realBalance: number): Promise<ActionResult> {
  const parsed = reconcileSchema.safeParse(realBalance);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Monto no válido." };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await reconcileBalance(parsed.data);
    revalidatePath("/mi-base-financiera");
    return { ok: true };
  } catch (err) {
    logger.error("reconcileBalance fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos ajustar tu saldo." };
  }
}

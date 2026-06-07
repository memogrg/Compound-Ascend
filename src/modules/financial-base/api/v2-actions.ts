"use server";

/**
 * Server Actions de Base Financiera V2 (presupuesto, transacciones, cuentas).
 * Regla de oro: lo real vive en `transactions`; el presupuesto en `budget_items`.
 * Toda mutación revalida /mi-base-financiera y /dashboard.
 */
import { revalidatePath } from "next/cache";
import {
  budgetItemInputSchema,
  txnInputSchema,
  accountInputSchema,
  ruleInputSchema,
  transferInputSchema,
  csvTxnSchema,
} from "@/modules/financial-base/schemas";
import type { CsvTxnInput } from "@/modules/financial-base/schemas";
import { createRule, updateRule, deleteRule } from "@/modules/financial-base/services/rules-service";
import { extractReceipt, type ReceiptExtraction } from "@/modules/financial-base/services/receipt-service";
import {
  createBudgetItem,
  updateBudgetItem,
  deleteBudgetItem,
} from "@/modules/financial-base/services/budget-service";
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  duplicateTransaction,
  markReviewed,
  splitTransaction,
  createTransfer,
  importTransactions,
  getReceiptSignedUrl,
} from "@/modules/financial-base/services/transaction-service";
import {
  createAccount,
  updateAccount,
  deleteAccount,
} from "@/modules/financial-base/services/accounts-service";
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

function revalidate() {
  revalidatePath("/mi-base-financiera");
  revalidatePath("/dashboard");
}

// ---------- Presupuesto ----------
export async function addBudgetItemAction(raw: unknown): Promise<ActionResult> {
  const parsed = budgetItemInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await createBudgetItem(parsed.data);
    revalidate();
    return { ok: true };
  } catch (err) {
    logger.error("addBudgetItem fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos guardar el ítem de presupuesto." };
  }
}

export async function editBudgetItemAction(id: string, raw: unknown): Promise<ActionResult> {
  const parsed = budgetItemInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await updateBudgetItem(id, parsed.data);
    revalidate();
    return { ok: true };
  } catch (err) {
    logger.error("editBudgetItem fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos actualizar el presupuesto." };
  }
}

export async function removeBudgetItemAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await deleteBudgetItem(id);
    revalidate();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// ---------- Transacciones (lo real) ----------
export async function addTransactionAction(raw: unknown): Promise<ActionResult> {
  const parsed = txnInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await createTransaction(parsed.data);
    revalidate();
    return { ok: true };
  } catch (err) {
    logger.error("addTransaction fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos guardar la transacción." };
  }
}

export async function editTransactionAction(id: string, raw: unknown): Promise<ActionResult> {
  const parsed = txnInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await updateTransaction(id, parsed.data);
    revalidate();
    return { ok: true };
  } catch (err) {
    logger.error("editTransaction fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos actualizar la transacción." };
  }
}

export async function removeTransactionAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await deleteTransaction(id);
    revalidate();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function duplicateTransactionAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await duplicateTransaction(id);
    revalidate();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function markReviewedAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await markReviewed(id);
    revalidate();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function splitTransactionAction(
  id: string,
  parts: { amount: number; categoryId?: string | null; description?: string | null }[],
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await splitTransaction(id, parts);
    revalidate();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// ---------- Cuentas ----------
export async function addAccountAction(raw: unknown): Promise<ActionResult> {
  const parsed = accountInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await createAccount(parsed.data);
    revalidate();
    return { ok: true };
  } catch {
    return { ok: false, message: "No pudimos guardar la cuenta." };
  }
}

export async function editAccountAction(id: string, raw: unknown): Promise<ActionResult> {
  const parsed = accountInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await updateAccount(id, parsed.data);
    revalidate();
    return { ok: true };
  } catch {
    return { ok: false, message: "No pudimos actualizar la cuenta." };
  }
}

export async function removeAccountAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await deleteAccount(id);
    revalidate();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// ---------- Reglas de auto-categorización ----------
export async function addRuleAction(raw: unknown): Promise<ActionResult> {
  const parsed = ruleInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await createRule(parsed.data);
    revalidate();
    return { ok: true };
  } catch {
    return { ok: false, message: "No pudimos guardar la regla." };
  }
}

export async function editRuleAction(id: string, raw: unknown): Promise<ActionResult> {
  const parsed = ruleInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await updateRule(id, parsed.data);
    revalidate();
    return { ok: true };
  } catch {
    return { ok: false, message: "No pudimos actualizar la regla." };
  }
}

export async function removeRuleAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await deleteRule(id);
    revalidate();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// ---------- Transferencias entre cuentas ----------
export async function addTransferAction(raw: unknown): Promise<ActionResult> {
  const parsed = transferInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await createTransfer(parsed.data);
    revalidate();
    return { ok: true };
  } catch {
    return { ok: false, message: "No pudimos registrar la transferencia." };
  }
}

// ---------- Importación CSV ----------
export type ImportResult = { ok: boolean; count: number; skipped: number; message?: string };

export async function importTransactionsAction(rows: unknown[]): Promise<ImportResult> {
  if (!isSupabaseConfigured()) return { ok: false, count: 0, skipped: 0, message: "Conecta Supabase." };
  const valid: CsvTxnInput[] = [];
  let skipped = 0;
  for (const r of rows ?? []) {
    const parsed = csvTxnSchema.safeParse(r);
    if (parsed.success) valid.push(parsed.data);
    else skipped += 1;
  }
  if (valid.length === 0) return { ok: false, count: 0, skipped, message: "No se encontraron filas válidas." };
  try {
    const count = await importTransactions(valid);
    revalidate();
    return { ok: count > 0, count, skipped };
  } catch {
    return { ok: false, count: 0, skipped, message: "No pudimos importar." };
  }
}

// ---------- Recibo (signed URL) ----------
export async function getReceiptUrlAction(path: string): Promise<{ ok: boolean; url?: string }> {
  if (!isSupabaseConfigured() || !path) return { ok: false };
  try {
    const url = await getReceiptSignedUrl(path);
    return url ? { ok: true, url } : { ok: false };
  } catch {
    return { ok: false };
  }
}

// ---------- OCR de recibos ----------
export type ScanResult =
  | { ok: true; data: ReceiptExtraction }
  | { ok: false; message: string };

export async function scanReceiptAction(imageBase64: string, mimeType: string): Promise<ScanResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase." };
  if (!imageBase64 || imageBase64.length > 8_000_000) {
    return { ok: false, message: "Imagen inválida o demasiado grande (máx ~6 MB)." };
  }
  try {
    const data = await extractReceipt(imageBase64, mimeType || "image/jpeg");
    if (!data.configured) {
      return { ok: false, message: "El escaneo con IA no está disponible (proveedor no configurado)." };
    }
    return { ok: true, data };
  } catch (err) {
    const msg = err instanceof Error && err.message.includes("límite") ? err.message : "No pudimos leer el recibo. Inténtalo de nuevo o regístralo manual.";
    logger.warn("scanReceipt fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: msg };
  }
}

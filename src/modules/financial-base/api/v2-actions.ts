"use server";

/**
 * Server Actions de Base Financiera V2 (presupuesto, transacciones, cuentas).
 * Regla de oro: lo real vive en `transactions`; el presupuesto en `budget_items`.
 * Toda mutación revalida /mi-base-financiera y /dashboard.
 */
import { revalidatePath } from "next/cache";
import {
  budgetItemInputSchema,
  incomeSourceInputSchema,
  passiveIncomeStubInputSchema,
  txnInputSchema,
  accountInputSchema,
  ruleInputSchema,
  transferInputSchema,
  csvTxnSchema,
  categoryInputSchema,
  categoryMergeSchema,
  categoryDeleteSchema,
  templateInputSchema,
} from "@/modules/financial-base/schemas";
import type { CsvTxnInput } from "@/modules/financial-base/schemas";
import {
  createRule,
  updateRule,
  deleteRule,
} from "@/modules/financial-base/services/rules-service";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  mergeCategory,
} from "@/modules/financial-base/services/categories-service";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  touchTemplate,
} from "@/modules/financial-base/services/templates-service";
import {
  extractReceipt,
  type ReceiptExtraction,
} from "@/modules/financial-base/services/receipt-service";
import {
  createBudgetItem,
  updateBudgetItem,
  deleteBudgetItem,
  setCategoryBudget,
  copyPreviousMonthExpenseBudget,
  registerIncomeSource,
  updateIncomeSource,
  deleteIncomeSource,
  receivePartialIncome,
  copyPreviousMonthIncome,
  registerPassiveIncomeWithStub,
} from "@/modules/financial-base/services/budget-service";
import { monthPeriod } from "@/modules/financial-base/engine/period";
import {
  createTransaction,
  updateTransaction,
  setTransactionCategory,
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
import {
  propagateLinkedTransaction,
  deleteLinkedTransaction,
  linkExistingTransaction,
} from "@/modules/financial-base/services/linked-transaction-service";
import { z } from "zod";
import { isSupabaseConfigured, requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  mapProposalRow,
  proposalToTxnInput,
} from "@/modules/financial-base/services/ingest-proposals-view";
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

const envelopeBudgetSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  amount: z.number().nonnegative(),
  currency: z.string().length(3),
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(2000).max(3000),
});

/** Fija el presupuesto de un sobre del periodo (candado del tab de Gastos). */
export async function setEnvelopeBudgetAction(raw: unknown): Promise<ActionResult> {
  const parsed = envelopeBudgetSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await setCategoryBudget({
      categoryId: parsed.data.categoryId,
      name: parsed.data.name,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      period: monthPeriod(parsed.data.periodYear, parsed.data.periodMonth),
    });
    revalidate();
    return { ok: true };
  } catch (err) {
    logger.error("setEnvelopeBudget fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    const msg =
      err instanceof Error && err.message.includes("se deriva de una entidad")
        ? err.message
        : "No pudimos actualizar el presupuesto.";
    return { ok: false, message: msg };
  }
}

const copyMonthSchema = z.object({
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(2000).max(3000),
});

/** Copia el presupuesto de gasto del mes anterior (toolbar "Copiar mes anterior"). */
export async function copyPreviousMonthBudgetAction(
  raw: unknown,
): Promise<ActionResult & { copied?: number }> {
  const parsed = copyMonthSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    const copied = await copyPreviousMonthExpenseBudget(
      monthPeriod(parsed.data.periodYear, parsed.data.periodMonth),
    );
    revalidate();
    return { ok: true, copied };
  } catch (err) {
    logger.error("copyPreviousMonthBudget fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos copiar el presupuesto del mes anterior." };
  }
}

// ---------- Fuentes de ingreso (tab Ingresos · Fase 1) ----------
export async function registerIncomeSourceAction(raw: unknown): Promise<ActionResult> {
  const parsed = incomeSourceInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await registerIncomeSource(parsed.data);
    revalidate();
    revalidatePath("/ingresos");
    return { ok: true };
  } catch (err) {
    logger.error("registerIncomeSource fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos registrar el ingreso." };
  }
}

export async function updateIncomeSourceAction(id: string, raw: unknown): Promise<ActionResult> {
  const parsed = incomeSourceInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await updateIncomeSource(id, parsed.data);
    revalidate();
    revalidatePath("/ingresos");
    return { ok: true };
  } catch (err) {
    logger.error("updateIncomeSource fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos actualizar el ingreso." };
  }
}

export async function deleteIncomeSourceAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await deleteIncomeSource(id);
    revalidate();
    revalidatePath("/ingresos");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

const receivePartialIncomeSchema = z.object({
  budgetItemId: z.string().uuid(),
  amount: z.number({ error: "Monto inválido" }).positive("Debe ser mayor a 0"),
  date: z.string().min(8).max(10),
});

/** Recibido parcial (Fase 2): suma un ingreso confirmado a la barra de la fuente. */
export async function receivePartialIncomeAction(raw: unknown): Promise<ActionResult> {
  const parsed = receivePartialIncomeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await receivePartialIncome(parsed.data);
    revalidate();
    revalidatePath("/ingresos");
    return { ok: true };
  } catch (err) {
    logger.error("receivePartialIncome fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    const msg =
      err instanceof Error && err.message.includes("ya no existe")
        ? err.message
        : "No pudimos registrar lo recibido.";
    return { ok: false, message: msg };
  }
}

/** Copia al mes actual SOLO las fuentes de ingreso recurrentes del mes anterior. */
export async function copyPreviousMonthIncomeAction(
  raw: unknown,
): Promise<ActionResult & { copied?: number }> {
  const parsed = copyMonthSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    const copied = await copyPreviousMonthIncome(
      monthPeriod(parsed.data.periodYear, parsed.data.periodMonth),
    );
    revalidate();
    revalidatePath("/ingresos");
    return { ok: true, copied };
  } catch (err) {
    logger.error("copyPreviousMonthIncome fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos copiar los ingresos del mes anterior." };
  }
}

/**
 * Registra un ingreso pasivo (renta/dividendos) creando un stub de inversión
 * vinculado a la fuente (Fase 3). Revalida Ingresos + Inversiones.
 */
export async function registerPassiveIncomeWithStubAction(raw: unknown): Promise<ActionResult> {
  const parsed = passiveIncomeStubInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await registerPassiveIncomeWithStub(parsed.data);
    revalidate();
    revalidatePath("/ingresos");
    revalidatePath("/patrimonio");
    return { ok: true };
  } catch (err) {
    logger.error("registerPassiveIncomeWithStub fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos registrar el ingreso pasivo." };
  }
}

// ---------- Transacciones (lo real) ----------
export async function addTransactionAction(raw: unknown): Promise<ActionResult> {
  const parsed = txnInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    const created = await createTransaction(parsed.data);
    // Fase 2: si quedó vinculada (a mano o por regla), escribe también el
    // registro especializado (pago de deuda / aporte a meta). Compensa si falla.
    if (created.linkedKind !== "none" && created.linkedId) {
      try {
        await propagateLinkedTransaction({
          transactionId: created.id,
          kind: parsed.data.kind,
          linkedKind: created.linkedKind,
          linkedId: created.linkedId,
          amount: parsed.data.amount,
          occurredOn: parsed.data.occurredOn,
        });
      } catch (propErr) {
        await deleteLinkedTransaction(created.id);
        throw propErr;
      }
    }
    revalidate();
    revalidatePath("/transacciones");
    revalidatePath("/deudas");
    revalidatePath("/ahorro");
    return { ok: true };
  } catch (err) {
    logger.error("addTransaction fallido", { message: err instanceof Error ? err.message : "?" });
    const msg =
      err instanceof Error && err.message.includes("ya no existe o no te pertenece")
        ? err.message
        : "No pudimos guardar la transacción.";
    return { ok: false, message: msg };
  }
}

const PROPOSAL_COLS = "id, kind, amount, currency, occurred_on, merchant, card_last4, confidence";

/**
 * Confirma una propuesta de ingesta (bandeja "Por revisar"): crea la transacción
 * real por el mismo camino que addTransactionAction y marca la propuesta confirmed.
 * Claim atómico (update ... where status='pending') para evitar doble confirmación;
 * si la creación de la transacción falla, revierte el claim para poder reintentar.
 */
export async function confirmIngestProposalAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await requireUser();
    const supabase = await createSupabaseServerClient();
    // Reclama la propuesta: solo una confirmación gana (RLS la acota al dueño).
    const { data: claimed } = await supabase
      .from("ingest_proposals")
      .update({ status: "confirmed" })
      .eq("id", id)
      .eq("status", "pending")
      .select(PROPOSAL_COLS)
      .maybeSingle();
    if (!claimed) return { ok: false, message: "Esa propuesta ya no está disponible." };

    const { data: cardRows } = await supabase
      .from("account_cards")
      .select("last4, label, holder_name");
    const view = mapProposalRow(claimed, cardRows ?? []);

    const res = await addTransactionAction(proposalToTxnInput(view));
    if (!res.ok) {
      // Revierte el claim: la transacción no se creó, la propuesta vuelve a pending.
      await supabase.from("ingest_proposals").update({ status: "pending" }).eq("id", id);
      return res;
    }
    revalidatePath("/transacciones");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    logger.error("confirmIngestProposal fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos confirmar el movimiento." };
  }
}

/** Descarta una propuesta de ingesta (no crea transacción). Claim atómico. */
export async function discardIngestProposalAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await requireUser();
    const supabase = await createSupabaseServerClient();
    const { data: claimed } = await supabase
      .from("ingest_proposals")
      .update({ status: "discarded" })
      .eq("id", id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!claimed) return { ok: false, message: "Esa propuesta ya no está disponible." };
    revalidatePath("/transacciones");
    return { ok: true };
  } catch (err) {
    logger.error("discardIngestProposal fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos descartar el movimiento." };
  }
}

const linkTxnSchema = z.object({
  transactionId: z.string().uuid(),
  linkedKind: z.enum(["debt", "goal", "holding", "policy", "rental"]),
  linkedId: z.string().uuid(),
});

/** Conciliación (Fase 6): vincula una transacción existente y propaga. */
export async function linkTransactionAction(raw: unknown): Promise<ActionResult> {
  const parsed = linkTxnSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await linkExistingTransaction(parsed.data);
    revalidate();
    revalidatePath("/transacciones");
    revalidatePath("/deudas");
    revalidatePath("/ahorro");
    return { ok: true };
  } catch (err) {
    logger.error("linkTransaction fallido", { message: err instanceof Error ? err.message : "?" });
    const msg =
      err instanceof Error && err.message.includes("ya no existe o no te pertenece")
        ? err.message
        : "No pudimos vincular la transacción.";
    return { ok: false, message: msg };
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

const assignCategorySchema = z.object({
  transactionId: z.string().uuid(),
  categoryId: z.string().uuid(),
  crearRegla: z.boolean().optional(),
  merchant: z.string().trim().max(160).optional(),
  type: z.enum(["expense", "income"]).optional(),
});

/**
 * Asigna el sobre (categoría) a una transacción sin clasificar y, opcional, crea la
 * regla para que la próxima del mismo comercio caiga sola. La regla es best-effort:
 * si falla, la categoría ya quedó asignada (no se pierde el avance del usuario).
 */
export async function assignCategoryAction(raw: unknown): Promise<ActionResult> {
  const parsed = assignCategorySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  const { transactionId, categoryId, crearRegla, merchant, type } = parsed.data;
  try {
    await requireUser();
    await setTransactionCategory(transactionId, categoryId);

    if (crearRegla && merchant && type) {
      try {
        await createRule({
          merchantPattern: merchant,
          suggestedCategoryId: categoryId,
          type,
          active: true,
          priority: 0,
        });
      } catch (ruleErr) {
        // La categoría ya se asignó; la regla es un extra opcional.
        logger.warn("assignCategory: no se pudo crear la regla", {
          message: ruleErr instanceof Error ? ruleErr.message : "?",
        });
      }
    }

    revalidatePath("/transacciones");
    revalidatePath("/gastos");
    revalidate();
    return { ok: true };
  } catch (err) {
    logger.error("assignCategory fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos clasificar el movimiento." };
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
  if (!isSupabaseConfigured())
    return { ok: false, count: 0, skipped: 0, message: "Conecta Supabase." };
  const valid: CsvTxnInput[] = [];
  let skipped = 0;
  for (const r of rows ?? []) {
    const parsed = csvTxnSchema.safeParse(r);
    if (parsed.success) valid.push(parsed.data);
    else skipped += 1;
  }
  if (valid.length === 0)
    return { ok: false, count: 0, skipped, message: "No se encontraron filas válidas." };
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

// ---------- Categorías personalizadas ----------
export async function addCategoryAction(raw: unknown): Promise<ActionResult & { id?: string }> {
  const parsed = categoryInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    const id = await createCategory(parsed.data);
    revalidate();
    return { ok: true, id: id ?? undefined };
  } catch (err) {
    logger.error("addCategory fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos crear la categoría." };
  }
}

export async function editCategoryAction(id: string, raw: unknown): Promise<ActionResult> {
  const parsed = categoryInputSchema.partial().safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await updateCategory(id, parsed.data);
    revalidate();
    return { ok: true };
  } catch {
    return { ok: false, message: "No pudimos actualizar la categoría." };
  }
}

export async function removeCategoryAction(raw: unknown): Promise<ActionResult> {
  const parsed = categoryDeleteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await deleteCategory(parsed.data.id, parsed.data.reassignToId ?? null);
    revalidate();
    return { ok: true };
  } catch {
    return { ok: false, message: "No pudimos eliminar la categoría." };
  }
}

export async function mergeCategoryAction(raw: unknown): Promise<ActionResult> {
  const parsed = categoryMergeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await mergeCategory(parsed.data.fromId, parsed.data.intoId);
    revalidate();
    return { ok: true };
  } catch {
    return { ok: false, message: "No pudimos fusionar las categorías." };
  }
}

// ---------- Plantillas / favoritos ----------
export async function addTemplateAction(raw: unknown): Promise<ActionResult> {
  const parsed = templateInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await createTemplate(parsed.data);
    revalidate();
    return { ok: true };
  } catch {
    return { ok: false, message: "No pudimos guardar la plantilla." };
  }
}

export async function editTemplateAction(id: string, raw: unknown): Promise<ActionResult> {
  const parsed = templateInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await updateTemplate(id, parsed.data);
    revalidate();
    return { ok: true };
  } catch {
    return { ok: false, message: "No pudimos actualizar la plantilla." };
  }
}

export async function removeTemplateAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await deleteTemplate(id);
    revalidate();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Registra una transacción a partir de una plantilla (1 clic). */
export async function runTemplateAction(
  id: string,
  overrides?: { amount?: number; occurredOn?: string },
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    const tpl = (await listTemplates()).find((t) => t.id === id);
    if (!tpl) return { ok: false, message: "Plantilla no encontrada." };
    const kind = tpl.kind;
    if (kind === "transferencia")
      return { ok: false, message: "Las transferencias no se registran por plantilla." };
    const amount = overrides?.amount ?? tpl.amount ?? 0;
    if (!(amount > 0)) return { ok: false, message: "La plantilla necesita un monto." };
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    await createTransaction({
      kind,
      amount,
      currency: tpl.currency,
      occurredOn: overrides?.occurredOn ?? iso,
      categoryId: tpl.categoryId ?? null,
      accountId: tpl.accountId ?? null,
      merchantOrSource: tpl.merchantOrSource ?? undefined,
      description: tpl.note ?? undefined,
      status: "confirmed",
      origin: "manual",
    });
    await touchTemplate(id);
    revalidate();
    return { ok: true };
  } catch (err) {
    logger.error("runTemplate fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos registrar desde la plantilla." };
  }
}

// ---------- OCR de recibos ----------
export type ScanResult = { ok: true; data: ReceiptExtraction } | { ok: false; message: string };

export async function scanReceiptAction(
  imageBase64: string,
  mimeType: string,
): Promise<ScanResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase." };
  if (!imageBase64 || imageBase64.length > 8_000_000) {
    return { ok: false, message: "Imagen inválida o demasiado grande (máx ~6 MB)." };
  }
  try {
    const data = await extractReceipt(imageBase64, mimeType || "image/jpeg");
    if (!data.configured) {
      return {
        ok: false,
        message: "El escaneo con IA no está disponible (proveedor no configurado).",
      };
    }
    return { ok: true, data };
  } catch (err) {
    const msg =
      err instanceof Error && err.message.includes("límite")
        ? err.message
        : "No pudimos leer el recibo. Inténtalo de nuevo o regístralo manual.";
    logger.warn("scanReceipt fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: msg };
  }
}

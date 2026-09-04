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
  categoryHideSchema,
  categoryForkSchema,
  categoryRevertSchema,
  templateInputSchema,
} from "@/modules/financial-base/schemas";
import type { CsvTxnInput } from "@/modules/financial-base/schemas";
import {
  createRule,
  updateRule,
  deleteRule,
  upsertRuleForMerchant,
} from "@/modules/financial-base/services/rules-service";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  mergeCategory,
  hideCategory,
  forkCategory,
  unhideCategory,
  unforkCategory,
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
  reassignBudgetItem,
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
import { getSobreRemaining } from "@/modules/financial-base/services/sobre-remaining";
import type { SobreRemaining } from "@/modules/financial-base/engine/sobre-remaining-copy";
import { userCurrentPeriod, userToday } from "@/lib/time/user-time";
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
  LINKED_TXN_EDIT_BLOCKED,
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
import { AppError } from "@/lib/errors";
// `import type` y no runtime: en un fichero "use server" solo pueden EXPORTARSE funciones
// async, pero importar tipos es libre y desaparece al compilar.
import type { Jar } from "@/modules/financial-base/engine/expense-jars";
import type { Account, BudgetItem } from "@/modules/financial-base/types";

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
  } catch (err) {
    // Las líneas derivadas quedan bloqueadas por assertManualItem: su mensaje
    // explica que hay que editarlas desde su módulo (lo muestra "Por reasignar").
    return { ok: false, message: err instanceof Error ? err.message : undefined };
  }
}

/**
 * Reasigna la categoría de una línea de presupuesto (frasco "Por reasignar").
 * El titular "Gasto planificado" NO cambia: la línea ya sumaba, solo pasa a
 * verse en el frasco que le corresponde.
 */
export async function reassignBudgetItemAction(raw: unknown): Promise<ActionResult> {
  const parsed = z
    .object({ budgetItemId: z.string().uuid(), categoryId: z.string().uuid() })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await reassignBudgetItem(parsed.data.budgetItemId, parsed.data.categoryId);
    revalidate();
    return { ok: true };
  } catch (err) {
    logger.error("reassignBudgetItem fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos reasignar la línea." };
  }
}

const envelopeBudgetSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  amount: z.number().nonnegative(),
  currency: z.string().length(3),
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(2000).max(3000),
  /**
   * El usuario ya vio y aceptó el aviso de "estás fuera de la ventana; esto queda
   * registrado". Sin esto, una edición fuera de ventana NO se ejecuta: devuelve
   * `needsConfirmation` para que la superficie pregunte.
   */
  confirmedOutsideWindow: z.boolean().optional(),
});

/**
 * Fija el presupuesto de un sobre del periodo (candado del tab de Gastos).
 *
 * ── LA VENTANA (días 1-5) ───────────────────────────────────────────────────
 * Dentro de la ventana se guarda y punto: es el momento previsto para configurar.
 *
 * Fuera de la ventana NUNCA se bloquea — se pide una confirmación y se registra. Esa es
 * la decisión de diseño central: la vida cambia a mitad de mes, y una app que le dice
 * "no" a un cambio real de circunstancias enseña a mentirle a la app. Lo que sí hace es
 * dejar rastro (`recordLateBudgetEdit`), porque un sobre ajustado cuatro veces tarde es
 * información valiosa: no dice "sos indisciplinado", dice "este presupuesto está mal
 * calibrado", y eso el asesor lo puede conversar.
 *
 * Quién decide si la ventana está abierta es el SERVIDOR, no el cliente. Si dependiera
 * de una bandera del formulario, el registro sería opcional para cualquiera que llame la
 * acción directo — y el contador dejaría de significar nada.
 */
export async function setEnvelopeBudgetAction(
  raw: unknown,
): Promise<ActionResult & { needsConfirmation?: boolean }> {
  const parsed = envelopeBudgetSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    const period = monthPeriod(parsed.data.periodYear, parsed.data.periodMonth);
    const { getVentana, recordLateBudgetEdit } = await import("@/lib/rhythm");
    const ventana = await getVentana(period);

    if (!ventana.abierta && !parsed.data.confirmedOutsideWindow) {
      return {
        ok: false,
        needsConfirmation: true,
        message:
          ventana.estado === "cerrada_por_el_usuario"
            ? "Ya cerraste la configuración de este mes. Podés ajustarlo igual; queda registrado."
            : "Estás fuera de la ventana de configuración. Podés ajustarlo igual; queda registrado.",
      };
    }

    await setCategoryBudget({
      categoryId: parsed.data.categoryId,
      name: parsed.data.name,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      period,
    });

    // Después de guardar, nunca antes: el contador registra ediciones que OCURRIERON.
    // `recordLateBudgetEdit` no lanza — si falla, el presupuesto ya está guardado y eso
    // es lo que le importa al usuario.
    if (!ventana.abierta) await recordLateBudgetEdit(parsed.data.categoryId, period);

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
/**
 * Alta de una transacción.
 *
 * Devuelve el RESTANTE del sobre cuando el movimiento es un gasto categorizado. Hasta ahora
 * solo lo hacía `confirmTransactionAction` (el camino del chat), así que registrar el mismo
 * gasto desde el tab de Gastos o desde Transacciones no decía cuánto quedaba — el dato existía
 * y no se mostraba. Es la mitad útil del registro: sin él, "✓ guardado" no responde la única
 * pregunta que el usuario tiene en ese momento.
 *
 * Va DESPUÉS de la escritura y es best-effort: `getSobreRemaining` lee fresco, así que el
 * restante ya descuenta lo recién registrado. Si falla, se devuelve `ok` igual y la superficie
 * muestra el mensaje genérico — nunca se pierde una transacción por no poder calcular un dato
 * informativo.
 */
export async function addTransactionAction(
  raw: unknown,
): Promise<ActionResult & { sobre?: SobreRemaining }> {
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
          currency: created.currency,
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

    let sobre: SobreRemaining | undefined;
    if (parsed.data.kind === "gasto" && parsed.data.categoryId) {
      sobre =
        (await getSobreRemaining(parsed.data.categoryId, parsed.data.occurredOn).catch(
          () => null,
        )) ?? undefined;
    }
    return { ok: true, sobre };
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
 * Correcciones que el usuario puede hacer ANTES de confirmar una propuesta, en la
 * misma fila, sin salir de la bandeja: el banco a veces trae el comercio críptico
 * («OPENAI *CHATGPT SU»), la fecha de posteo en vez de la de compra, o el usuario
 * quiere dejarla en su sobre y su cuenta de una vez. Todo opcional: sin overrides
 * es el mismo «un clic» de siempre.
 */
const proposalUuidOrNull = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.string().uuid().nullable(),
);
const proposalOverridesSchema = z.object({
  amount: z.number().positive().optional(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  occurredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  merchant: z.string().trim().min(1).max(160).optional(),
  note: z.string().trim().max(280).optional(),
  categoryId: proposalUuidOrNull.optional(),
  accountId: proposalUuidOrNull.optional(),
});
export type ProposalOverrides = z.infer<typeof proposalOverridesSchema>;

/**
 * Confirma una propuesta de ingesta (bandeja "Por revisar"): crea la transacción
 * real por el mismo camino que addTransactionAction y marca la propuesta confirmed.
 * Claim atómico (update ... where status='pending') para evitar doble confirmación;
 * si la creación de la transacción falla, revierte el claim para poder reintentar.
 *
 * `overrides` aplica las correcciones del usuario: se guardan también en la
 * propuesta (para que el registro refleje lo que él confirmó, no lo que el
 * banco dijo) y viajan a la transacción con el sobre y la cuenta elegidos.
 */
export async function confirmIngestProposalAction(
  id: string,
  overrides?: ProposalOverrides,
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await requireUser();
    const parsedOv = overrides ? proposalOverridesSchema.safeParse(overrides) : null;
    if (parsedOv && !parsedOv.success) {
      return { ok: false, message: "Revisá los datos corregidos." };
    }
    const ov = parsedOv?.data ?? {};
    const supabase = await createSupabaseServerClient();
    // Reclama la propuesta: solo una confirmación gana (RLS la acota al dueño).
    // Las correcciones se escriben en el mismo update: la propuesta queda como
    // el usuario la confirmó.
    const { data: claimed } = await supabase
      .from("ingest_proposals")
      .update({
        status: "confirmed",
        ...(ov.amount !== undefined ? { amount: ov.amount } : {}),
        ...(ov.currency ? { currency: ov.currency } : {}),
        ...(ov.occurredOn ? { occurred_on: ov.occurredOn } : {}),
        ...(ov.merchant ? { merchant: ov.merchant } : {}),
      })
      .eq("id", id)
      .eq("status", "pending")
      .select(PROPOSAL_COLS)
      .maybeSingle();
    if (!claimed) return { ok: false, message: "Esa propuesta ya no está disponible." };

    const { data: cardRows } = await supabase
      .from("account_cards")
      .select("last4, label, holder_name");
    const view = mapProposalRow(claimed, cardRows ?? []);

    const base = proposalToTxnInput(view);
    const res = await addTransactionAction({
      ...base,
      ...(ov.note ? { description: ov.note } : {}),
      ...(ov.categoryId !== undefined ? { categoryId: ov.categoryId } : {}),
      ...(ov.accountId !== undefined ? { accountId: ov.accountId } : {}),
    });
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
    // Bloqueo de edición de vinculadas: surface el mensaje que remite al origen.
    const msg =
      err instanceof Error && err.message === LINKED_TXN_EDIT_BLOCKED
        ? err.message
        : "No pudimos actualizar la transacción.";
    return { ok: false, message: msg };
  }
}

export async function removeTransactionAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    // deleteTransaction ya revierte el ledger de la entidad vinculada
    // (reverseLinkedTransaction) y registra el borrado en el log del hogar (E3).
    await deleteTransaction(id);
    revalidate();
    return { ok: true };
  } catch (err) {
    // Propaga el mensaje (p.ej. el de solo-lectura del hogar) en vez de un fallo mudo.
    return { ok: false, message: err instanceof Error ? err.message : undefined };
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
        // UPSERT: re-clasificar "a futuros" actualiza la regla del comercio en vez de
        // duplicarla. Best-effort: la categoría ya quedó asignada arriba.
        await upsertRuleForMerchant(merchant, type, categoryId);
      } catch (ruleErr) {
        // La categoría ya se asignó; la regla es un extra opcional.
        logger.warn("assignCategory: no se pudo actualizar la regla", {
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

export async function importTransactionsAction(
  rows: unknown[],
  accountId?: string,
): Promise<ImportResult> {
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
    // accountId es la cuenta elegida en el modal (nivel-modal). Sin cuenta → null (comportamiento
    // anterior). RLS + el FK validan la propiedad; un id no-string se descarta.
    const account = typeof accountId === "string" && accountId ? accountId : null;
    const count = await importTransactions(valid, account);
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

// ---------- Personalización por hogar (Fase 1: ocultar / forkear) ----------
/** Un error de gating (viewer del hogar) se surfacea; el resto es genérico. */
function personalizationError(err: unknown, fallback: string): string {
  return err instanceof Error && err.message.includes("editor del hogar") ? err.message : fallback;
}

/** Oculta una categoría base para el hogar, con reasignación opcional de movimientos. */
export async function hideCategoryAction(raw: unknown): Promise<ActionResult> {
  const parsed = categoryHideSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await hideCategory(parsed.data.baseId, parsed.data.reassignToId ?? null);
    revalidate();
    revalidatePath("/gastos");
    return { ok: true };
  } catch (err) {
    logger.error("hideCategory fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: personalizationError(err, "No pudimos ocultar la categoría.") };
  }
}

/** Forkea una categoría base (copia editable del hogar). Devuelve el id de la copia. */
export async function forkCategoryAction(raw: unknown): Promise<ActionResult & { id?: string }> {
  const parsed = categoryForkSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    const id = await forkCategory(parsed.data.baseId, {
      name: parsed.data.name,
      icon: parsed.data.icon,
      color: parsed.data.color,
      isFavorite: parsed.data.isFavorite,
      isEssential: parsed.data.isEssential,
    });
    revalidate();
    revalidatePath("/gastos");
    return { ok: true, id: id ?? undefined };
  } catch (err) {
    logger.error("forkCategory fallido", { message: err instanceof Error ? err.message : "?" });
    return {
      ok: false,
      message: personalizationError(err, "No pudimos personalizar la categoría."),
    };
  }
}

/** Re-muestra una categoría base oculta (revierte el override). */
export async function unhideCategoryAction(raw: unknown): Promise<ActionResult> {
  const parsed = categoryRevertSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await unhideCategory(parsed.data.baseId);
    revalidate();
    revalidatePath("/gastos");
    return { ok: true };
  } catch (err) {
    logger.error("unhideCategory fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: personalizationError(err, "No pudimos restaurar la categoría.") };
  }
}

/** Deshace el fork de una categoría base (borra la copia y el override). */
export async function unforkCategoryAction(raw: unknown): Promise<ActionResult> {
  const parsed = categoryRevertSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await unforkCategory(parsed.data.baseId);
    revalidate();
    revalidatePath("/gastos");
    return { ok: true };
  } catch (err) {
    logger.error("unforkCategory fallido", { message: err instanceof Error ? err.message : "?" });
    return {
      ok: false,
      message: personalizationError(err, "No pudimos deshacer la personalización."),
    };
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
    const iso = await userToday();
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
  if (!imageBase64) return { ok: false, message: "No llegó ninguna imagen." };
  if (imageBase64.length > 8_000_000) {
    return {
      ok: false,
      message: "La foto es demasiado pesada para escanearla, incluso comprimida.",
    };
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
    // El motivo REAL cuando existe: `AppError.userMessage` ya distingue timeout (IA-503), rate
    // limit del proveedor (IA-429), credencial (IA-401) y límite de IA del plan. El genérico
    // queda solo para lo que de verdad no sabemos, y el detalle estructurado va al log.
    const msg =
      err instanceof AppError
        ? err.userMessage
        : "No pudimos leer el recibo. Inténtalo de nuevo o regístralo manual.";
    logger.warn("scanReceipt fallido", {
      message: err instanceof Error ? err.message : "?",
      code: err instanceof AppError ? err.code : "UNKNOWN",
      detail: err instanceof AppError ? err.detail : undefined,
      bytesB64: imageBase64.length,
      mimeType,
    });
    return { ok: false, message: msg };
  }
}

/** Margen que se le da a la capa IA antes de seguir sin ella. No exportado: en un fichero
 *  "use server" solo pueden salir funciones async. */
const IA_SUGERENCIA_TIMEOUT_MS = 2500;

/**
 * Sugerencia de sobre a partir del comercio, para el alta rápida del móvil.
 *
 * Reproduce la MISMA cascada que ya corre al guardar (`createTransaction` →
 * `resolveAutoCategory`), y por ese orden exacto. Es deliberado: si la hoja mostrara una
 * cosa y el guardado asignara otra, el usuario vería su gasto cambiar de sobre solo. Lo
 * único que hace esta acción es ADELANTAR al usuario lo que va a pasar, para que pueda
 * corregirlo antes en vez de después.
 *
 *  1. `resolveAutoCategory` — historial del hogar y caché. Gratis, determinista, y valida
 *     que el destino sea HOJA, de la naturaleza correcta y no una categoría que el hogar
 *     ocultó. Cubre la mayoría de los casos, porque casi siempre se compra donde ya se
 *     compró.
 *  2. `suggestSobre` (Gemini) — solo si el paso 1 no dio nada. Sin historial no hay señal
 *     determinista que gastar, y es el único momento en que la IA aporta algo que no
 *     teníamos.
 *
 * Un `source` de "ia" NO trae las validaciones del paso 1, así que el llamador lo trata
 * como propuesta a confirmar, no como hecho.
 *
 * Lo que esta función NO puede hacer: necesita el COMERCIO, y el flujo rápido lo deja
 * plegado y opcional. Acelera el camino largo, no el de tres toques — ese lo resuelven los
 * chips de sobres frecuentes, que no dependen de nada remoto.
 *
 * Nunca lanza: cualquier fallo devuelve una sugerencia vacía. Quien llama guarda igual.
 */
export async function suggestSobreAction(
  merchant: string,
  sobres: { id: string; name: string }[],
  kind: "gasto" | "ingreso" = "gasto",
): Promise<{ categoryId: string | null; source: "historial" | "cache" | "ia" | null }> {
  const limpio = merchant.trim();
  if (limpio.length < 2 || sobres.length === 0) return { categoryId: null, source: null };
  try {
    await requireUser();
    const supabase = await createSupabaseServerClient();
    const { resolveAutoCategory, suggestSobre } =
      await import("@/modules/financial-base/services/ai-categorize");

    const firme = await resolveAutoCategory({ supabase, merchant: limpio, kind });
    if (firme) return { categoryId: firme.categoryId, source: firme.source };

    // Medido contra Gemini con la config real del provider: 7,1–10,4 s (mediana 7,7 s), y
    // 1 de cada 5 llamadas devolvió 503. En una hoja que aspira a menos de 15 s, esperar
    // eso es esperar más que todo el resto del flujo junto. Se le da un margen corto y, si
    // no llega, se descarta: el usuario guarda sin sobre y el movimiento cae en "Por
    // clasificar", que es exactamente para esto. La llamada de fondo termina sola y su
    // resultado alimenta la caché, así que el siguiente intento con ese comercio ya es
    // instantáneo por el paso 1.
    const ia = await Promise.race([
      suggestSobre(limpio, sobres),
      new Promise<null>((r) => setTimeout(() => r(null), IA_SUGERENCIA_TIMEOUT_MS)),
    ]);
    return ia?.categoryId
      ? { categoryId: ia.categoryId, source: "ia" }
      : { categoryId: null, source: null };
  } catch {
    return { categoryId: null, source: null };
  }
}

/**
 * Datos que necesita AddSpendForm (el MISMO form de gasto de /m/gastos), cargados BAJO
 * DEMANDA cuando el "+" de Inicio abre el gasto — NO en el arranque de Inicio.
 *
 * `getExpenseJarsAsOf` arrastra `loadBaseView` entero: es el agregado caro de la pantalla de
 * Gastos. Cargarlo en Inicio haría pagar a TODOS el coste de un formulario que solo abre
 * quien va a registrar un gasto. Aquí lo paga quien lo pide, en el momento en que lo pide.
 * Devuelve lo mismo que la página de Gastos pasa a AddSpendForm: jars + accounts + moneda.
 */
export async function getSpendFormDataAction(): Promise<{
  jars: Jar[];
  accounts: Account[];
  currency: string;
}> {
  try {
    await requireUser();
    const [{ loadBaseView }, { getExpenseJarsAsOf }] = await Promise.all([
      import("@/modules/financial-base/services/base-view"),
      import("@/modules/financial-base/services/expense-jars-service"),
    ]);
    const view = await loadBaseView();
    if (!view) return { jars: [], accounts: [], currency: "CRC" };
    const jars = await getExpenseJarsAsOf({
      tree: view.tree,
      period: await userCurrentPeriod(),
      asOf: await userToday(),
      currency: view.currency,
    });
    // Los jars completos, como los recibe AddSpendForm en /m/gastos (filtra a normales él
    // mismo con normalJarsWithEnvelopes): así el formulario de Inicio es idéntico al de Gastos.
    return { jars, accounts: view.accounts, currency: view.currency };
  } catch (err) {
    logger.warn("getSpendFormData fallido", { message: err instanceof Error ? err.message : "?" });
    return { jars: [], accounts: [], currency: "CRC" };
  }
}

/**
 * Datos del flujo de ingreso de /m/ingresos (FuentePicker → ReceiveForm), bajo demanda al
 * abrir el ingreso desde el "+" de Inicio. Fuentes = líneas de presupuesto income; recibido
 * del mes por fuente. Reusa el MISMO `loadBaseView`, sin frenar el arranque de Inicio.
 */
export async function getIncomeFormDataAction(): Promise<{
  sources: BudgetItem[];
  received: Record<string, number>;
  currency: string;
}> {
  try {
    await requireUser();
    const { loadBaseView } = await import("@/modules/financial-base/services/base-view");
    const view = await loadBaseView();
    if (!view) return { sources: [], received: {}, currency: "CRC" };
    const sources = view.budget.items.filter((b) => b.type === "income");
    return { sources, received: view.real.incomeReceivedBySource, currency: view.currency };
  } catch (err) {
    logger.warn("getIncomeFormData fallido", { message: err instanceof Error ? err.message : "?" });
    return { sources: [], received: {}, currency: "CRC" };
  }
}

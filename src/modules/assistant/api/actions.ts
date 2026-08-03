"use server";

/**
 * Acción de confirmación de transacción. Es el ÚNICO punto que ejecuta la
 * creación tras la confirmación explícita del usuario (desde el wizard, la
 * tarjeta de acción de IA o el receipt scanner). El endpoint de chat nunca crea.
 */
import { revalidatePath } from "next/cache";
import {
  transactionInputSchema,
  priceAlertInputSchema,
  setDcaInputSchema,
  adjustBudgetInputSchema,
  debtExtraPaymentInputSchema,
  batchTransactionsInputSchema,
} from "@/modules/assistant/schemas";
import { createTransaction } from "@/modules/assistant/services/transaction-service";
import { listSobresForKind, getSobreRemaining } from "@/modules/financial-base";
import type { SobreOption, SobreRemaining } from "@/modules/financial-base";
import { createGoal, goalInputSchema } from "@/modules/control";
import { createInvestmentAlert } from "@/modules/wealth";
import { isSupabaseConfigured, getUser } from "@/lib/auth/session";
import { loadRetainedChat, loadTodayChat, buildTranscriptText, startOfCostaRicaDayISO, type StoredChatMessage } from "@/lib/ai/chat-store";
import { sendEmail } from "@/lib/email/send";
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

/**
 * Confirma y crea una ALERTA DE PRECIO propuesta por el asistente. Mismo patrón: valida con
 * priceAlertInputSchema y crea recién tras la confirmación. La DIRECCIÓN (above/below) y las
 * validaciones (símbolo cotizable, precio ≠ actual, alcance de hogar) las resuelve
 * createInvestmentAlert con el precio vivo — el endpoint de chat nunca crea.
 */
export async function confirmPriceAlertAction(raw: unknown): Promise<ConfirmResult> {
  const parsed = priceAlertInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  if (!isSupabaseConfigured()) {
    return { ok: false, message: "Conecta Supabase para crear la alerta." };
  }
  try {
    const res = await createInvestmentAlert({ kind: "price", ...parsed.data });
    if (!res.ok) return { ok: false, message: res.message ?? "No se pudo crear la alerta." };
    revalidatePath("/patrimonio");
    revalidatePath("/patrimonio/indicadores");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    logger.error("confirmPriceAlert fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos crear la alerta." };
  }
}

/** Resultado del alta en lote: cuántas entraron y cuáles no (con su motivo). */
export type BatchResult = {
  ok: boolean;
  creadas: number;
  fallidas: { description: string; message: string }[];
  message?: string;
};

/**
 * Alta EN LOTE de las transacciones faltantes de un estado de cuenta conciliado.
 *
 * Reusa `createTransaction` fila por fila — la MISMA función del alta individual — así que cada
 * una pasa por el pipeline central (auto-categorización, auto-vínculo, propagación, household).
 * No hay atajo por SQL.
 *
 * SIN transacción global a propósito: si la fila 7 falla (una categoría borrada entre que se
 * mostró la tarjeta y el tap), abortar las 6 anteriores dejaría al usuario peor — tendría que
 * volver a empezar el pegado. Se registran las que se pueden y se reporta exactamente cuáles no,
 * que además son las que puede reintentar.
 */
export async function confirmBatchTransactionsAction(raw: unknown): Promise<BatchResult> {
  const parsed = batchTransactionsInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      creadas: 0,
      fallidas: [],
      message: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }
  if (!isSupabaseConfigured()) {
    return { ok: false, creadas: 0, fallidas: [], message: "Conecta Supabase para guardar." };
  }

  const fallidas: BatchResult["fallidas"] = [];
  let creadas = 0;
  for (const row of parsed.data.rows) {
    try {
      await createTransaction({
        kind: row.kind,
        description: row.description,
        amount: row.amount,
        currency: row.currency,
        occurredOn: row.occurredOn,
        categoryId: row.categoryId ?? null,
        source: "chat",
      });
      creadas++;
    } catch (err) {
      logger.error("confirmBatchTransactions: fila fallida", {
        message: err instanceof Error ? err.message : "?",
      });
      fallidas.push({ description: row.description, message: "No se pudo registrar." });
    }
  }

  if (creadas > 0) {
    revalidatePath("/transacciones");
    revalidatePath("/gastos");
    revalidatePath("/mi-base-financiera");
    revalidatePath("/dashboard");
  }
  return { ok: creadas > 0, creadas, fallidas };
}

/**
 * Confirma el APORTE MENSUAL (DCA) de una posición — la ejecución del consejo "apartá X/mes para
 * esta inversión". El holdingId ya viene resuelto contra las posiciones reales del usuario
 * (resolveActionProposal); acá solo se valida la forma y se delega en el dominio.
 */
export async function confirmSetDcaAction(raw: unknown): Promise<ConfirmResult> {
  const parsed = setDcaInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    const { setHoldingDcaAction } = await import("@/modules/wealth");
    const res = await setHoldingDcaAction(parsed.data.holdingId, parsed.data.monthlyContribution);
    if (!res.ok) return { ok: false, message: res.message ?? "No se pudo fijar el aporte." };
    return { ok: true };
  } catch (err) {
    logger.error("confirmSetDca fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos fijar el aporte mensual." };
  }
}

/**
 * Confirma el AJUSTE DE PRESUPUESTO de un sobre del periodo actual. Reusa la misma server action
 * que el tab de Gastos, así que hereda su candado: un sobre derivado de una entidad
 * (`source_kind` ≠ manual) se rechaza con su mensaje, no se fuerza desde el chat.
 */
export async function confirmAdjustBudgetAction(raw: unknown): Promise<ConfirmResult> {
  const parsed = adjustBudgetInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    const { setEnvelopeBudgetAction } = await import("@/modules/financial-base");
    const res = await setEnvelopeBudgetAction(parsed.data);
    if (!res.ok) return { ok: false, message: res.message ?? "No se pudo ajustar el presupuesto." };
    revalidatePath("/gastos");
    revalidatePath("/mi-base-financiera");
    return { ok: true };
  } catch (err) {
    logger.error("confirmAdjustBudget fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos ajustar el presupuesto." };
  }
}

/**
 * Confirma un ABONO EXTRA a capital. Reusa reportPaymentAction del módulo control, así que el
 * abono nace con su transacción vinculada como cualquier pago hecho desde Deudas.
 *
 * `amount: 0` + `extraAmount` a propósito: es un abono EXTRAORDINARIO (todo a capital), no la
 * cuota del mes. Meterlo en `amount` lo registraría como pago ordinario y distorsionaría el plan.
 */
export async function confirmDebtExtraPaymentAction(raw: unknown): Promise<ConfirmResult> {
  const parsed = debtExtraPaymentInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    const { reportPaymentAction } = await import("@/modules/control");
    const res = await reportPaymentAction({
      debtId: parsed.data.debtId,
      paymentDate: parsed.data.paymentDate,
      amount: 0,
      extraAmount: parsed.data.amount,
      kind: "extraordinario",
      ...(parsed.data.currency ? { currency: parsed.data.currency } : {}),
    });
    if (!res.ok) return { ok: false, message: res.message ?? "No se pudo registrar el abono." };
    return { ok: true };
  } catch (err) {
    logger.error("confirmDebtExtraPayment fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos registrar el abono." };
  }
}

/**
 * Hilo del chat que ve el usuario al abrir: la ventana RETENIDA (últimos CHAT_RETENTION_DAYS),
 * no solo el día — así puede scrollear y responder a un mensaje de días atrás.
 */
export async function loadChatHistoryAction(): Promise<StoredChatMessage[]> {
  if (!isSupabaseConfigured()) return [];
  return loadRetainedChat();
}

/** Etiqueta DD/MM/YYYY del día actual en hora de Costa Rica (deriva del corte del día). */
function costaRicaDateLabel(): string {
  const [y, m, d] = startOfCostaRicaDayISO(Date.now()).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Escapa texto para incrustarlo seguro en el HTML del correo. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Envía por correo al PROPIO usuario el transcript en texto limpio de la conversación de hoy.
 * Acción iniciada por el usuario (botón); destinatario = su propio email de sesión.
 */
export async function emailTranscriptAction(): Promise<ConfirmResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para usar el transcript." };
  const user = await getUser();
  const to = user?.email;
  if (!to) return { ok: false, message: "No encontramos tu correo para enviarte el transcript." };
  try {
    const msgs = await loadTodayChat();
    if (msgs.length === 0) return { ok: false, message: "No hay conversación de hoy para enviar." };
    const dateLabel = costaRicaDateLabel();
    const text = buildTranscriptText(msgs, { dateLabel });
    const html = `<pre style="font-family:ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;font-size:14px;line-height:1.5">${escapeHtml(text)}</pre>`;
    const res = await sendEmail({ to, subject: `Tu conversación con My Agent C+ — ${dateLabel}`, html });
    if (!res.ok) {
      return { ok: false, message: res.skipped ? "El correo no está configurado ahora." : "No pudimos enviar el correo." };
    }
    return { ok: true, message: `Te enviamos el transcript a ${to}.` };
  } catch (err) {
    logger.error("emailTranscript fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos enviar el transcript." };
  }
}

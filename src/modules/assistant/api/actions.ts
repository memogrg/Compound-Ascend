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
  moveBudgetInputSchema,
  debtExtraPaymentInputSchema,
  batchTransactionsInputSchema,
} from "@/modules/assistant/schemas";
import { createTransaction } from "@/modules/assistant/services/transaction-service";
import {
  listSobresForKind,
  getSobreRemaining,
  listTransactionsOnDate,
} from "@/modules/financial-base";
import type { SobreOption, SobreRemaining } from "@/modules/financial-base";
import { buscarDuplicado, mensajeDuplicado } from "@/lib/ai/duplicate-guard";
import type { AltaCandidata, MovimientoRegistrado } from "@/lib/ai/duplicate-guard";
import { fechaLegible } from "@/lib/ai/fecha-natural";
import { createGoal, goalInputSchema } from "@/modules/control";
import { createInvestmentAlert } from "@/modules/wealth";
import { isSupabaseConfigured, getUser } from "@/lib/auth/session";
import {
  loadRetainedChat,
  loadTodayChat,
  buildTranscriptText,
  startOfCostaRicaDayISO,
  type StoredChatMessage,
} from "@/lib/ai/chat-store";
import { sendEmail } from "@/lib/email/send";
import { logger } from "@/lib/logger";
import type { MemoryCategory } from "@/lib/ai/memory-facts";

/**
 * `sobre` viaja solo para un GASTO con sobre → mensaje de restante en el chat.
 * `duplicate` NO es un error: es "esto ya parece registrado, ¿lo registro igual?". La tarjeta lo
 * distingue del fallo real porque ofrece reintentar con `allowDuplicate`.
 */
export type ConfirmResult = {
  ok: boolean;
  message?: string;
  sobre?: SobreRemaining;
  duplicate?: boolean;
};

/**
 * El movimiento ya registrado que este alta duplicaría, o null. Best-effort: si la lectura falla
 * NO se bloquea el alta — la guarda es una ayuda, y quedarse sin registrar por un error de red
 * sería peor que el duplicado que evita.
 */
async function duplicadoDe(cand: AltaCandidata): Promise<MovimientoRegistrado | null> {
  try {
    const delDia = await listTransactionsOnDate(cand.occurredOn, cand.kind);
    return buscarDuplicado(
      cand,
      delDia.map((t) => ({
        id: t.id,
        kind: t.kind as "gasto" | "ingreso",
        amount: t.amount,
        currency: t.currency,
        occurredOn: t.occurredOn,
        categoryId: t.categoryId,
        description: t.merchantOrSource ?? t.description ?? "",
      })),
    );
  } catch (err) {
    logger.warn("guarda anti-duplicado no pudo leer el día", {
      message: err instanceof Error ? err.message : "?",
    });
    return null;
  }
}

/**
 * Sobres (hojas) del usuario para el selector de la card de confirmación, con su frasco para
 * mostrar "Frasco › Sobre". Reusa el motor de categorización; RLS acota al hogar. Best-effort:
 * si no hay sesión/Supabase, devuelve vacío y la card muestra solo "Sin sobre".
 */
export async function listSobresForKindAction(kind: "gasto" | "ingreso"): Promise<SobreOption[]> {
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
  // GUARDA ANTI-DUPLICADO. Antes de escribir, se mira si ya hay un movimiento equivalente (mismo
  // monto, misma fecha, mismo sobre y comercio parecido). No se bloquea: se avisa y se pide una
  // confirmación explícita, que vuelve con `allowDuplicate`. Cubre las dos formas de duplicar —
  // confirmar dos veces la MISMA propuesta y registrar por chat algo que ya entró por el recibo.
  if (!parsed.data.allowDuplicate) {
    const dup = await duplicadoDe(parsed.data);
    if (dup) {
      return {
        ok: false,
        duplicate: true,
        message: mensajeDuplicado(fechaLegible(dup.occurredOn)),
      };
    }
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
    logger.error("confirmPriceAlert fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos crear la alerta." };
  }
}

/**
 * Resultado del alta en lote: cuántas entraron, cuáles no (con su motivo) y cuáles se FRENARON
 * por parecer ya registradas.
 *
 * Las duplicadas van aparte de las fallidas porque no fallaron: están esperando un "registralas
 * igual". Viajan con su `index` en el arreglo enviado para que la tarjeta pueda reenviar
 * exactamente esas filas y no las que ya entraron.
 */
export type BatchResult = {
  ok: boolean;
  creadas: number;
  fallidas: { description: string; message: string }[];
  duplicadas: { index: number; description: string; message: string }[];
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
      duplicadas: [],
      message: parsed.error.issues[0]?.message ?? "Datos inválidos.",
    };
  }
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      creadas: 0,
      fallidas: [],
      duplicadas: [],
      message: "Conecta Supabase para guardar.",
    };
  }

  const fallidas: BatchResult["fallidas"] = [];
  const duplicadas: BatchResult["duplicadas"] = [];
  let creadas = 0;
  for (const [index, row] of parsed.data.rows.entries()) {
    // Misma guarda que el alta individual, fila por fila. La duplicada se SALTA (no se registra
    // ni se pierde): vuelve en `duplicadas` para que el usuario decida sobre ella, mientras las
    // demás entran. Frenar el lote entero por una fila repetida obligaría a rehacer el pegado.
    if (!parsed.data.allowDuplicates) {
      const dup = await duplicadoDe({
        kind: row.kind,
        amount: row.amount,
        currency: row.currency,
        occurredOn: row.occurredOn,
        categoryId: row.categoryId ?? null,
        description: row.description,
      });
      if (dup) {
        duplicadas.push({
          index,
          description: row.description,
          message: mensajeDuplicado(fechaLegible(dup.occurredOn)),
        });
        continue;
      }
    }
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
  return { ok: creadas > 0, creadas, fallidas, duplicadas };
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
    // `confirmedOutsideWindow: true` porque el tap de "Confirmar" en la tarjeta ES la
    // confirmación explícita que pide la ventana de configuración. Sin esto,
    // setEnvelopeBudgetAction devolvería `needsConfirmation` y la tarjeta del chat fallaría
    // con el aviso de la ventana — un callejón sin salida, porque la tarjeta no tiene dónde
    // pedir una segunda confirmación. El ajuste igual queda registrado en el contador si el
    // mes está fuera de ventana: es una edición tardía real.
    const res = await setEnvelopeBudgetAction({ ...parsed.data, confirmedOutsideWindow: true });
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
 * Confirma MOVER presupuesto de un sobre a otro (salida "un tap" del aviso de ritmo).
 *
 * El movimiento es atómico-con-compensación en el servicio
 * (`moverPresupuestoEntreSobres`): si la segunda escritura falla, la primera se revierte.
 */
export async function confirmMoveBudgetAction(raw: unknown): Promise<ConfirmResult> {
  const parsed = moveBudgetInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    const { moverPresupuestoEntreSobres } = await import("@/lib/rhythm/rhythm-service");
    const { monthPeriod } = await import("@/modules/financial-base/engine/period");
    const res = await moverPresupuestoEntreSobres({
      desdeCategoryId: parsed.data.desdeCategoryId,
      desdeName: parsed.data.desdeName,
      hastaCategoryId: parsed.data.hastaCategoryId,
      hastaName: parsed.data.hastaName,
      monto: parsed.data.amount,
      currency: parsed.data.currency,
      period: monthPeriod(parsed.data.periodYear, parsed.data.periodMonth),
    });
    if (!res.ok) return { ok: false, message: res.message ?? "No se pudo mover el presupuesto." };
    revalidatePath("/gastos");
    revalidatePath("/mi-base-financiera");
    return { ok: true };
  } catch (err) {
    logger.error("confirmMoveBudget fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos mover el presupuesto." };
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
    const { reportPaymentAction, getDebt } = await import("@/modules/control");
    // B1 (#437): reportPaymentAction ahora EXIGE la moneda. Si la IA no la extrajo, resolvemos la
    // NATIVA de la deuda (un abono es en la moneda de su deuda); si la extrajo distinta, el guard
    // del servicio la rechaza. Nunca se omite.
    const debt = await getDebt(parsed.data.debtId);
    if (!debt) return { ok: false, message: "No encontré esa deuda." };
    const res = await reportPaymentAction({
      debtId: parsed.data.debtId,
      paymentDate: parsed.data.paymentDate,
      amount: 0,
      extraAmount: parsed.data.amount,
      kind: "extraordinario",
      currency: parsed.data.currency ?? debt.currency,
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
  if (!isSupabaseConfigured())
    return { ok: false, message: "Conecta Supabase para usar el transcript." };
  const user = await getUser();
  const to = user?.email;
  if (!to) return { ok: false, message: "No encontramos tu correo para enviarte el transcript." };
  try {
    const msgs = await loadTodayChat();
    if (msgs.length === 0) return { ok: false, message: "No hay conversación de hoy para enviar." };
    const dateLabel = costaRicaDateLabel();
    const text = buildTranscriptText(msgs, { dateLabel });
    const html = `<pre style="font-family:ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;font-size:14px;line-height:1.5">${escapeHtml(text)}</pre>`;
    const res = await sendEmail({
      to,
      subject: `Tu conversación con My Agent C+ — ${dateLabel}`,
      html,
    });
    if (!res.ok) {
      return {
        ok: false,
        message: res.skipped
          ? "El correo no está configurado ahora."
          : "No pudimos enviar el correo.",
      };
    }
    return { ok: true, message: `Te enviamos el transcript a ${to}.` };
  } catch (err) {
    logger.error("emailTranscript fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos enviar el transcript." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MEMORIA DE HECHOS — control del usuario
//
// Es SU memoria: tiene que poder verla, corregirla, archivarla y borrarla entera. Todas estas
// acciones corren bajo la sesión (RLS de dueño en `user_memory`), así que nadie puede tocar la
// memoria de otro ni siquiera del mismo hogar. Ninguna llama al LLM.
// ─────────────────────────────────────────────────────────────────────────────

/** Un recuerdo tal como lo ve la pantalla de Ajustes. */
export type MemoryItem = {
  id: string;
  fact: string;
  category: MemoryCategory;
  status: "activa" | "archivada";
  updatedAt: string;
};

/** Lo que el asesor recuerda del usuario: activos primero, archivados después. */
export async function listMyMemoryAction(): Promise<MemoryItem[]> {
  if (!isSupabaseConfigured()) return [];
  const { listMemoryForUser } = await import("@/lib/ai/memory-store");
  const facts = await listMemoryForUser();
  return facts.map((f) => ({
    id: f.id,
    fact: f.fact,
    category: f.category,
    status: f.status,
    updatedAt: f.updatedAt,
  }));
}

/** Corrige el texto de un recuerdo (el extractor entendió mal, o cambió el detalle). */
export async function updateMemoryFactAction(id: string, fact: string): Promise<ConfirmResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  if (!id) return { ok: false, message: "Recuerdo inválido." };
  try {
    const { updateFactText } = await import("@/lib/ai/memory-store");
    await updateFactText(id, fact);
    revalidatePath("/configuracion");
    return { ok: true };
  } catch (err) {
    // El mensaje de la guarda de cifras es informativo y va tal cual al usuario.
    return { ok: false, message: err instanceof Error ? err.message : "No pudimos guardarlo." };
  }
}

/**
 * Archiva un recuerdo: deja de inyectarse al asesor, pero sigue visible en Ajustes por si el
 * usuario quiere entender qué pasó con él. Es lo que ejecuta la tarjeta de "olvidá eso" del chat.
 */
export async function forgetMemoryFactAction(raw: unknown): Promise<ConfirmResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  const id = typeof raw === "string" ? raw : ((raw as { id?: unknown } | null)?.id ?? "");
  if (typeof id !== "string" || !id) return { ok: false, message: "Recuerdo inválido." };
  try {
    const { archiveFact } = await import("@/lib/ai/memory-store");
    await archiveFact(id);
    revalidatePath("/configuracion");
    return { ok: true };
  } catch (err) {
    logger.error("forgetMemoryFact fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos olvidarlo." };
  }
}

/** Borra un recuerdo de verdad (fila fuera). */
export async function deleteMemoryFactAction(id: string): Promise<ConfirmResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  if (!id) return { ok: false, message: "Recuerdo inválido." };
  try {
    const { deleteFact } = await import("@/lib/ai/memory-store");
    await deleteFact(id);
    revalidatePath("/configuracion");
    return { ok: true };
  } catch (err) {
    logger.error("deleteMemoryFact fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos borrarlo." };
  }
}

/** "Borrar toda mi memoria": el asesor vuelve a no saber nada personal. Irreversible. */
export async function clearMyMemoryAction(): Promise<ConfirmResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    const { clearMemory } = await import("@/lib/ai/memory-store");
    await clearMemory();
    revalidatePath("/configuracion");
    return { ok: true };
  } catch (err) {
    logger.error("clearMyMemory fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos borrar tu memoria." };
  }
}

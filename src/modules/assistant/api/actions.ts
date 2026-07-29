"use server";

/**
 * Acción de confirmación de transacción. Es el ÚNICO punto que ejecuta la
 * creación tras la confirmación explícita del usuario (desde el wizard, la
 * tarjeta de acción de IA o el receipt scanner). El endpoint de chat nunca crea.
 */
import { revalidatePath } from "next/cache";
import { transactionInputSchema, priceAlertInputSchema } from "@/modules/assistant/schemas";
import { createTransaction } from "@/modules/assistant/services/transaction-service";
import { listSobresForKind, getSobreRemaining } from "@/modules/financial-base";
import type { SobreOption, SobreRemaining } from "@/modules/financial-base";
import { createGoal, goalInputSchema } from "@/modules/control";
import { createInvestmentAlert } from "@/modules/wealth";
import { isSupabaseConfigured, getUser } from "@/lib/auth/session";
import { loadTodayChat, buildTranscriptText, startOfCostaRicaDayISO, type StoredChatMessage } from "@/lib/ai/chat-store";
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

/** Mensajes del chat de HOY del usuario (para que la UI cargue el hilo al abrir, no arranque vacía). */
export async function loadTodayChatAction(): Promise<StoredChatMessage[]> {
  if (!isSupabaseConfigured()) return [];
  return loadTodayChat();
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

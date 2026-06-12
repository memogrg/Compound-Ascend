"use server";

import { revalidatePath } from "next/cache";
import {
  investmentInputSchema,
  policyInputSchema,
  holdingInputSchema,
  holdingSaleInputSchema,
  dividendInputSchema,
  rentalPaymentInputSchema,
} from "@/modules/wealth/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createInvestment,
  createPolicy,
  updateInvestment,
  updatePolicy,
  deleteInvestment,
  deletePolicy,
} from "@/modules/wealth/services/wealth-service";
import {
  createHolding,
  updateHolding,
  deleteHolding,
  recordHoldingSale,
} from "@/modules/wealth/services/holdings-service";
import {
  createDividend,
  deleteDividend,
  listDividends,
} from "@/modules/wealth/services/dividend-service";
import {
  createRentalPayment,
  deleteRentalPayment,
  listRentalPayments,
} from "@/modules/wealth/services/rental-service";
import {
  getHoldingHistory,
  type HistoryPoint,
  type Period,
} from "@/modules/wealth/services/holding-history-service";
import type { Holding } from "@/modules/wealth/types";
import { isSupabaseConfigured, getUser } from "@/lib/auth/session";
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

export async function addInvestmentAction(raw: unknown): Promise<ActionResult> {
  const parsed = investmentInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await createInvestment(parsed.data);
    revalidatePath("/patrimonio");
    return { ok: true };
  } catch (err) {
    logger.error("addInvestment fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos guardar la inversión." };
  }
}

export async function addPolicyAction(raw: unknown): Promise<ActionResult> {
  const parsed = policyInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await createPolicy(parsed.data);
    revalidatePath("/patrimonio/proteccion");
    return { ok: true };
  } catch (err) {
    logger.error("addPolicy fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos guardar la póliza." };
  }
}

export async function editInvestmentAction(id: string, raw: unknown): Promise<ActionResult> {
  const parsed = investmentInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await updateInvestment(id, parsed.data);
    revalidatePath("/patrimonio");
    return { ok: true };
  } catch (err) {
    logger.error("editInvestment fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos actualizar la inversión." };
  }
}

export async function editPolicyAction(id: string, raw: unknown): Promise<ActionResult> {
  const parsed = policyInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await updatePolicy(id, parsed.data);
    revalidatePath("/patrimonio/proteccion");
    return { ok: true };
  } catch (err) {
    logger.error("editPolicy fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos actualizar la póliza." };
  }
}

export async function removeInvestmentAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await deleteInvestment(id);
    revalidatePath("/patrimonio");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function removePolicyAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await deletePolicy(id);
    revalidatePath("/patrimonio/proteccion");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// ── Holdings ─────────────────────────────────────────────────────

export async function addHoldingAction(raw: unknown): Promise<ActionResult> {
  const parsed = holdingInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await createHolding(parsed.data);
    revalidatePath("/patrimonio");
    return { ok: true };
  } catch (err) {
    logger.error("addHolding fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos guardar la posición." };
  }
}

export async function editHoldingAction(id: string, raw: unknown): Promise<ActionResult> {
  const parsed = holdingInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await updateHolding(id, parsed.data);
    revalidatePath("/patrimonio");
    return { ok: true };
  } catch (err) {
    logger.error("editHolding fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos actualizar la posición." };
  }
}

export async function removeHoldingAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await deleteHolding(id);
    revalidatePath("/patrimonio");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// ── Dividendos ────────────────────────────────────────────────────

/** Venta/retiro parcial: ingreso vinculado + disminución de la posición (Fase 4). */
export async function sellHoldingAction(raw: unknown): Promise<ActionResult> {
  const parsed = holdingSaleInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await recordHoldingSale(parsed.data);
    revalidatePath("/patrimonio");
    revalidatePath("/transacciones");
    revalidatePath("/mi-base-financiera");
    return { ok: true };
  } catch (err) {
    logger.error("sellHolding fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos registrar la venta." };
  }
}

export async function addDividendAction(raw: unknown): Promise<ActionResult> {
  const parsed = dividendInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await createDividend(parsed.data);
    revalidatePath("/patrimonio");
    // El dividendo también nace como transacción vinculada (Fase 1).
    revalidatePath("/transacciones");
    revalidatePath("/mi-base-financiera");
    return { ok: true };
  } catch (err) {
    logger.error("addDividend fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos registrar el dividendo." };
  }
}

export async function removeDividendAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await deleteDividend(id);
    revalidatePath("/patrimonio");
    revalidatePath("/transacciones");
    revalidatePath("/mi-base-financiera");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// ── Renta (activos de renta: alquiler / Airbnb / auto / negocio) ──

export async function addRentalIncomeAction(raw: unknown): Promise<ActionResult> {
  const parsed = rentalPaymentInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await createRentalPayment(parsed.data);
    revalidatePath("/patrimonio");
    // La renta también nace como transacción vinculada (Fase 1).
    revalidatePath("/transacciones");
    revalidatePath("/mi-base-financiera");
    return { ok: true };
  } catch (err) {
    logger.error("addRentalIncome fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos registrar la renta." };
  }
}

export async function removeRentalPaymentAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await deleteRentalPayment(id);
    revalidatePath("/patrimonio");
    revalidatePath("/transacciones");
    revalidatePath("/mi-base-financiera");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Rentas registradas de una posición. */
export async function listRentalPaymentsAction(
  holdingId: string,
): Promise<import("@/modules/wealth/types").RentalPayment[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    return await listRentalPayments(holdingId);
  } catch {
    return [];
  }
}

/** País de residencia del usuario (para guía de DCA). */
export async function getUserCountryAction(): Promise<string | null> {
  const user = await getUser();
  if (!user) return null;
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("personal_profiles")
      .select("country")
      .eq("user_id", user.id)
      .maybeSingle();
    return data?.country ?? null;
  } catch {
    return null;
  }
}

/** Historial de valor de una posición para la gráfica de detalle. */
export async function getHoldingHistoryAction(
  holding: Holding,
  currentPrice: number | null,
  period: Period,
): Promise<HistoryPoint[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    return await getHoldingHistory(holding, currentPrice, period);
  } catch {
    return [];
  }
}

/** Dividendos de una posición. */
export async function listDividendsAction(
  holdingId: string,
): Promise<import("@/modules/wealth/types").Dividend[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    return await listDividends(holdingId);
  } catch {
    return [];
  }
}

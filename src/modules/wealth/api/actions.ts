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
import { listDebts } from "@/modules/control";
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
  listHoldingPurchases,
  listHoldingValuations,
  recordHoldingValuation,
  type HistoryPoint,
  type HoldingValuation,
  type Period,
} from "@/modules/wealth/services/holding-history-service";
import type { Holding } from "@/modules/wealth/types";
import { adjustContributionPrice } from "@/modules/wealth/services/contribution-service";
import { isSupabaseConfigured, getUser } from "@/lib/auth/session";
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

export async function listHoldingPurchasesAction(
  holdingId: string,
): Promise<import("@/modules/wealth/services/holding-history-service").HoldingPurchase[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    return await listHoldingPurchases(holdingId);
  } catch {
    return [];
  }
}

export async function listHoldingValuationsAction(
  holdingId: string,
): Promise<HoldingValuation[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    return await listHoldingValuations(holdingId);
  } catch {
    return [];
  }
}

export async function recordHoldingValuationAction(
  holdingId: string,
  asOf: string,
  value: number,
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  if (!(value > 0) || !asOf) return { ok: false, message: "Valor y fecha requeridos." };
  try {
    await recordHoldingValuation(holdingId, asOf, value);
    revalidatePath("/patrimonio");
    return { ok: true };
  } catch (err) {
    logger.error("recordHoldingValuation fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos guardar el valor." };
  }
}

/** Deuda ligable a un inmueble (C-1b): forma mínima para el selector y el detalle. */
export type LinkableDebt = { id: string; name: string; currentPayment: number; currency: string };

/** Deudas del usuario para ligar a un inmueble de renta. Best-effort. */
export async function listLinkableDebtsAction(): Promise<LinkableDebt[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const debts = await listDebts();
    return debts.map((d) => ({
      id: d.id,
      name: d.name,
      currentPayment: d.currentPayment,
      currency: d.currency,
    }));
  } catch {
    return [];
  }
}

export async function adjustContributionPriceAction(
  contributionId: string,
  newPrice: number,
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  if (!(newPrice > 0)) return { ok: false, message: "El precio debe ser mayor a 0." };
  try {
    await adjustContributionPrice(contributionId, newPrice);
    revalidatePath("/patrimonio");
    return { ok: true };
  } catch (err) {
    logger.error("adjustContributionPrice fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos actualizar el precio del aporte." };
  }
}

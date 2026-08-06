"use server";

import { revalidatePath } from "next/cache";
import {
  investmentInputSchema,
  policyInputSchema,
  holdingInputSchema,
  holdingSaleInputSchema,
  holdingContributionSchema,
  policyPremiumInputSchema,
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
  payPolicyPremium,
  listPolicies,
} from "@/modules/wealth/services/wealth-service";
import { getPortfolioReport } from "@/modules/wealth/services/portfolio-service";
import type { HoldingPerformance, HoldingNativo, InsurancePolicy } from "@/modules/wealth/types";
import {
  createHolding,
  updateHolding,
  deleteHolding,
  setHoldingDca,
  recordHoldingSale,
  contributeToHolding,
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
import {
  adjustContributionPrice,
  advancePremiums,
  getPlanPaidUntil,
} from "@/modules/wealth/services/contribution-service";
import type { PlanPeriod } from "@/modules/wealth/engine/premiums";
import {
  listInvestmentAlerts,
  createInvestmentAlert,
  updateInvestmentAlert,
  deleteInvestmentAlert,
  type InvestmentAlert,
  type CreateAlertInput,
} from "@/modules/wealth/services/price-alerts-service";
import type { AlertDirection } from "@/modules/wealth/engine/price-alerts";
import { isSupabaseConfigured, getUser } from "@/lib/auth/session";
import { setDesiredMonthlyLifestyle } from "@/modules/wealth/services/lifestyle-service";
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

/**
 * Estilo de vida DESEADO mensual (insumo del número de libertad). Dato PERSONAL:
 * se guarda en personal_profiles.extra del usuario, no del hogar. `null` lo borra.
 * Revalida Mi Rich Life para que la escalera repinte con el nuevo número.
 */
export async function setDesiredLifestyleAction(
  amount: number | null,
  currency: string,
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  let value: number | null = null;
  if (amount !== null) {
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return { ok: false, fieldErrors: { amount: "Ingresa un monto mensual mayor a 0." } };
    }
    value = Math.round(amount);
  }
  // La moneda se guarda JUNTO al importe: es un importe LIBRE (defino cuánto quiero gastar),
  // así que la elijo yo, y el número sin ella no significa nada.
  const cur = /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : "CRC";
  try {
    await setDesiredMonthlyLifestyle(value, cur);
    revalidatePath("/mi-rich-life");
    revalidatePath("/m/libertad");
    revalidatePath("/m");
    return { ok: true };
  } catch (err) {
    logger.error("setDesiredLifestyle fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos guardar tu estilo de vida deseado." };
  }
}

/**
 * Meses del fondo de paz (preferencia PERSONAL, acotada 3-6). Revalida Defensa (web + móvil)
 * para que el objetivo del fondo repinte con el nuevo N.
 */
export async function setPeaceMonthsAction(months: number): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  if (typeof months !== "number" || !Number.isFinite(months)) {
    return { ok: false, fieldErrors: { months: "Valor no válido." } };
  }
  try {
    const { setPeaceMonths } = await import("@/modules/wealth/services/fund-sizing-service");
    await setPeaceMonths(months);
    revalidatePath("/patrimonio/proteccion");
    revalidatePath("/m/proteccion");
    return { ok: true };
  } catch (err) {
    logger.error("setPeaceMonths fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos guardar los meses del fondo de paz." };
  }
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

export async function addPolicyAction(raw: unknown): Promise<ActionResult & { id?: string }> {
  const parsed = policyInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    const id = await createPolicy(parsed.data);
    revalidatePath("/patrimonio/proteccion");
    return { ok: true, id };
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

/** Pago de la prima de un seguro existente (el "+" de Defensa). Reusa la infra de
 *  transacciones vinculadas; la moneda la valida el servicio contra la póliza. */
export async function payPolicyPremiumAction(raw: unknown): Promise<ActionResult> {
  const parsed = policyPremiumInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await payPolicyPremium(parsed.data);
    revalidatePath("/patrimonio/proteccion");
    revalidatePath("/gastos");
    revalidatePath("/transacciones");
    return { ok: true };
  } catch (err) {
    logger.error("payPolicyPremium fallido", { message: err instanceof Error ? err.message : "?" });
    return {
      ok: false,
      message: err instanceof Error ? err.message : "No pudimos registrar la prima.",
    };
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

/**
 * Fija el aporte mensual (DCA) de una posición. Es la ejecución del consejo "apartá X/mes para
 * esta inversión" que el asesor propone como acción: el usuario confirma en la tarjeta y recién
 * ahí se escribe. 0 apaga el recurrente.
 */
export async function setHoldingDcaAction(
  id: string,
  monthlyContribution: number,
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  if (!Number.isFinite(monthlyContribution) || monthlyContribution < 0) {
    return { ok: false, message: "El aporte mensual no es válido." };
  }
  try {
    await setHoldingDca(id, monthlyContribution);
    revalidatePath("/patrimonio");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    logger.error("setHoldingDca fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos actualizar el aporte mensual." };
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

/** Aporte/compra a una posición existente (el "+" contextual). Reusa la lógica de merge/valor
 *  de holdings-service; la moneda la valida el servicio contra el holding. */
export async function contributeToHoldingAction(raw: unknown): Promise<ActionResult> {
  const parsed = holdingContributionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await contributeToHolding(parsed.data);
    revalidatePath("/patrimonio");
    return { ok: true };
  } catch (err) {
    logger.error("contributeToHolding fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return {
      ok: false,
      message: err instanceof Error ? err.message : "No pudimos registrar el aporte.",
    };
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

export async function listHoldingValuationsAction(holdingId: string): Promise<HoldingValuation[]> {
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

// ── Alertas de inversión (price · time_held · vesting) ──────────────────────

export async function listInvestmentAlertsAction(holdingId?: string): Promise<InvestmentAlert[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    return await listInvestmentAlerts(holdingId);
  } catch {
    return [];
  }
}

export async function createInvestmentAlertAction(
  input: CreateAlertInput,
): Promise<ActionResult & { id?: string }> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    const res = await createInvestmentAlert(input);
    if (res.ok) revalidatePath("/patrimonio");
    return res;
  } catch (err) {
    logger.error("createInvestmentAlert fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos crear la alerta." };
  }
}

export async function updateInvestmentAlertAction(
  id: string,
  patch: {
    targetPrice?: number;
    direction?: AlertDirection;
    yearsThreshold?: number;
    triggerDate?: string;
    active?: boolean;
  },
): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    const res = await updateInvestmentAlert(id, patch);
    if (res.ok) revalidatePath("/patrimonio");
    return res;
  } catch (err) {
    logger.error("updateInvestmentAlert fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos actualizar la alerta." };
  }
}

export async function deleteInvestmentAlertAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    const res = await deleteInvestmentAlert(id);
    if (res.ok) revalidatePath("/patrimonio");
    return res;
  } catch (err) {
    logger.error("deleteInvestmentAlert fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos borrar la alerta." };
  }
}

/** Mes hasta el que las cuotas del plan están al día (o null si aún no hay aportes). */
export async function getPlanPaidUntilAction(holdingId: string): Promise<PlanPeriod | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    return await getPlanPaidUntil(holdingId);
  } catch {
    return null;
  }
}

export async function advancePremiumsAction(
  holdingId: string,
  globalAmount: number,
): Promise<ActionResult & { advanced?: number }> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  if (!(globalAmount > 0)) return { ok: false, message: "Ingresá un monto válido." };
  try {
    const { advanced } = await advancePremiums(holdingId, globalAmount);
    revalidatePath("/patrimonio");
    return { ok: true, advanced };
  } catch (err) {
    logger.error("advancePremiums fallido", { message: err instanceof Error ? err.message : "?" });
    return {
      ok: false,
      message: err instanceof Error ? err.message : "No pudimos adelantar cuotas.",
    };
  }
}

// ── Destinos para el selector unificado de "salida de dinero" del Inicio ─────
// Getters on-demand que pueblan los pickers vinculados del "+". Solo lectura; el
// registro real va por su acción canónica (contributeToHoldingAction / payPolicyPremiumAction).

/** Holdings (con rendimiento) + crudos para el picker de "invertir / aportar". */
export async function getHoldingContribTargetsAction(): Promise<{
  holdings: HoldingPerformance[];
  rawHoldings: HoldingNativo[];
  currency: string;
}> {
  const report = await getPortfolioReport();
  const holdings = [...report.analytics.holdingsWithPerformance].sort(
    (a, b) => b.currentValue - a.currentValue,
  );
  return { holdings, rawHoldings: report.holdings, currency: report.currency };
}

/** Pólizas para el picker de "pagar una prima". */
export async function getPolicyPremiumTargetsAction(): Promise<{ policies: InsurancePolicy[] }> {
  return { policies: await listPolicies() };
}

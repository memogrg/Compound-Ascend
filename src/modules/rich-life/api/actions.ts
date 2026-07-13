"use server";

import { revalidatePath } from "next/cache";
import { assetInputSchema, liabilityInputSchema } from "@/modules/rich-life/schemas";
import {
  createAsset,
  createLiability,
  updateAsset,
  updateLiability,
  deleteAsset,
  deleteLiability,
  getRichLifeSummary,
  aggregateNetWorth,
} from "@/modules/rich-life/services/rich-life-service";
import { getExpenseBudgetVsReal, monthPeriod } from "@/modules/financial-base";
import { getDebtsOverview, getIndexRates } from "@/modules/control";
import { isSupabaseConfigured, requireUser } from "@/lib/auth/session";
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

export async function addAssetAction(raw: unknown): Promise<ActionResult> {
  const parsed = assetInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await createAsset(parsed.data);
    revalidatePath("/mi-rich-life");
    return { ok: true };
  } catch (err) {
    logger.error("addAsset fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos guardar el activo." };
  }
}

export async function addLiabilityAction(raw: unknown): Promise<ActionResult> {
  const parsed = liabilityInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await createLiability(parsed.data);
    revalidatePath("/mi-rich-life");
    return { ok: true };
  } catch (err) {
    logger.error("addLiability fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos guardar el pasivo." };
  }
}

export async function editAssetAction(id: string, raw: unknown): Promise<ActionResult> {
  const parsed = assetInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await updateAsset(id, parsed.data);
    revalidatePath("/mi-rich-life");
    return { ok: true };
  } catch (err) {
    logger.error("editAsset fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos actualizar el activo." };
  }
}

export async function editLiabilityAction(id: string, raw: unknown): Promise<ActionResult> {
  const parsed = liabilityInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await updateLiability(id, parsed.data);
    revalidatePath("/mi-rich-life");
    return { ok: true };
  } catch (err) {
    logger.error("editLiability fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos actualizar el pasivo." };
  }
}

export async function removeAssetAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await deleteAsset(id);
    revalidatePath("/mi-rich-life");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function removeLiabilityAction(id: string): Promise<ActionResult> {
  if (!isSupabaseConfigured()) return { ok: false };
  try {
    await deleteLiability(id);
    revalidatePath("/mi-rich-life");
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// ── Widget de pantalla de inicio (Android) ───────────────────────────────────

/**
 * Snapshot mínimo que la app escribe para el widget de "Patrimonio neto". REUSA los mismos
 * valores que muestra el hero del dashboard/patrimonio, sin recalcular nada:
 *  - `patrimonioNeto`/`trendPct`: getRichLifeSummary (patrimonio neto + Δ mensual).
 *  - `incomeMonthly`/`expenseMonthly`/`freeCashflow`: aggregateNetWorth → base.indicators.*
 *    (idénticos a la fila Ingresos·Gastos·Flujo del dashboard). `null` si no están a mano.
 *  - `budgetExpense`/`realExpense`: getExpenseBudgetVsReal (gastado vs presupuestado del mes POR
 *    CATEGORÍA, excluyendo movimientos enlazados), para el widget "Presupuesto del mes". `null`
 *    si no hay presupuesto/gastos este mes.
 *  - `nextDebt*`: próximo pago de deuda (getDebtsOverview → DebtVM.nextDue), para el widget
 *    "Próximo pago de deuda". `null` si no hay deudas con fecha de pago.
 */
export type WidgetSnapshot = {
  patrimonioNeto: number;
  currency: string;
  trendPct: number | null;
  incomeMonthly: number | null;
  expenseMonthly: number | null;
  freeCashflow: number | null;
  budgetExpense: number | null;
  realExpense: number | null;
  nextDebtName: string | null;
  nextDebtAmount: number | null;
  nextDebtDue: string | null; // yyyy-mm-dd
  updatedAt: string; // ISO
};

export async function getWidgetSnapshotAction(): Promise<WidgetSnapshot | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    await requireUser();
    const summary = await getRichLifeSummary();
    const ind = summary.snapshot.indicators;
    // `wealthVelocity` es el Δ mensual del patrimonio neto (dato ya calculado). El % vs
    // mes = Δ / patrimonio del mes anterior (= netWorth − Δ); null si no hay base previa.
    const vel = ind.wealthVelocity;
    let trendPct: number | null = null;
    if (vel !== null) {
      const prev = ind.netWorth - vel;
      if (prev !== 0) trendPct = (vel / Math.abs(prev)) * 100;
    }

    // Fila Ingresos·Gastos·Flujo: mismos valores (base.indicators.*) que el hero del
    // dashboard. Best-effort e independiente: si falla, la tarjeta se enfoca en el número.
    let incomeMonthly: number | null = null;
    let expenseMonthly: number | null = null;
    let freeCashflow: number | null = null;
    try {
      const agg = await aggregateNetWorth();
      incomeMonthly = agg.netMonthlyIncome;
      expenseMonthly = agg.monthlyExpenses;
      freeCashflow = agg.freeCashflow;
    } catch (e) {
      logger.warn("getWidgetSnapshot flujo no disponible", {
        message: e instanceof Error ? e.message : "?",
      });
    }

    // Gastado vs presupuestado del mes por CATEGORÍA (getExpenseBudgetVsReal, mismo criterio
    // que el tab de Gastos: excluye movimientos enlazados a entidades). Best-effort e
    // independiente: quedan null si no hay presupuesto/gastos este mes.
    let budgetExpense: number | null = null;
    let realExpense: number | null = null;
    try {
      const now = new Date();
      const period = monthPeriod(now.getFullYear(), now.getMonth() + 1);
      const bvr = await getExpenseBudgetVsReal(period);
      budgetExpense = bvr.budgetExpense;
      realExpense = bvr.realExpense;
    } catch (e) {
      logger.warn("getWidgetSnapshot presupuesto no disponible", {
        message: e instanceof Error ? e.message : "?",
      });
    }

    // Próximo pago de deuda (getDebtsOverview → DebtVM con nextDue ya calculado por el motor
    // due-dates, igual que /m/deudas). Elige la deuda con nextDue más cercano: la primera
    // pendiente (>= hoy); si todas están vencidas, la más reciente. Best-effort → null si nada.
    let nextDebtName: string | null = null;
    let nextDebtAmount: number | null = null;
    let nextDebtDue: string | null = null;
    try {
      const rates = await getIndexRates();
      const ov = await getDebtsOverview(rates);
      const today = new Date().toISOString().slice(0, 10);
      const withDue = ov.debts
        .filter((d) => d.nextDue)
        .map((d) => ({ d, due: d.nextDue!.slice(0, 10) }));
      const upcoming = withDue.filter((x) => x.due >= today).sort((a, b) => a.due.localeCompare(b.due));
      const overdue = withDue.filter((x) => x.due < today).sort((a, b) => b.due.localeCompare(a.due));
      const pick = upcoming[0] ?? overdue[0];
      if (pick) {
        nextDebtName = pick.d.name;
        nextDebtAmount = pick.d.monthlyPayment || pick.d.minPayment;
        nextDebtDue = pick.due;
      }
    } catch (e) {
      logger.warn("getWidgetSnapshot próximo pago no disponible", {
        message: e instanceof Error ? e.message : "?",
      });
    }

    return {
      patrimonioNeto: ind.netWorth,
      currency: summary.currency,
      trendPct,
      incomeMonthly,
      expenseMonthly,
      freeCashflow,
      budgetExpense,
      realExpense,
      nextDebtName,
      nextDebtAmount,
      nextDebtDue,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.error("getWidgetSnapshot fallido", { message: err instanceof Error ? err.message : "?" });
    return null;
  }
}

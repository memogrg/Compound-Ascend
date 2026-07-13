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
 */
export type WidgetSnapshot = {
  patrimonioNeto: number;
  currency: string;
  trendPct: number | null;
  incomeMonthly: number | null;
  expenseMonthly: number | null;
  freeCashflow: number | null;
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

    return {
      patrimonioNeto: ind.netWorth,
      currency: summary.currency,
      trendPct,
      incomeMonthly,
      expenseMonthly,
      freeCashflow,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    logger.error("getWidgetSnapshot fallido", { message: err instanceof Error ? err.message : "?" });
    return null;
  }
}

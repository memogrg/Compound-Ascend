"use server";

/**
 * Server Actions del Saco de Liquidez ("Tu Liquidez"). Validan con Zod y
 * persisten respetando RLS; revalidan la ruta. No persisten si Supabase no está
 * configurado (dev), devolviendo un resultado controlado.
 *
 * Acá vivía también el CRUD de income_sources/expense_items del Módulo 2
 * original. Se retiró junto con su UI (BaseDashboard/BaseActions): los
 * indicadores pasaron a leer el presupuesto vivo (budget_items) y esas tablas
 * dejaron de tener pantalla que las escribiera.
 */
import { revalidarRuta } from "@/lib/revalidation/rutas-espejo";
import { z } from "zod";
import {
  setOpeningBalance,
  reconcileBalance,
} from "@/modules/financial-base/services/liquidity-service";
import { isSupabaseConfigured } from "@/lib/auth/session";
import { SUPPORTED_CURRENCIES } from "@/lib/fx";
import { logger } from "@/lib/logger";

export type ActionResult = { ok: boolean; fieldErrors?: Record<string, string>; message?: string };

// ── Saco de Liquidez ("Tu Liquidez") ──
const openingSchema = z.number().min(0, "El saldo no puede ser negativo.");
const reconcileSchema = z.number().min(0, "El saldo no puede ser negativo.");

/** Fija el saldo inicial de liquidez (estado vacío). */
export async function setOpeningBalanceAction(
  amount: number,
  currency?: string,
): Promise<ActionResult> {
  const parsed = openingSchema.safeParse(amount);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Monto no válido." };
  // Moneda opcional del saldo declarado: solo si es soportada; cualquier otra → undefined
  // (el servicio cae a la principal). El ledger es multi-moneda y loadRows la convierte (#87).
  const cur =
    currency && (SUPPORTED_CURRENCIES as readonly string[]).includes(currency)
      ? currency
      : undefined;
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await setOpeningBalance(parsed.data, cur);
    revalidarRuta("/mi-base-financiera");
    return { ok: true };
  } catch (err) {
    logger.error("setOpeningBalance fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos guardar tu saldo inicial." };
  }
}

/** Reconciliación 1-toque: ajusta el saldo al valor real de hoy. */
export async function reconcileBalanceAction(realBalance: number): Promise<ActionResult> {
  const parsed = reconcileSchema.safeParse(realBalance);
  if (!parsed.success)
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Monto no válido." };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await reconcileBalance(parsed.data);
    revalidarRuta("/mi-base-financiera");
    return { ok: true };
  } catch (err) {
    logger.error("reconcileBalance fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos ajustar tu saldo." };
  }
}

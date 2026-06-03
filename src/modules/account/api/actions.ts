"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  updatePrimaryCurrency,
  clearAllFinancialData,
} from "@/modules/account/services/account-service";
import { isSupabaseConfigured } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

export type AccountActionResult = { ok: boolean; message?: string };

const currencySchema = z.enum(["CRC", "USD", "EUR", "MXN", "COP", "GBP"]);

const PATHS = [
  "/dashboard",
  "/configuracion",
  "/mi-base-financiera",
  "/control-financiero",
  "/patrimonio",
  "/patrimonio/proteccion",
  "/mi-rich-life",
];

export async function updateCurrencyAction(code: string): Promise<AccountActionResult> {
  const parsed = currencySchema.safeParse(code);
  if (!parsed.success) return { ok: false, message: "Moneda no válida." };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await updatePrimaryCurrency(parsed.data);
    PATHS.forEach((p) => revalidatePath(p));
    return { ok: true };
  } catch (err) {
    logger.error("updateCurrency fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos cambiar la moneda." };
  }
}

export async function clearAllDataAction(): Promise<AccountActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase." };
  try {
    await clearAllFinancialData();
    PATHS.forEach((p) => revalidatePath(p));
    return { ok: true };
  } catch (err) {
    logger.error("clearAllData fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos borrar los datos." };
  }
}

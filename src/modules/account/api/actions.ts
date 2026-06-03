"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  updatePrimaryCurrency,
  clearAllFinancialData,
} from "@/modules/account/services/account-service";
import { DISPLAY_CURRENCY_COOKIE } from "@/modules/financial-base/services/base-service";
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

/**
 * Switch rápido de moneda de VISUALIZACIÓN (cookie). No cambia la moneda
 * principal ni los datos: solo cómo se muestran los totales en los dashboards.
 * Para "Predeterminado" se borra la cookie y vuelve a usarse la moneda principal.
 */
export async function setDisplayCurrencyAction(code: string): Promise<AccountActionResult> {
  const store = await cookies();
  if (code === "") {
    store.delete(DISPLAY_CURRENCY_COOKIE);
  } else {
    const parsed = currencySchema.safeParse(code);
    if (!parsed.success) return { ok: false, message: "Moneda no válida." };
    store.set(DISPLAY_CURRENCY_COOKIE, parsed.data, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }
  PATHS.forEach((p) => revalidatePath(p));
  return { ok: true };
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

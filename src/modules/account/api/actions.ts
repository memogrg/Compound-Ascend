"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  updatePrimaryCurrency,
  clearAllFinancialData,
} from "@/modules/account/services/account-service";
import { DISPLAY_CURRENCY_COOKIE } from "@/modules/financial-base/services/base-service";
import { isSupabaseConfigured, getUser } from "@/lib/auth/session";
import {
  isEmailConfigured,
  emailProviderName,
  verifyEmailConnection,
  sendEmail,
} from "@/lib/email/send";
import { generateLinkOtp, revokeLink } from "@/lib/whatsapp/links-service";
import { logger } from "@/lib/logger";

export type AccountActionResult = { ok: boolean; message?: string };

export type WhatsAppLinkResult = {
  ok: boolean;
  otp?: string;
  botNumber?: string | null;
  expiresInMin?: number;
  message?: string;
};

/** Genera el OTP para vincular WhatsApp; devuelve el código y el número del bot. */
export async function linkWhatsAppAction(): Promise<WhatsAppLinkResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para vincular." };
  try {
    const r = await generateLinkOtp();
    revalidatePath("/configuracion");
    return { ok: true, otp: r.otp, botNumber: r.botNumber, expiresInMin: r.expiresInMin };
  } catch (err) {
    logger.error("linkWhatsApp fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos generar el código. Inténtalo de nuevo." };
  }
}

/** Desvincula el WhatsApp del usuario. */
export async function revokeWhatsAppAction(): Promise<AccountActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase." };
  try {
    await revokeLink();
    revalidatePath("/configuracion");
    return { ok: true };
  } catch (err) {
    logger.error("revokeWhatsApp fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos desvincular." };
  }
}

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

export type EmailTestResult = {
  ok: boolean;
  provider: "smtp" | "resend" | null;
  message: string;
};

/**
 * Diagnóstico de correo: detecta el proveedor, verifica la conexión/credenciales
 * (sin enviar) y manda un correo de prueba al propio usuario. Devuelve el error
 * exacto si algo falla, para saber qué falta. No expone secretos.
 */
export async function testEmailAction(): Promise<EmailTestResult> {
  const provider = emailProviderName();
  if (!isEmailConfigured()) {
    return {
      ok: false,
      provider,
      message:
        "No detecto credenciales de correo en este deploy. Verifica que agregaste SMTP_HOST, SMTP_USER y SMTP_PASS en Vercel y, sobre todo, que hiciste un redeploy después (las variables solo aplican a deploys nuevos).",
    };
  }

  const user = await getUser();
  const to = user?.email;
  if (!to) return { ok: false, provider, message: "No hay correo de sesión para la prueba." };

  const verified = await verifyEmailConnection();
  if (!verified.ok) {
    return {
      ok: false,
      provider,
      message: `Conexión SMTP rechazada: ${verified.error ?? "error desconocido"}. Suele ser App Password incorrecta, verificación en 2 pasos no activada, o el puerto/host equivocado.`,
    };
  }

  const sent = await sendEmail({
    to,
    subject: "Prueba de correo · Compound Ascend",
    html: "<p>Si recibes este correo, el envío de Compound Ascend quedó funcional. ✅</p>",
  });
  if (!sent.ok) {
    return {
      ok: false,
      provider,
      message: `La conexión funcionó pero el envío falló: ${sent.error ?? "error desconocido"}. Revisa que EMAIL_FROM coincida con el buzón autenticado (o sea un alias 'Enviar como' verificado).`,
    };
  }

  return {
    ok: true,
    provider,
    message: `¡Listo! Enviamos un correo de prueba a ${to} vía ${provider?.toUpperCase()}. Revisa tu bandeja (y spam).`,
  };
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

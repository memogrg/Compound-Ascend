"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  updatePrimaryCurrency,
  updateUserTimezone,
  clearAllFinancialData,
  updateNotificationChannel,
} from "@/modules/account/services/account-service";
import { TZ_COOKIE } from "@/lib/time/user-time";
import { NOTIFICATION_CHANNELS, type NotificationChannel } from "@/lib/notifications/preferences";
import { DISPLAY_CURRENCY_COOKIE } from "@/modules/financial-base";
import { SUPPORTED_CURRENCIES } from "@/lib/fx";
import { isSupabaseConfigured, getUser, requireUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteAccountCore } from "@/modules/account/services/account-deletion-service";
import { exportHouseholdWorkbook } from "@/modules/account/services/account-export-service";
import {
  issueDeletionOtp,
  verifyDeletionOtp,
} from "@/modules/account/services/account-otp-service";
import {
  isEmailConfigured,
  emailProviderName,
  verifyEmailConnection,
  sendEmail,
} from "@/lib/email/send";
import {
  requestIngestEmailVerification,
  confirmIngestEmail,
  removeIngestEmail,
} from "@/modules/account/services/ingest-email-service";
import { logger } from "@/lib/logger";
import { errorDetail } from "@/lib/errors";

export type AccountActionResult = { ok: boolean; message?: string };

// Moneda PRINCIPAL (base de cálculo): fiat solamente — la base no puede ser cripto.
const currencySchema = z.enum(["CRC", "USD", "EUR", "MXN", "COP", "GBP"]);
// Moneda de DISPLAY del topbar: cualquiera soportada, incluida BTC (solo convierte la vista).
const displayCurrencySchema = z
  .string()
  .refine((c) => (SUPPORTED_CURRENCIES as readonly string[]).includes(c), "Moneda no válida.");

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

/** Enciende/apaga un canal de notificación del usuario. */
export async function updateNotificationPrefAction(
  channel: string,
  enabled: boolean,
): Promise<AccountActionResult> {
  if (!(NOTIFICATION_CHANNELS as readonly string[]).includes(channel))
    return { ok: false, message: "Canal no válido." };
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    await updateNotificationChannel(channel as NotificationChannel, enabled);
    PATHS.forEach((p) => revalidatePath(p));
    return { ok: true };
  } catch (err) {
    logger.error("updateNotificationPref fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos guardar tu preferencia." };
  }
}

/**
 * Switch rápido de moneda de VISUALIZACIÓN (cookie). No cambia la moneda
 * principal ni los datos: solo cómo se muestran los totales en los dashboards.
 * Para "Predeterminado" se borra la cookie y vuelve a usarse la moneda principal.
 */
/**
 * Guarda la zona horaria IANA del usuario: la persiste en user_settings y fija la
 * cookie `tz` para que el PRIMER render server ya calcule "hoy / mes actual" en su
 * zona (sin esperar a leer el perfil). La invoca el capturador silencioso del layout
 * (con la zona del dispositivo) y el selector de Configuración.
 */
export async function saveUserTimezone(tz: string): Promise<AccountActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    const ok = await updateUserTimezone(tz);
    if (!ok) return { ok: false, message: "Zona horaria no válida." };
    const store = await cookies();
    store.set(TZ_COOKIE, tz, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    PATHS.forEach((p) => revalidatePath(p));
    return { ok: true };
  } catch (err) {
    logger.error("saveUserTimezone fallido", { message: err instanceof Error ? err.message : "?" });
    return { ok: false, message: "No pudimos guardar tu zona horaria." };
  }
}

export async function setDisplayCurrencyAction(code: string): Promise<AccountActionResult> {
  const store = await cookies();
  if (code === "") {
    store.delete(DISPLAY_CURRENCY_COOKIE);
  } else {
    const parsed = displayCurrencySchema.safeParse(code);
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
    subject: "Prueba de correo · CARTERA+",
    html: "<p>Si recibes este correo, el envío de CARTERA+ quedó funcional. ✅</p>",
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

// ---------- Borrado de cuenta (#82) ----------

/** Paso 1: genera y envía un OTP propio al correo (compuerta real, universal). */
export async function requestAccountDeletionOtpAction(): Promise<AccountActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase." };
  try {
    const user = await requireUser();
    if (!user.email) return { ok: false, message: "Tu cuenta no tiene correo para verificar." };
    const r = await issueDeletionOtp(user.id, user.email);
    if (!r.ok) return { ok: false, message: "No pudimos enviar el código. Intentá de nuevo." };
    return { ok: true, message: "Te enviamos un código a tu correo." };
  } catch {
    return { ok: false, message: "Sesión no válida." };
  }
}

export type ExportResult = { ok: boolean; filename?: string; base64?: string; message?: string };

/** Paso 2: genera el .xlsx de la data del hogar para descargar ANTES de borrar. */
export async function exportHouseholdDataAction(): Promise<ExportResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase." };
  try {
    const user = await requireUser();
    const buf = await exportHouseholdWorkbook(user.id);
    const stamp = new Date().toISOString().slice(0, 10);
    return {
      ok: true,
      filename: `cartera-plus-datos-${stamp}.xlsx`,
      base64: buf.toString("base64"),
    };
  } catch (err) {
    logger.error("exportHouseholdData fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos generar el export." };
  }
}

/** Paso 3: borrado REAL. Verifica "BORRAR" + OTP, ejecuta el core, cierra sesión. */
export async function deleteAccountAction(input: {
  confirmText: string;
  otp: string;
}): Promise<AccountActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase." };
  const parsed = z
    .object({ confirmText: z.string(), otp: z.string().min(4).max(12) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, message: "Datos incompletos." };
  if (parsed.data.confirmText.trim().toUpperCase() !== "BORRAR") {
    return { ok: false, message: 'Escribí "BORRAR" para confirmar.' };
  }

  let userId: string;
  try {
    const user = await requireUser();
    userId = user.id;
    // Compuerta: verifica el OTP propio (hash + TTL + intentos). Gatea de verdad.
    const okOtp = await verifyDeletionOtp(userId, parsed.data.otp);
    if (!okOtp) return { ok: false, message: "Código inválido o expirado." };
  } catch (err) {
    // #53: el detalle real va a los logs del servidor; el usuario ve algo genérico.
    logger.error("deleteAccount: verificación falló", { detail: errorDetail(err) });
    return { ok: false, message: "Sesión no válida." };
  }

  try {
    await deleteAccountCore(userId); // admin.deleteUser va AL FINAL adentro
  } catch (err) {
    // #53: NO enmascarar. deleteAccountCore lanza AppError con el error real en
    // `.detail` (p.ej. "admin.deleteUser: permission denied for table transactions");
    // logueá eso, no el `.message` amable. Nunca llega al cliente.
    logger.error("deleteAccount fallido", { detail: errorDetail(err) });
    return { ok: false, message: "No pudimos completar el borrado. Tu cuenta sigue activa." };
  }

  // La cuenta ya no existe: cerrar sesión (best-effort).
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  } catch {
    /* la sesión queda inválida igual */
  }
  return { ok: true };
}

// ---------- Ingesta por correo: onboarding self-serve ----------

export async function requestIngestEmailAction(email: string): Promise<AccountActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    const res = await requestIngestEmailVerification(email);
    if (res.ok) revalidatePath("/configuracion");
    return res;
  } catch (err) {
    logger.error("requestIngestEmail fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos enviar el código." };
  }
}

export async function confirmIngestEmailAction(
  email: string,
  code: string,
): Promise<AccountActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase para guardar." };
  try {
    const res = await confirmIngestEmail(email, code);
    if (res.ok) revalidatePath("/configuracion");
    return res;
  } catch (err) {
    logger.error("confirmIngestEmail fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos confirmar el correo." };
  }
}

export async function removeIngestEmailAction(id: string): Promise<AccountActionResult> {
  if (!isSupabaseConfigured()) return { ok: false, message: "Conecta Supabase." };
  try {
    const res = await removeIngestEmail(id);
    if (res.ok) revalidatePath("/configuracion");
    return res;
  } catch (err) {
    logger.error("removeIngestEmail fallido", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, message: "No pudimos eliminar el correo." };
  }
}

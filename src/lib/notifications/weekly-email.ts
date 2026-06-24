import "server-only";

/**
 * Envío del digest semanal por correo (service-role, sin sesión).
 * Salvaguardas: respeta la pref `email`; solo a quien tenga correo; cada correo
 * lleva enlace de baja funcional (token HMAC). Si falta UNSUBSCRIBE_SECRET o la
 * URL base, NO se envía (no mandamos correo con baja rota). Best-effort por usuario.
 */
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email/send";
import { getNotificationPrefs } from "@/lib/notifications/preferences";
import { signUnsubscribeToken } from "@/lib/notifications/unsubscribe-token";
import { runForUsersBestEffort } from "@/lib/insights/insights-service";
import type { AuthContext } from "@/lib/auth/auth-context";

/** Footer con el enlace de baja absoluto (lo añade la capa de envío, no el builder). */
function unsubscribeFooter(unsubUrl: string): string {
  return (
    `<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0 12px" />` +
    `<p style="font-size:12px;color:#9ca3af;font-family:system-ui,Arial,sans-serif">` +
    `Recibes este correo porque tu resumen semanal está activado. ` +
    `<a href="${unsubUrl}" style="color:#6b7280">Darme de baja de estos correos</a>.</p>`
  );
}

/** Config necesaria para un correo con baja funcional, o null si falta algo. */
function mailConfig(): { baseUrl: string; secret: string } | null {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  const secret = getServerEnv().UNSUBSCRIBE_SECRET;
  if (!baseUrl || !secret) return null;
  return { baseUrl, secret };
}

/** Envía el digest semanal a UN usuario (best-effort: lanza, el orquestador captura). */
export async function sendWeeklyDigestForUser(userId: string, ctx?: AuthContext): Promise<void> {
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  const adminCtx: AuthContext = ctx ?? { db: createServiceRoleClient(), userId };

  // Salvaguarda 1: respeta la preferencia de correo.
  const prefs = await getNotificationPrefs(userId, adminCtx);
  if (!prefs.email) return;

  // Salvaguarda 2: no se manda sin baja funcional (secret + URL base).
  const cfg = mailConfig();
  if (!cfg) return;

  // Salvaguarda 3: solo a quien tiene correo.
  const { data } = await adminCtx.db.auth.admin.getUserById(userId);
  const to = data.user?.email;
  if (!to) return;

  const { getPatrimonioReportForUser, buildWeeklyDigest } = await import("@/modules/wealth");
  const { report, level, diagnosis, currency } = await getPatrimonioReportForUser(userId);
  const digest = buildWeeklyDigest({ report, level, diagnosis, currency });

  const token = signUnsubscribeToken(userId, "email", cfg.secret);
  const unsubUrl = `${cfg.baseUrl}/api/notifications/unsubscribe?token=${token}`;

  await sendEmail({ to, subject: digest.subject, html: digest.html + unsubscribeFooter(unsubUrl) });
}

/** Envía el digest semanal a TODOS los usuarios (Vercel Cron). Best-effort. */
export async function sendWeeklyDigestForAllUsers(): Promise<{
  total: number;
  ok: number;
  failed: number;
}> {
  if (!mailConfig()) {
    logger.warn("weekly-digest: omitido (falta UNSUBSCRIBE_SECRET o NEXT_PUBLIC_APP_URL)");
    return { total: 0, ok: 0, failed: 0 };
  }
  const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
  const admin = createServiceRoleClient();
  const { data: users } = await admin.from("profiles").select("id");
  const ids = (users ?? []).map((u) => u.id);
  return runForUsersBestEffort(ids, (id) =>
    sendWeeklyDigestForUser(id, { db: admin, userId: id }),
  );
}

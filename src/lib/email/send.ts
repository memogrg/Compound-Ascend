import "server-only";

/**
 * Envío de email con dos vías, gateadas por entorno (si no hay ninguna, se OMITE
 * con gracia, igual que los proveedores de market-data/IA):
 *
 *  1) SMTP de Google Workspace / Gmail (recomendada): define SMTP_HOST,
 *     SMTP_USER y SMTP_PASS (App Password). Opcional SMTP_PORT (465 por defecto)
 *     y EMAIL_FROM (si no, se usa SMTP_USER).
 *  2) Resend: define RESEND_API_KEY y EMAIL_FROM.
 */
import nodemailer from "nodemailer";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

type Env = ReturnType<typeof getServerEnv>;
export type SendResult = { ok: boolean; skipped?: boolean; error?: string };
export type SendParams = { to: string; subject: string; html: string; replyTo?: string };

const TIMEOUT_MS = 10000;

function smtpConfigured(env: Env): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}
function resendConfigured(env: Env): boolean {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}
function fromAddress(env: Env): string {
  return env.EMAIL_FROM || env.SMTP_USER || "";
}

export function isEmailConfigured(): boolean {
  const env = getServerEnv();
  return smtpConfigured(env) || resendConfigured(env);
}

/** Proveedor de email activo según el entorno (sin exponer secretos). */
export function emailProviderName(): "smtp" | "resend" | null {
  const env = getServerEnv();
  if (smtpConfigured(env)) return "smtp";
  if (resendConfigured(env)) return "resend";
  return null;
}

/**
 * Verifica la conexión/credenciales SMTP (handshake + auth) SIN enviar correo.
 * Útil para diagnosticar la configuración. Resend no expone verify → se asume OK.
 */
export async function verifyEmailConnection(): Promise<SendResult> {
  const env = getServerEnv();
  if (smtpConfigured(env)) {
    const port = Number(env.SMTP_PORT ?? "465") || 465;
    try {
      const transporter = nodemailer.createTransport({
        host: env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
        connectionTimeout: TIMEOUT_MS,
        greetingTimeout: TIMEOUT_MS,
      });
      await transporter.verify();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "error desconocido" };
    }
  }
  if (resendConfigured(env)) return { ok: true };
  return { ok: false, skipped: true };
}

export async function sendEmail(params: SendParams): Promise<SendResult> {
  const env = getServerEnv();
  if (smtpConfigured(env)) return sendViaSmtp(env, params);
  if (resendConfigured(env)) return sendViaResend(env, params);
  logger.info("email: omitido (proveedor no configurado)");
  return { ok: false, skipped: true };
}

/** Google Workspace / Gmail (u otro SMTP). */
async function sendViaSmtp(env: Env, params: SendParams): Promise<SendResult> {
  const port = Number(env.SMTP_PORT ?? "465") || 465;
  try {
    const transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      secure: port === 465, // 465 = SSL directo; 587 = STARTTLS
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
    });
    await transporter.sendMail({
      from: fromAddress(env),
      to: params.to,
      subject: params.subject,
      html: params.html,
      ...(params.replyTo ? { replyTo: params.replyTo } : {}),
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "?";
    logger.error("email(smtp): fallo al enviar", { message });
    return { ok: false, error: message };
  }
}

/** Resend (alternativa). */
async function sendViaResend(env: Env, params: SendParams): Promise<SendResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress(env),
        to: params.to,
        subject: params.subject,
        html: params.html,
        ...(params.replyTo ? { reply_to: params.replyTo } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.warn("email(resend): respuesta no OK", { status: res.status });
      return { ok: false, error: `status ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    logger.error("email(resend): fallo de red", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, error: "network" };
  } finally {
    clearTimeout(timer);
  }
}

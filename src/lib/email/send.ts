import "server-only";

/**
 * Envío de email vía Resend (https://resend.com). Gateado por entorno: si no hay
 * RESEND_API_KEY o EMAIL_FROM, el envío se OMITE con gracia (no rompe el flujo),
 * igual que los proveedores de market-data/IA. Para activarlo, define ambas
 * variables en el entorno del servidor.
 */
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export type SendResult = { ok: boolean; skipped?: boolean; error?: string };

const TIMEOUT_MS = 8000;

export function isEmailConfigured(): boolean {
  const env = getServerEnv();
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<SendResult> {
  const env = getServerEnv();
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    logger.info("email: omitido (proveedor no configurado)", { to: params.to.length });
    return { ok: false, skipped: true };
  }

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
        from: env.EMAIL_FROM,
        to: params.to,
        subject: params.subject,
        html: params.html,
        ...(params.replyTo ? { reply_to: params.replyTo } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      logger.warn("email: respuesta no OK de Resend", { status: res.status });
      return { ok: false, error: `status ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    logger.error("email: fallo de red al enviar", {
      message: err instanceof Error ? err.message : "?",
    });
    return { ok: false, error: "network" };
  } finally {
    clearTimeout(timer);
  }
}

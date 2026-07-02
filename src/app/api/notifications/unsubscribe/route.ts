/**
 * GET /api/notifications/unsubscribe?token=… — baja pública de un canal por enlace.
 * Stateless: el token HMAC codifica {userId, channel}. Verifica firma y SOLO apaga
 * esa clave para ese userId (service-role). Sin sesión, sin PII en la URL. Token
 * inválido/manipulado → rechazo limpio. Si falta UNSUBSCRIBE_SECRET, degrada con
 * un error controlado (no crashea).
 */
import { getServerEnv } from "@/lib/env";
import { verifyUnsubscribeToken } from "@/lib/notifications/unsubscribe-token";
import { setNotificationChannel, type NotificationChannel } from "@/lib/notifications/preferences";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  email: "correos",
  whatsapp: "WhatsApp",
  push: "notificaciones push",
  inApp: "avisos en la app",
};

function page(title: string, message: string, status: number): Response {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${title} · CARTERA+</title>
<style>body{font-family:system-ui,sans-serif;background:#0f1115;color:#e8eaed;display:grid;place-items:center;min-height:100vh;margin:0}
.card{max-width:420px;padding:32px;background:#171a21;border:1px solid #262b36;border-radius:16px;text-align:center}
h1{font-size:18px;margin:0 0 10px}p{font-size:14px;line-height:1.55;color:#aab1bd;margin:0}</style>
</head><body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function GET(req: Request): Promise<Response> {
  const secret = getServerEnv().UNSUBSCRIBE_SECRET;
  if (!secret) {
    // Degradación controlada: no se puede verificar sin secret.
    return page("No disponible", "La baja por enlace no está disponible ahora mismo.", 503);
  }

  const token = new URL(req.url).searchParams.get("token") ?? "";
  const payload = verifyUnsubscribeToken(token, secret);
  if (!payload) {
    return page("Enlace inválido", "Este enlace de baja no es válido o expiró.", 400);
  }

  try {
    const { createServiceRoleClient } = await import("@/lib/supabase/service-role");
    const db = createServiceRoleClient();
    // SOLO apaga el canal del token, para el userId del token. Nada más.
    await setNotificationChannel(payload.userId, payload.channel, false, {
      db,
      userId: payload.userId,
    });
    return page(
      "Listo, te diste de baja",
      `Ya no recibirás ${CHANNEL_LABEL[payload.channel]}. Puedes reactivarlos cuando quieras desde Configuración.`,
      200,
    );
  } catch (err) {
    logger.error("unsubscribe fallido", { message: err instanceof Error ? err.message : "?" });
    return page("Algo salió mal", "No pudimos procesar tu baja. Intenta más tarde.", 500);
  }
}

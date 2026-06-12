/**
 * Webhook de WhatsApp (Twilio). Trata el cuerpo como NO confiable: valida primero
 * la firma X-Twilio-Signature. Responde 200 rápido a Twilio; la respuesta al
 * usuario se envía por el provider (no en el body HTTP). No registra el contenido
 * del mensaje (puede contener montos).
 */
import { NextResponse } from "next/server";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { verifyTwilioSignature } from "@/lib/whatsapp/twilio-signature";
import { getWhatsAppProvider } from "@/lib/whatsapp";
import { routeInbound } from "@/lib/whatsapp/router";

export const runtime = "nodejs";

function webhookUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base}/api/whatsapp/webhook`;
}

/** Twilio no hace GET; respondemos 200 para healthchecks. */
export async function GET(): Promise<Response> {
  return new NextResponse("ok", { status: 200 });
}

export async function POST(request: Request): Promise<Response> {
  const rl = await rateLimit(`webhook:wa:${clientIp(request)}`, RATE_LIMITS.webhook);
  if (!rl.ok) return new NextResponse("rate limited", { status: 429 });

  const token = getServerEnv().TWILIO_AUTH_TOKEN;
  if (!token) {
    logger.warn("whatsapp webhook: TWILIO_AUTH_TOKEN ausente");
    return new NextResponse("not configured", { status: 503 });
  }

  // Form-encoded de Twilio.
  const rawBody = await request.text();
  const form = new URLSearchParams(rawBody);
  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) params[k] = v;

  // 1) Validar firma ANTES de confiar en nada del cuerpo.
  const signature = request.headers.get("x-twilio-signature");
  if (!verifyTwilioSignature(token, signature, webhookUrl(), params)) {
    logger.warn("whatsapp webhook: firma inválida");
    return new NextResponse("forbidden", { status: 403 });
  }

  // 2) Parsear campos de Twilio.
  const phone = (params.From ?? "").replace(/^whatsapp:/, "").trim();
  const body = (params.Body ?? "").trim();
  const numMedia = Number(params.NumMedia ?? "0") || 0;
  const mediaUrl = params.MediaUrl0 ?? null;
  const mediaType = params.MediaContentType0 ?? null;

  if (!phone) return new NextResponse("ok", { status: 200 });

  // 3) Enrutar. Cualquier error se traga: siempre 200 a Twilio.
  try {
    await routeInbound(getWhatsAppProvider(), { phone, body, numMedia, mediaUrl, mediaType });
  } catch (err) {
    logger.error("whatsapp webhook: fallo en ruteo", {
      message: err instanceof Error ? err.message : "?",
    });
  }

  return new NextResponse("ok", { status: 200 });
}

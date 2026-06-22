/**
 * Webhook de WhatsApp (Meta Cloud API). Trata el cuerpo como NO confiable: valida
 * primero la firma X-Hub-Signature-256. Responde 200 rápido a Meta; la respuesta
 * al usuario se envía por el provider (no en el body HTTP). No registra el
 * contenido del mensaje (puede contener montos).
 */
import { NextResponse } from "next/server";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { verifyMetaSignature } from "@/lib/whatsapp/meta-signature";
import { getWhatsAppProvider } from "@/lib/whatsapp";
import { routeInbound } from "@/lib/whatsapp/router";

export const runtime = "nodejs";

/** Verificación del webhook de Meta: responde el hub.challenge si el token coincide. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const verify = getServerEnv().WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && verify && token === verify && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }
  return new NextResponse("ok", { status: 200 });
}

type MetaWebhook = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from?: string;
          type?: string;
          text?: { body?: string };
          image?: { id?: string; mime_type?: string };
          interactive?: { button_reply?: { id?: string }; list_reply?: { id?: string } };
          button?: { text?: string };
        }>;
      };
    }>;
  }>;
};

export async function POST(request: Request): Promise<Response> {
  const rl = await rateLimit(`webhook:wa:${clientIp(request)}`, RATE_LIMITS.webhook);
  if (!rl.ok) return new NextResponse("rate limited", { status: 429 });

  const appSecret = getServerEnv().WHATSAPP_APP_SECRET;
  if (!appSecret) {
    logger.warn("whatsapp webhook: WHATSAPP_APP_SECRET ausente");
    return new NextResponse("not configured", { status: 503 });
  }

  const rawBody = await request.text();

  // 1) Firma X-Hub-Signature-256 ANTES de confiar en el cuerpo.
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyMetaSignature(appSecret, signature, rawBody)) {
    logger.warn("whatsapp webhook: firma inválida");
    return new NextResponse("forbidden", { status: 403 });
  }

  // 2) Parsear payload de Meta.
  let payload: MetaWebhook;
  try {
    payload = JSON.parse(rawBody) as MetaWebhook;
  } catch {
    return new NextResponse("ok", { status: 200 });
  }

  const msg = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg) return new NextResponse("ok", { status: 200 }); // statuses u otros eventos

  const phone = msg.from ? `+${msg.from}` : "";
  let body = "";
  let numMedia = 0;
  let mediaUrl: string | null = null; // en Meta = media_id
  let mediaType: string | null = null;

  if (msg.type === "text") {
    body = msg.text?.body?.trim() ?? "";
  } else if (msg.type === "image") {
    numMedia = 1;
    mediaUrl = msg.image?.id ?? null;
    mediaType = msg.image?.mime_type ?? null;
  } else if (msg.type === "interactive") {
    body = (msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id ?? "").trim();
  } else if (msg.type === "button") {
    body = msg.button?.text?.trim() ?? "";
  }

  if (!phone) return new NextResponse("ok", { status: 200 });

  // 3) Enrutar. Cualquier error se traga: siempre 200 a Meta.
  try {
    await routeInbound(getWhatsAppProvider(), { phone, body, numMedia, mediaUrl, mediaType });
  } catch (err) {
    logger.error("whatsapp webhook: fallo en ruteo", {
      message: err instanceof Error ? err.message : "?",
    });
  }

  return new NextResponse("ok", { status: 200 });
}

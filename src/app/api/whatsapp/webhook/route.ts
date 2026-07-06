/**
 * Webhook de WhatsApp (Meta Cloud API). Trata el cuerpo como NO confiable: valida
 * primero la firma X-Hub-Signature-256. Responde 200 rápido a Meta; la respuesta
 * al usuario se envía por el provider (no en el body HTTP). No registra el
 * contenido del mensaje (puede contener montos).
 */
import { after, NextResponse } from "next/server";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { verifyMetaSignature } from "@/lib/whatsapp/meta-signature";
import { getWhatsAppProvider } from "@/lib/whatsapp";
import { routeInbound } from "@/lib/whatsapp/router";
import { alreadyProcessed } from "@/lib/security/idempotency";

export const runtime = "nodejs";
// El chat (contexto + embedding de la Biblia + tool-loop de gemini-3.5-flash) puede
// tardar. Sin maxDuration, Vercel mata la función en el default y el usuario queda en
// silencio. 60s da margen de sobra (Fluid Compute / plan Pro lo permiten).
export const maxDuration = 60;

// Aviso corto para NUNCA dejar al usuario sin respuesta si el proceso falla o se acerca
// al límite de tiempo. Reintentar desde su lado es seguro (la marca de idempotencia es
// por evento de Meta, no por intento del usuario).
const BUSY_FALLBACK = "Dame un momento… no pude procesarlo ahora, probá de nuevo en un ratito.";
// Margen bajo maxDuration (60s): si el ruteo no termina a tiempo, avisamos en vez de que
// Vercel mate la función a mitad de un envío (silencio). Deja ~10s para el aviso.
const PROCESS_BUDGET_MS = 50_000;

/** Rechaza si `p` no resuelve en `ms` (no cancela `p`; solo deja de esperarlo). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("process timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

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
          id?: string;
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

  // 2.5) Idempotencia: Meta reenvía webhooks. Reclama el evento por su id (wamid)
  // ANTES de rutear; si ya se procesó, responde 200 sin re-disparar IA/inserts.
  if (msg.id && (await alreadyProcessed("whatsapp", msg.id))) {
    return new NextResponse("ok", { status: 200 });
  }

  // 3) Ack inmediato + proceso en segundo plano. Respondemos 200 a Meta YA (así no
  // reintenta por timeout) y ruteamos DESPUÉS con after() (Next 15), dentro del
  // presupuesto de maxDuration. La marca de idempotencia (arriba) queda ANTES del
  // after(): un reintento de Meta se deduplica y no duplica IA/inserts.
  after(async () => {
    const provider = getWhatsAppProvider();
    try {
      await withTimeout(
        routeInbound(provider, { phone, body, numMedia, mediaUrl, mediaType }),
        PROCESS_BUDGET_MS,
      );
    } catch (err) {
      // NUNCA silencio: si el ruteo falla o se acerca al límite, avisamos al usuario
      // en vez de dejarlo sin respuesta. El envío del aviso va en su propio try.
      logger.error("whatsapp webhook: fallo/timeout en ruteo", {
        message: err instanceof Error ? err.message : "?",
      });
      try {
        await provider.sendText(phone, BUSY_FALLBACK);
      } catch (sendErr) {
        logger.error("whatsapp webhook: no se pudo enviar el aviso de reintento", {
          message: sendErr instanceof Error ? sendErr.message : "?",
        });
      }
    }
  });

  return new NextResponse("ok", { status: 200 });
}

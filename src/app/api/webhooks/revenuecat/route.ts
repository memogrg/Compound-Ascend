/**
 * POST /api/webhooks/revenuecat — suscripciones compradas en App Store / Google Play.
 *
 * RevenueCat valida la compra con la tienda y nos manda el evento. No firma el cuerpo: manda
 * en `Authorization` el valor que se configuró en su dashboard, y acá se compara con
 * `REVENUECAT_WEBHOOK_SECRET` en tiempo constante. Las reglas de negocio viven en
 * `store-fulfillment.ts`, igual que las de Stripe en `stripe-fulfillment.ts`.
 *
 * Todo lo que no es un error nuestro responde 200: RevenueCat reintenta lo demás, y un evento
 * que no sabemos aplicar no va a aprender a aplicarse por reintentarlo.
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { toSafeResponse, AppError } from "@/lib/errors";
import { alreadyProcessed } from "@/lib/security/idempotency";
import {
  manejarEventoTienda,
  transferirTienda,
  usuarioDeTienda,
} from "@/modules/account/services/store-fulfillment";

export const runtime = "nodejs";

const textoONulo = z.string().nullish();

const cuerpoSchema = z.object({
  api_version: z.string(),
  event: z.object({
    id: z.string().min(1),
    type: z.string().min(1),
    // TRANSFER no trae app_user_id: trae transferred_from / transferred_to.
    app_user_id: textoONulo,
    original_app_user_id: textoONulo,
    product_id: textoONulo,
    new_product_id: textoONulo,
    entitlement_ids: z.array(z.string()).nullish(),
    expiration_at_ms: z.number().nullish(),
    store: textoONulo,
    environment: textoONulo,
    period_type: textoONulo,
    transferred_from: z.array(z.string()).nullish(),
    transferred_to: z.array(z.string()).nullish(),
  }),
});

function autorizado(header: string | null, secreto: string): boolean {
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(secreto);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  try {
    const rl = await rateLimit(`webhook:revenuecat:${clientIp(req)}`, RATE_LIMITS.webhook);
    if (!rl.ok) throw new AppError("RATE_LIMITED");

    const secreto = process.env.REVENUECAT_WEBHOOK_SECRET;
    if (!secreto) {
      logger.error("webhook revenuecat: REVENUECAT_WEBHOOK_SECRET no configurado");
      return NextResponse.json({ ok: false, error: "no configurado" }, { status: 503 });
    }
    if (!autorizado(req.headers.get("authorization"), secreto)) {
      logger.warn("webhook revenuecat: autorización inválida");
      throw new AppError("FORBIDDEN", "Autorización inválida.");
    }

    let json: unknown;
    try {
      json = await req.json();
    } catch {
      throw new AppError("VALIDATION", "Cuerpo inválido.");
    }
    const parsed = cuerpoSchema.safeParse(json);
    if (!parsed.success) throw new AppError("VALIDATION", "Evento inválido.");
    const ev = parsed.data.event;

    if (ev.environment === "SANDBOX" && process.env.REVENUECAT_ACCEPT_SANDBOX !== "1") {
      return NextResponse.json({ ok: true, ignored: "sandbox" });
    }

    // RevenueCat reintenta; un reintento no puede volver a aplicar el cambio.
    if (await alreadyProcessed("revenuecat", ev.id)) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    if (ev.type === "TEST") return NextResponse.json({ ok: true, status: "ok" });

    if (ev.type === "TRANSFER") {
      const r = await transferirTienda(ev);
      return NextResponse.json({ ok: true, ...r });
    }

    const userId = await usuarioDeTienda(ev.app_user_id, ev.original_app_user_id);
    if (!userId) {
      logger.warn("webhook revenuecat: evento sin cuenta", { tipo: ev.type });
      return NextResponse.json({ ok: true, status: "ignored", motivo: "sin cuenta" });
    }

    const r = await manejarEventoTienda(ev, userId);
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    if (!(err instanceof AppError)) {
      logger.error("webhook revenuecat: error inesperado", {
        message: err instanceof Error ? err.message : "?",
      });
    }
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status });
  }
}

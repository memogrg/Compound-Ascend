/**
 * POST /api/webhooks/payment — cambios de plan verificados.
 *
 * Es la ÚNICA vía para cambiar `profiles.plan`: el cliente no puede (RLS + trigger
 * lo bloquean). Se verifica la firma HMAC del proveedor de pagos y se actualiza
 * con service-role. Scaffold genérico (adáptalo al proveedor real: Stripe, etc.).
 */
import { NextResponse } from "next/server";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { z } from "zod";
import { verifySignature } from "@/lib/security/webhook";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { toSafeResponse, AppError } from "@/lib/errors";
import { alreadyProcessed } from "@/lib/security/idempotency";

export const runtime = "nodejs";

const eventSchema = z.object({
  type: z.literal("plan.updated"),
  // id del evento del proveedor (Stripe, etc.) para idempotencia. Opcional
  // mientras el scaffold no esté conectado a un PSP real.
  id: z.string().min(1).optional(),
  userId: z.string().uuid(),
  plan: z.enum(["free", "premium"]),
});

export async function POST(req: Request) {
  try {
    const rl = await rateLimit(`webhook:pay:${clientIp(req)}`, RATE_LIMITS.webhook);
    if (!rl.ok) throw new AppError("RATE_LIMITED");

    const secret = getServerEnv().PAYMENT_WEBHOOK_SECRET;
    if (!secret) throw new AppError("INTERNAL", undefined, "PAYMENT_WEBHOOK_SECRET ausente");

    const raw = await req.text();
    const signature = req.headers.get("x-signature");
    if (!verifySignature(raw, signature, secret)) {
      logger.warn("webhook: firma inválida");
      throw new AppError("FORBIDDEN", "Firma inválida.");
    }

    const parsed = eventSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) throw new AppError("VALIDATION", "Evento no soportado.");

    // Idempotencia: si el proveedor manda un id de evento y ya se procesó, no
    // se re-aplica (un reenvío no vuelve a tocar el plan).
    if (parsed.data.id && (await alreadyProcessed("payment", parsed.data.id))) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from("profiles")
      .update({ plan: parsed.data.plan })
      .eq("id", parsed.data.userId);
    if (error) throw new AppError("INTERNAL", undefined, error.message);

    logger.info("webhook: plan actualizado", { plan: parsed.data.plan });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status });
  }
}

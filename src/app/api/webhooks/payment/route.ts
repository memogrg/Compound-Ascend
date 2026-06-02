/**
 * POST /api/webhooks/payment — cambios de plan verificados.
 *
 * Es la ÚNICA vía para cambiar `profiles.plan`: el cliente no puede (RLS + trigger
 * lo bloquean). Se verifica la firma HMAC del proveedor de pagos y se actualiza
 * con service-role. Scaffold genérico (adáptalo al proveedor real: Stripe, etc.).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifySignature } from "@/lib/security/webhook";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { toSafeResponse, AppError } from "@/lib/errors";

export const runtime = "nodejs";

const eventSchema = z.object({
  type: z.literal("plan.updated"),
  userId: z.string().uuid(),
  plan: z.enum(["free", "premium"]),
});

export async function POST(req: Request) {
  try {
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

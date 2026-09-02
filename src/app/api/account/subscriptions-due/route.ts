/**
 * GET/POST /api/account/subscriptions-due
 * Aplica los cambios de plan cuya fecha ya venció: las bajadas programadas
 * entran acá, junto con la orfandad que arrastran. Cron diario.
 *
 * Acceso: SOLO cron (mismo patrón que /api/goals/period-reset):
 *  - Header X-Cron-Secret = CRON_SECRET, o
 *  - Authorization: Bearer <CRON_SECRET> (el que añade Vercel Cron).
 */
import { NextResponse } from "next/server";
import { corsHeaders } from "@/lib/security/cors";
import { toSafeResponse, AppError } from "@/lib/errors";

export const runtime = "nodejs";

function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("x-cron-secret") === secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  try {
    if (!isCronRequest(req)) throw new AppError("UNAUTHORIZED");

    const { aplicarCambiosVencidos } =
      await import("@/modules/account/services/subscription-service");
    const { aplicados, huerfanos } = await aplicarCambiosVencidos();

    return NextResponse.json({ ok: true, aplicados, huerfanos }, { headers: cors });
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status, headers: cors });
  }
}

export function GET(req: Request) {
  return handle(req);
}

export function POST(req: Request) {
  return handle(req);
}

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

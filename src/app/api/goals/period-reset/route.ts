/**
 * GET/POST /api/goals/period-reset
 * Reinicia los frascos de ahorro recurrentes vencidos (marchamo anual, ropa del
 * año, …): restaura target_amount al plan del período, arrastra el sobrante y
 * avanza next_reset_on. Cron diario.
 *
 * Acceso: SOLO cron (mismo patrón que /api/debts/reminders):
 *  - Header X-Cron-Secret = CRON_SECRET, o
 *  - Authorization: Bearer <CRON_SECRET> (el que añade Vercel Cron).
 *
 * Usa service-role (recorre metas de todos los usuarios). Tolera fallos por meta.
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

    const { rollDueGoalPeriods } = await import("@/modules/control/services/goal-reset-service");
    const { reset } = await rollDueGoalPeriods();

    return NextResponse.json({ ok: true, reset }, { headers: cors });
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

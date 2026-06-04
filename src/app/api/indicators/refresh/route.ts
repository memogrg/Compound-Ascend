/**
 * GET/POST /api/indicators/refresh
 * Refresca el catálogo de indicadores económicos (BCCR + FRED) y hace upsert
 * del histórico en economic_indicators.
 *
 * Acceso: SOLO cron. Se autentica de dos formas equivalentes:
 *  - Header X-Cron-Secret = CRON_SECRET (igual que /api/investments/snapshot).
 *  - Header Authorization: Bearer <CRON_SECRET> (el que añade Vercel Cron Jobs,
 *    que disparan un GET cuando CRON_SECRET está configurado).
 *
 * La escritura usa service-role; no se expone a usuarios para evitar disparar
 * consultas externas a demanda. Tolera fallos por indicador.
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

    const { refreshAllIndicators } = await import("@/lib/economic-indicators");
    const results = await refreshAllIndicators();

    const ingested = results.filter((r) => r.ok).reduce((s, r) => s + r.count, 0);
    const failed = results.filter((r) => !r.ok);

    return NextResponse.json(
      { ok: true, ingested, results, failed: failed.length },
      { headers: cors },
    );
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

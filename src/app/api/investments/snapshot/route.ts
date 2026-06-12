/**
 * POST /api/investments/snapshot
 * Genera y almacena un snapshot del portafolio para el día de hoy.
 *
 * Modos de acceso:
 *  - Con header X-Cron-Secret: llamada desde cron (no requiere sesión).
 *    Body opcional: { userId: string } para generar para un usuario específico.
 *  - Sin header de cron: requiere sesión autenticada; genera para el usuario activo.
 */
import { NextResponse } from "next/server";
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import { corsHeaders } from "@/lib/security/cors";
import { toSafeResponse, AppError } from "@/lib/errors";

export const runtime = "nodejs";

function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("x-cron-secret") === secret;
}

export async function POST(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  try {
    if (!isSupabaseConfigured())
      throw new AppError("INTERNAL", undefined, "Supabase no configurado");

    let userId: string;

    if (isCronRequest(req)) {
      // Llamada de cron: usuario en el body o devuelve error.
      const body = (await req.json().catch(() => ({}))) as { userId?: string };
      if (!body.userId) throw new AppError("VALIDATION", "Falta userId en el body del cron.");
      userId = body.userId;
    } else {
      const user = await getUser();
      if (!user) throw new AppError("UNAUTHORIZED");
      userId = user.id;
    }

    // Importaciones dinámicas para no cargar toda la cadena en cold start.
    const { getPortfolioReport } = await import("@/modules/wealth/services/portfolio-service");
    const { getRichLifeSummary } = await import("@/modules/rich-life/services/rich-life-service");
    const { generateAndSaveSnapshot } = await import("@/modules/wealth/services/snapshot-service");

    const [report, richLife] = await Promise.all([getPortfolioReport(), getRichLifeSummary()]);

    const snapshot = await generateAndSaveSnapshot(
      userId,
      report.analytics.totalPortfolioValue,
      report.analytics.totalCostBasis,
      richLife.snapshot.indicators.netWorth,
      report.currency,
    );

    return NextResponse.json({ ok: true, snapshot }, { headers: cors });
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status, headers: cors });
  }
}

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

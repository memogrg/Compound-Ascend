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
import { z } from "zod";
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import { corsHeaders } from "@/lib/security/cors";
import { toSafeResponse, AppError } from "@/lib/errors";

export const runtime = "nodejs";

function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("x-cron-secret") === secret) return true;
  // Vercel Cron manda el secret como Bearer (mismo patrón que /api/base/snapshot).
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  try {
    if (!isSupabaseConfigured())
      throw new AppError("INTERNAL", undefined, "Supabase no configurado");

    if (isCronRequest(req)) {
      // Modo cron (sin sesión): el camino con getPortfolioReport/getRichLifeSummary
      // hacía requireUser() y fallaba siempre; el snapshot se calcula con la
      // variante service-role del servicio.
      const body = (await req.json().catch(() => ({}))) as { userId?: string };
      const parsed = z.string().uuid().safeParse(body.userId);
      if (!parsed.success)
        throw new AppError("VALIDATION", "userId inválido o ausente en el body del cron.");

      const { generateSnapshotForUserCron } = await import(
        "@/modules/wealth/services/snapshot-service"
      );
      const snapshot = await generateSnapshotForUserCron(parsed.data);
      return NextResponse.json({ ok: true, mode: "cron", snapshot }, { headers: cors });
    }

    const user = await getUser();
    if (!user) throw new AppError("UNAUTHORIZED");

    // Importaciones dinámicas para no cargar toda la cadena en cold start.
    const { getPortfolioReport } = await import("@/modules/wealth/services/portfolio-service");
    const { getRichLifeSummary } = await import("@/modules/rich-life/services/rich-life-service");
    const { generateAndSaveSnapshot } = await import("@/modules/wealth/services/snapshot-service");

    const [report, richLife] = await Promise.all([getPortfolioReport(), getRichLifeSummary()]);

    const snapshot = await generateAndSaveSnapshot(
      user.id,
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

/**
 * GET /api/investments/portfolio
 * Analíticas completas del portafolio de inversiones para el usuario autenticado.
 * Rate-limited por usuario.
 */
import { NextResponse } from "next/server";
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { corsHeaders } from "@/lib/security/cors";
import { toSafeResponse, AppError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  try {
    const user = await getUser();
    if (!user || !isSupabaseConfigured()) throw new AppError("UNAUTHORIZED");

    const rl = await rateLimit(`portfolio:${user.id}`, RATE_LIMITS.default);
    if (!rl.ok) throw new AppError("RATE_LIMITED");

    const { getPortfolioReport } = await import(
      "@/modules/wealth/services/portfolio-service"
    );
    const { getSnapshotHistory } = await import(
      "@/modules/wealth/services/snapshot-service"
    );
    const { getInvestmentInsights } = await import(
      "@/modules/wealth/services/investment-insights"
    );

    const [report, snapshots, insights] = await Promise.all([
      getPortfolioReport(),
      getSnapshotHistory("1Y"),
      getInvestmentInsights(),
    ]);

    return NextResponse.json(
      { ...report, snapshots, insights },
      { headers: { ...cors, "Cache-Control": "private, max-age=30" } },
    );
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status, headers: cors });
  }
}

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

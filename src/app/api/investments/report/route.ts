/**
 * /api/investments/report — informe DETERMINISTA del portafolio (carril "deep", Etapa A).
 *  - POST: genera el informe (paquete de evidencia + plantilla) y lo persiste (best-effort).
 *  - GET:  devuelve el último informe guardado del usuario.
 *
 * Cero tokens de LLM: la respuesta se arma con las cifras del motor/contexto. Autenticado,
 * rate-limited y con origen verificado, igual que el resto de /api/investments.
 */
import { NextResponse } from "next/server";
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { assertTrustedOrigin, corsHeaders } from "@/lib/security/cors";
import { toSafeResponse, AppError } from "@/lib/errors";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  try {
    if (!assertTrustedOrigin(req)) throw new AppError("FORBIDDEN", "Origen no permitido.");

    const user = await getUser();
    if (!user || !isSupabaseConfigured()) throw new AppError("UNAUTHORIZED");

    const rl = await rateLimit(`investment-report:${user.id}`, RATE_LIMITS.default);
    if (!rl.ok) throw new AppError("RATE_LIMITED");

    const { generateInvestmentReport } = await import("@/lib/ai/investment-report");
    const report = await generateInvestmentReport();

    return NextResponse.json(report, { headers: cors });
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status, headers: cors });
  }
}

export async function GET(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  try {
    const user = await getUser();
    if (!user || !isSupabaseConfigured()) throw new AppError("UNAUTHORIZED");

    const rl = await rateLimit(`investment-report:${user.id}`, RATE_LIMITS.default);
    if (!rl.ok) throw new AppError("RATE_LIMITED");

    const { getLatestInvestmentReport } = await import("@/lib/ai/investment-report");
    const report = await getLatestInvestmentReport();

    return NextResponse.json(
      { report },
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

/**
 * Health check — también sirve para verificar que la infra transversal
 * (rate-limit, CORS, manejo de errores) está cableada desde F0.
 */
import { NextResponse } from "next/server";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { corsHeaders } from "@/lib/security/cors";
import { toSafeResponse } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const rl = await rateLimit(`health:${clientIp(req)}`, RATE_LIMITS.default);
    const cors = corsHeaders(req.headers.get("origin"));
    if (!rl.ok) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Demasiadas solicitudes." } },
        { status: 429, headers: cors },
      );
    }
    return NextResponse.json(
      { status: "ok", service: "compound-ascend", ts: new Date().toISOString() },
      { headers: cors },
    );
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status });
  }
}

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

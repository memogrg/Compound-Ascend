/**
 * GET /api/market-price/search?q=spy
 * Búsqueda de símbolos (cacheada). Rate-limited por IP.
 */
import { NextResponse } from "next/server";
import { searchSymbols } from "@/lib/market-data";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { corsHeaders } from "@/lib/security/cors";
import { toSafeResponse, AppError } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  try {
    const rl = await rateLimit(`market-search:${clientIp(req)}`, RATE_LIMITS.marketData);
    if (!rl.ok) throw new AppError("RATE_LIMITED");

    const q = new URL(req.url).searchParams.get("q") ?? "";
    if (q.trim().length < 1) throw new AppError("VALIDATION", "Escribe algo para buscar.");

    const results = await searchSymbols(q);
    return NextResponse.json({ results }, { headers: cors });
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status, headers: cors });
  }
}

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

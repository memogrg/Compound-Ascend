/**
 * GET /api/market-price?symbol=AAPL&type=stock
 * Precio con cadena de proveedores + cache. Requiere sesión: el endpoint
 * proxyea APIs externas con NUESTROS tokens (Finnhub/AlphaVantage) — sin auth,
 * cualquier anónimo podía quemar la cuota. Rate-limit por usuario.
 */
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth/session";
import { getMarketPrice, isValidSymbol, type AssetType } from "@/lib/market-data";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { corsHeaders } from "@/lib/security/cors";
import { toSafeResponse, AppError } from "@/lib/errors";

export const runtime = "nodejs";
const ASSET_TYPES: AssetType[] = ["stock", "etf", "crypto"];

export async function GET(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  try {
    const user = await getUser();
    if (!user) throw new AppError("UNAUTHORIZED");

    const rl = await rateLimit(`market:user:${user.id}`, RATE_LIMITS.marketData);
    if (!rl.ok) throw new AppError("RATE_LIMITED");

    const url = new URL(req.url);
    const symbol = url.searchParams.get("symbol") ?? "";
    const type = (url.searchParams.get("type") ?? "stock") as AssetType;

    if (!isValidSymbol(symbol)) throw new AppError("VALIDATION", "Símbolo inválido.");
    if (!ASSET_TYPES.includes(type)) throw new AppError("VALIDATION", "Tipo de activo inválido.");

    const price = await getMarketPrice(symbol, type);
    if (!price) throw new AppError("NOT_FOUND", "No encontramos precio para ese símbolo.");

    return NextResponse.json(price, {
      headers: { ...cors, "Cache-Control": "public, max-age=30" },
    });
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status, headers: cors });
  }
}

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

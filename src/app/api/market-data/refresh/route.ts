/**
 * GET/POST /api/market-data/refresh — recolector de datos de mercado. Cron.
 *
 * Junta los símbolos de holdings + price_alerts, trae precio + ATH/máximo en 1-2 llamadas batched
 * (cripto: /coins/markets; acciones: Finnhub) y los GUARDA en market_price_cache. La app/AI/valuación/
 * alertas leen del store — sin pegarle a CoinGecko en vivo por consulta (el fetch en vivo desde
 * serverless fallaba). Best-effort. NO es tiempo real: el dato es tan fresco como el cron.
 *
 * Acceso SOLO cron (patrón /api/debts/reminders): X-Cron-Secret = CRON_SECRET o Authorization:
 * Bearer <CRON_SECRET>. Service-role (recorre todos los usuarios).
 */
import { NextResponse } from "next/server";
import { corsHeaders } from "@/lib/security/cors";
import { cronAuthorized } from "@/lib/security/cron-auth";
import { toSafeResponse, AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const maxDuration = 60;

function isCronRequest(req: Request): boolean {
  return cronAuthorized(
    {
      authorization: req.headers.get("authorization"),
      xCronSecret: req.headers.get("x-cron-secret"),
    },
    process.env.CRON_SECRET,
  );
}

async function handle(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  try {
    if (!isCronRequest(req)) throw new AppError("UNAUTHORIZED");
    const { runCollection } = await import("@/lib/market-data/collector");
    const result = await runCollection();
    return NextResponse.json({ ok: true, ...result }, { headers: cors });
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

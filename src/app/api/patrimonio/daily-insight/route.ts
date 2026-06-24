/**
 * GET/POST /api/patrimonio/daily-insight — ritual diario patrimonial server-side.
 * Por cada usuario: getPatrimonioReportForUser → buildDailyPatrimonioInsight →
 * persiste el insight en user_insights (aparece en "Qué noté"). NO envía por
 * WhatsApp/correo/notificación todavía (eso es 5b-3).
 *
 *  - GET (Vercel Cron): header X-Cron-Secret = CRON_SECRET o Authorization: Bearer
 *    <CRON_SECRET>. Recorre TODOS los usuarios (service-role), best-effort.
 *  - POST con { userId } + el mismo secret: genera para un usuario puntual (pruebas).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { isSupabaseConfigured } from "@/lib/auth/session";
import { corsHeaders } from "@/lib/security/cors";
import { toSafeResponse, AppError } from "@/lib/errors";

export const runtime = "nodejs";

function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("x-cron-secret") === secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  try {
    if (!isSupabaseConfigured())
      throw new AppError("INTERNAL", undefined, "Supabase no configurado");
    if (!isCronRequest(req)) throw new AppError("FORBIDDEN", "Solo cron.");

    const { generateDailyRitualForAllUsers } = await import("@/lib/insights/insights-service");
    const res = await generateDailyRitualForAllUsers();
    return NextResponse.json(
      { ok: true, mode: "cron", total: res.total, processed: res.ok, failed: res.failed },
      { headers: cors },
    );
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status, headers: cors });
  }
}

export async function POST(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  try {
    if (!isSupabaseConfigured())
      throw new AppError("INTERNAL", undefined, "Supabase no configurado");
    if (!isCronRequest(req)) throw new AppError("FORBIDDEN", "Solo cron.");

    const raw = (await req.json().catch(() => ({}))) as { userId?: string };
    const parsed = z.string().uuid().safeParse(raw.userId);
    if (!parsed.success)
      throw new AppError("VALIDATION", "userId inválido o ausente en el body del cron.");

    const { generateDailyRitualForUser } = await import("@/lib/insights/insights-service");
    await generateDailyRitualForUser(parsed.data);
    return NextResponse.json({ ok: true, mode: "cron", userId: parsed.data }, { headers: cors });
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status, headers: cors });
  }
}

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

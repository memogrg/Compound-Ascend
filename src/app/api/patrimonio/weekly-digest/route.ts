/**
 * GET/POST /api/patrimonio/weekly-digest — resumen patrimonial semanal por correo.
 * Por cada usuario con pref `email` ON y correo disponible: getPatrimonioReportForUser
 * → buildWeeklyDigest → sendEmail (con footer de baja por token HMAC). Best-effort.
 *
 *  - GET (Vercel Cron, lunes): X-Cron-Secret = CRON_SECRET o Authorization: Bearer.
 *  - POST con { userId } + el mismo secret: envía a un usuario puntual (pruebas).
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

    const { sendWeeklyDigestForAllUsers } = await import("@/lib/notifications/weekly-email");
    const res = await sendWeeklyDigestForAllUsers();
    return NextResponse.json(
      { ok: true, mode: "cron", total: res.total, sent: res.ok, failed: res.failed },
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

    const { sendWeeklyDigestForUser } = await import("@/lib/notifications/weekly-email");
    await sendWeeklyDigestForUser(parsed.data);
    return NextResponse.json({ ok: true, mode: "cron", userId: parsed.data }, { headers: cors });
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status, headers: cors });
  }
}

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

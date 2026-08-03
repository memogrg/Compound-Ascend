/**
 * GET/POST /api/assistant/chat-retention — limpieza de retención del chat del asesor.
 * Borra de chat_messages todo lo más viejo que CHAT_RETENTION_DAYS (lib/ai/chat-retention),
 * para TODOS los usuarios. Cron diario (vercel.json).
 *
 * Acceso: SOLO cron (mismo patrón que /api/goals/period-reset):
 *  - Header X-Cron-Secret = CRON_SECRET, o
 *  - Authorization: Bearer <CRON_SECRET> (el que añade Vercel Cron).
 *
 * Usa service-role (no hay sesión y recorre a todos los usuarios). IDEMPOTENTE: el borrado es
 * por corte de fecha, así que correrlo dos veces el mismo día no cambia nada la segunda vez.
 */
import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/auth/session";
import { CHAT_RETENTION_DAYS } from "@/lib/ai/chat-retention";
import { corsHeaders } from "@/lib/security/cors";
import { cronAuthorized } from "@/lib/security/cron-auth";
import { toSafeResponse, AppError } from "@/lib/errors";

export const runtime = "nodejs";

async function handle(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  try {
    if (!isSupabaseConfigured())
      throw new AppError("INTERNAL", undefined, "Supabase no configurado");
    const authorized = cronAuthorized(
      {
        authorization: req.headers.get("authorization"),
        xCronSecret: req.headers.get("x-cron-secret"),
      },
      process.env.CRON_SECRET,
    );
    if (!authorized) throw new AppError("FORBIDDEN", "Solo cron.");

    const { purgeExpiredChatMessages } = await import("@/lib/ai/chat-store");
    const deleted = await purgeExpiredChatMessages();

    return NextResponse.json(
      { ok: true, retentionDays: CHAT_RETENTION_DAYS, deleted },
      { headers: cors },
    );
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

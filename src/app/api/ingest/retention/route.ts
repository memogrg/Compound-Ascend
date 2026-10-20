/**
 * GET/POST /api/ingest/retention — limpieza de retención de la ingesta por correo.
 * Borra los correos ingeridos (`ingest_notices`) y las propuestas (`ingest_proposals`) con más
 * de INGEST_RETENTION_DAYS (lib/ingestion/retention), resueltas o no, para TODOS los usuarios.
 * Los movimientos ya creados a partir de una propuesta no se tocan. Cron diario (vercel.json).
 *
 * Acceso: SOLO cron (mismo patrón que /api/assistant/chat-retention):
 *  - Header X-Cron-Secret = CRON_SECRET, o
 *  - Authorization: Bearer <CRON_SECRET> (el que añade Vercel Cron).
 *
 * IDEMPOTENTE: el borrado es por corte de fecha; correrlo dos veces el mismo día no cambia nada.
 */
import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/auth/session";
import { INGEST_RETENTION_DAYS } from "@/lib/ingestion/retention";
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

    const { purgeExpiredIngest } = await import("@/lib/ingestion/retention-service");
    const deleted = await purgeExpiredIngest();

    return NextResponse.json(
      { ok: true, retentionDays: INGEST_RETENTION_DAYS, deleted },
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

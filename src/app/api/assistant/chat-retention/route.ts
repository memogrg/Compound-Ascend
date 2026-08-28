/**
 * GET/POST /api/assistant/chat-retention — limpieza de retención del chat del asesor.
 * Borra de chat_messages todo lo más viejo que CHAT_RETENTION_DAYS (lib/ai/chat-retention),
 * para TODOS los usuarios. Cron diario (vercel.json).
 *
 * ANTES de purgar corre la EXTRACCIÓN DE MEMORIA (lib/ai/memory-extraction): es el único momento
 * en que la conversación del día ya está cerrada y todavía existe. Lo que la persona contó de su
 * vida ("mi esposa se llama Fernanda") pasa a user_memory y sobrevive a la purga; las CIFRAS no
 * se guardan nunca — esas se leen en vivo. La extracción es BEST-EFFORT y NUNCA bloquea la purga:
 * si el extractor se cae, el borrado corre igual (la retención es una promesa al usuario).
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
import { logger } from "@/lib/logger";
import type { ExtractionStats } from "@/lib/ai/memory-extraction";

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

    // 1. Aprender de la conversación del día antes de que desaparezca. Blindado: ni un throw ni
    //    un rechazo pueden impedir el paso 2.
    let memoria: ExtractionStats | null = null;
    try {
      const { extractMemoryForAllUsers } = await import("@/lib/ai/memory-extraction");
      memoria = await extractMemoryForAllUsers();
    } catch (err) {
      logger.warn("chat-retention: extracción de memoria falló (se purga igual)", {
        message: err instanceof Error ? err.message : "?",
      });
    }

    // 2. Purgar. Pase lo que pase arriba.
    const { purgeExpiredChatMessages } = await import("@/lib/ai/chat-store");
    const deleted = await purgeExpiredChatMessages();

    return NextResponse.json(
      { ok: true, retentionDays: CHAT_RETENTION_DAYS, deleted, memoria },
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

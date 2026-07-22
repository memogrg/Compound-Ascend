/**
 * GET/POST /api/profile/review-reminder — recordatorio semestral de revisión del perfil.
 * Por cada usuario cuyo perfil lleva ≥6 meses sin actualizarse, genera un insight en la
 * campana ("revisá tu perfil") reusando user_insights. Idempotente (no re-notifica en la
 * misma ventana) y auto-resuelve al usuario que ya revisó. Sin email/WhatsApp.
 *
 *  - GET (Vercel Cron mensual): header X-Cron-Secret = CRON_SECRET o Authorization: Bearer
 *    <CRON_SECRET>. Recorre TODOS los usuarios (service-role).
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

    const { remindStaleProfiles } = await import("@/lib/insights/profile-review");
    const res = await remindStaleProfiles();
    return NextResponse.json(
      { ok: true, mode: "cron", stale: res.stale, created: res.created, resolved: res.resolved },
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

    const { remindProfileForUser } = await import("@/lib/insights/profile-review");
    const ok = await remindProfileForUser(parsed.data);
    return NextResponse.json({ ok, mode: "cron", userId: parsed.data }, { headers: cors });
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status, headers: cors });
  }
}

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

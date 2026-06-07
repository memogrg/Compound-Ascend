/**
 * GET/POST /api/base/snapshot — genera snapshots mensuales de la Base Financiera
 * para el mes recién cerrado.
 *  - Cron: header X-Cron-Secret = CRON_SECRET, o Authorization: Bearer <CRON_SECRET>
 *    (el que añade Vercel Cron Jobs en su GET). Recorre TODOS los usuarios (service role).
 *  - Sin cron: requiere sesión; genera el del usuario activo.
 */
import { NextResponse } from "next/server";
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";

export const runtime = "nodejs";

function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("x-cron-secret") === secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 500 });
  }

  const { monthPeriod, previousMonthPeriod } = await import("@/modules/financial-base/engine/period");
  const now = new Date();
  const closed = previousMonthPeriod(monthPeriod(now.getFullYear(), now.getMonth() + 1));

  try {
    if (isCronRequest(req)) {
      const { generateSnapshotsForAllUsers } = await import(
        "@/modules/financial-base/services/snapshot-service"
      );
      const res = await generateSnapshotsForAllUsers(closed);
      return NextResponse.json({ ok: true, mode: "cron", period: closed.label, ...res });
    }

    const user = await getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { generateMonthlySnapshot } = await import(
      "@/modules/financial-base/services/snapshot-service"
    );
    await generateMonthlySnapshot(closed);
    return NextResponse.json({ ok: true, mode: "user", period: closed.label });
  } catch {
    return NextResponse.json({ error: "snapshot failed" }, { status: 500 });
  }
}

export function GET(req: Request) {
  return handle(req);
}

export function POST(req: Request) {
  return handle(req);
}

/**
 * POST /api/base/snapshot — genera snapshots mensuales de la Base Financiera
 * para el mes recién cerrado.
 *  - Con header X-Cron-Secret: recorre TODOS los usuarios (service role).
 *  - Sin header: requiere sesión; genera el del usuario activo.
 */
import { NextResponse } from "next/server";
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";

export const runtime = "nodejs";

function isCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && req.headers.get("x-cron-secret") === secret;
}

export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 500 });
  }

  const { monthPeriod, previousMonthPeriod } = await import("@/modules/financial-base/engine/period");
  const now = new Date();
  const closed = previousMonthPeriod(monthPeriod(now.getFullYear(), now.getMonth() + 1));

  try {
    if (isCron(req)) {
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

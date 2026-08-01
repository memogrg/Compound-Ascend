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

  const { monthPeriod, previousMonthPeriod } =
    await import("@/modules/financial-base/engine/period");

  try {
    if (isCronRequest(req)) {
      // Cron (todos los usuarios, sin sesión): el mes cerrado se ancla en UTC — es un
      // job de sistema que corre a una hora fija de UTC, no la vista de un usuario.
      const now = new Date();
      const closed = previousMonthPeriod(monthPeriod(now.getFullYear(), now.getMonth() + 1));
      const { generateSnapshotsForAllUsers } =
        await import("@/modules/financial-base/services/snapshot-service");
      const res = await generateSnapshotsForAllUsers(closed);
      return NextResponse.json({ ok: true, mode: "cron", period: closed.label, ...res });
    }

    const user = await getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    // Usuario autenticado: el "mes cerrado" es el anterior a SU mes actual (su zona).
    const { userCurrentPeriod } = await import("@/lib/time/user-time");
    const closed = previousMonthPeriod(await userCurrentPeriod());
    const { generateMonthlySnapshot } =
      await import("@/modules/financial-base/services/snapshot-service");
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

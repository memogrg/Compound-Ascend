/**
 * GET/POST /api/base/snapshot — genera los snapshots mensuales del mes recién cerrado:
 *  - Base Financiera (`monthly_snapshots`): ingreso/gasto/flujo libre del periodo.
 *  - PATRIMONIO (`net_worth_snapshots`): patrimonio neto del periodo con el motor de
 *    Rich Life (líquido + inversiones + activos − deudas). Antes nadie escribía esa
 *    tabla y el historial de patrimonio no existía.
 *
 *  - Cron: header X-Cron-Secret = CRON_SECRET, o Authorization: Bearer <CRON_SECRET>
 *    (el que añade Vercel Cron Jobs en su GET). Recorre TODOS los usuarios (service role).
 *  - Sin cron: requiere sesión; genera el del usuario activo.
 *
 * El patrimonio es best-effort dentro del handler: si su agregación falla, el snapshot
 * de la base ya quedó escrito y no se pierde la corrida del mes.
 */
import { NextResponse } from "next/server";
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import { now as simNow } from "@/lib/time/clock";

export const runtime = "nodejs";

function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("x-cron-secret") === secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Patrimonio del periodo para TODOS los usuarios. Best-effort: la corrida de la base
 * ya está escrita cuando esto corre, así que un fallo aquí no debe tumbar el endpoint.
 * La composición vive en la ruta (y no dentro de financial-base) para no invertir la
 * dirección de dependencias del repo: rich-life → financial-base, nunca al revés.
 */
async function snapshotPatrimonioAllUsers(periodo: {
  year: number;
  month: number;
}): Promise<{ users: number; written: number } | { error: true }> {
  try {
    const { generateNetWorthSnapshotsForAllUsers } =
      await import("@/modules/rich-life/services/net-worth-snapshot-service");
    return await generateNetWorthSnapshotsForAllUsers(periodo);
  } catch {
    return { error: true };
  }
}

/** Ídem para el usuario en sesión. */
async function snapshotPatrimonioUser(periodo: {
  year: number;
  month: number;
}): Promise<{ written: number } | { error: true }> {
  try {
    const { generateNetWorthSnapshot } =
      await import("@/modules/rich-life/services/net-worth-snapshot-service");
    return { written: (await generateNetWorthSnapshot(periodo)) ? 1 : 0 };
  } catch {
    return { error: true };
  }
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
      const now = simNow();
      const closed = previousMonthPeriod(monthPeriod(now.getFullYear(), now.getMonth() + 1));
      const { generateSnapshotsForAllUsers } =
        await import("@/modules/financial-base/services/snapshot-service");
      const res = await generateSnapshotsForAllUsers(closed);
      const netWorth = await snapshotPatrimonioAllUsers(closed);
      return NextResponse.json({ ok: true, mode: "cron", period: closed.label, ...res, netWorth });
    }

    const user = await getUser();
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    // Usuario autenticado: el "mes cerrado" es el anterior a SU mes actual (su zona).
    const { userCurrentPeriod } = await import("@/lib/time/user-time");
    const closed = previousMonthPeriod(await userCurrentPeriod());
    const { generateMonthlySnapshot } =
      await import("@/modules/financial-base/services/snapshot-service");
    await generateMonthlySnapshot(closed);
    const netWorth = await snapshotPatrimonioUser(closed);
    return NextResponse.json({ ok: true, mode: "user", period: closed.label, netWorth });
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

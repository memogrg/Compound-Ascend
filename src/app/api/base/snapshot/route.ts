/**
 * GET/POST /api/base/snapshot — genera los snapshots mensuales del mes recién cerrado:
 *  - Base Financiera (`monthly_snapshots`): ingreso/gasto/flujo libre del periodo.
 *  - PATRIMONIO (`net_worth_snapshots`): patrimonio neto del periodo con el motor de
 *    Rich Life (líquido + inversiones + activos − deudas). Antes nadie escribía esa
 *    tabla y el historial de patrimonio no existía.
 *
 *  - Cron: header X-Cron-Secret = CRON_SECRET, o Authorization: Bearer <CRON_SECRET>
 *
 * Corre el día 1 a las **12:00 UTC** (antes 06:00). El cron ancla el «mes cerrado» en UTC, y a
 * las 06:00 del día 1 en UTC todavía es el último día del mes anterior en todo el Pacífico
 * (UTC−7 y más al oeste): para esos usuarios el cron cerraba un mes que, en su reloj, no había
 * terminado. A las 12:00 UTC ya es el día 1 hasta UTC−11. Para Costa Rica (UTC−6) las dos horas
 * servían; el cambio es por quien no vive acá.
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

/**
 * Congela las derivadas del mes cerrado para TODOS los usuarios, ANTES de los snapshots.
 *
 * El orden importa: `generateMonthlySnapshot` suma `budget_items` del periodo, así que si las
 * líneas derivadas se materializan después, el snapshot del mes cerrado se guarda sin ellas —el
 * mismo escalón, ahora congelado en la tabla que nadie vuelve a mirar.
 *
 * Best-effort y con el detalle en la respuesta: si esto falla, los snapshots se escriben igual
 * (es lo que ya hacía el cron) y el fallo queda a la vista en el JSON del cron.
 */
async function congelarDerivadasAllUsers(
  periodo: { year: number; month: number; label: string; from: string; to: string },
  simulacro = false,
): Promise<unknown> {
  try {
    const { congelarDerivadasDelPeriodo } =
      await import("@/modules/financial-base/services/derived-budget-service");
    return await congelarDerivadasDelPeriodo(periodo, { simulacro });
  } catch {
    return { error: true };
  }
}

/**
 * `x-dry-run: 1` (con el MISMO `CRON_SECRET`): simulacro. Recorre a todos los usuarios, calcula
 * qué insertaría para el mes recién cerrado y responde SOLO conteos por usuario —id acortado y
 * líneas por `source_kind`—, sin escribir absolutamente nada: ni las derivadas, ni los snapshots.
 *
 * Existe para poder mirar el alcance de un barrido antes de soltarlo sobre la base de
 * producción. Que no escriba no es una promesa del comentario: el caso que lo cubre mira TODAS
 * las escrituras del camino, no solo las de `budget_items`.
 */
function esSimulacro(req: Request): boolean {
  return req.headers.get("x-dry-run") === "1";
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
      // PRIMERO las derivadas del mes cerrado, y solo INSERTANDO: para quien no abrió la app
      // en ese mes, su presupuesto no tenía cuotas, aportes ni primas — y el snapshot que se
      // escribe dos líneas más abajo lo heredaba. Para quien sí la abrió esto no hace nada.
      // Simulacro: se calcula y se responde, sin tocar NADA —tampoco los snapshots, que son
      // escrituras igual de reales que las derivadas.
      if (esSimulacro(req)) {
        const derivadas = await congelarDerivadasAllUsers(closed, true);
        return NextResponse.json({
          ok: true,
          mode: "cron-simulacro",
          period: closed.label,
          derivadas,
        });
      }

      const derivadas = await congelarDerivadasAllUsers(closed);
      const { generateSnapshotsForAllUsers } =
        await import("@/modules/financial-base/services/snapshot-service");
      const res = await generateSnapshotsForAllUsers(closed);
      const netWorth = await snapshotPatrimonioAllUsers(closed);
      return NextResponse.json({
        ok: true,
        mode: "cron",
        period: closed.label,
        derivadas,
        ...res,
        netWorth,
      });
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

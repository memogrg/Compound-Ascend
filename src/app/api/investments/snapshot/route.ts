/**
 * POST /api/investments/snapshot
 * Genera y almacena un snapshot del portafolio para el día de hoy.
 *
 * Modos de acceso:
 *  - Con header X-Cron-Secret (o `Authorization: Bearer`), **sin `userId`**: BARRIDO de todos
 *    los usuarios. Es el modo que usa el cron diario de `vercel.json`, que llega por GET.
 *  - Con header de cron y `{ userId }` en el body: solo ese usuario (para reprocesar uno).
 *  - Sin header de cron: requiere sesión autenticada; genera para el usuario activo.
 *
 * El barrido existe porque la escritura salió de la carga de pantalla: `/m/patrimonio`
 * guardaba el punto de hoy al abrirse, y con eso el gráfico cambiaba de forma entre dos
 * visitas seguidas (nueve de 200 capturas difieren entre dos corridas idénticas) y la serie
 * dependía del hábito de mirarla. Ahora la pantalla solo lee.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser, isSupabaseConfigured } from "@/lib/auth/session";
import { corsHeaders } from "@/lib/security/cors";
import { toSafeResponse, AppError } from "@/lib/errors";

export const runtime = "nodejs";

function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("x-cron-secret") === secret) return true;
  // Vercel Cron manda el secret como Bearer (mismo patrón que /api/base/snapshot).
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  try {
    if (!isSupabaseConfigured())
      throw new AppError("INTERNAL", undefined, "Supabase no configurado");

    if (isCronRequest(req)) {
      // Modo cron (sin sesión): el camino con getPortfolioReport/getRichLifeSummary
      // hacía requireUser() y fallaba siempre; el snapshot se calcula con la
      // variante service-role del servicio.
      const body = (await req.json().catch(() => ({}))) as { userId?: string };

      // Sin `userId` es el barrido. Antes esto era un error de validación, y por eso el cron
      // de Vercel —que llega por GET y sin cuerpo— no podía usar esta ruta: la escritura vivía
      // en la pantalla porque el endpoint solo sabía hacer un usuario a la vez.
      if (body.userId === undefined) {
        const { generatePortfolioSnapshotsForAllUsers } =
          await import("@/modules/wealth/services/snapshot-service");
        const res = await generatePortfolioSnapshotsForAllUsers();
        return NextResponse.json({ ok: true, mode: "cron-todos", ...res }, { headers: cors });
      }

      const parsed = z.string().uuid().safeParse(body.userId);
      if (!parsed.success) throw new AppError("VALIDATION", "userId inválido en el body del cron.");

      const { generateSnapshotForUserCron } =
        await import("@/modules/wealth/services/snapshot-service");
      const snapshot = await generateSnapshotForUserCron(parsed.data);
      return NextResponse.json({ ok: true, mode: "cron", snapshot }, { headers: cors });
    }

    const user = await getUser();
    if (!user) throw new AppError("UNAUTHORIZED");

    // Importaciones dinámicas para no cargar toda la cadena en cold start.
    const { getPortfolioReport } = await import("@/modules/wealth/services/portfolio-service");
    const { getRichLifeSummary } = await import("@/modules/rich-life/services/rich-life-service");
    const { generateAndSaveSnapshot } = await import("@/modules/wealth/services/snapshot-service");

    const [report, richLife] = await Promise.all([getPortfolioReport(), getRichLifeSummary()]);

    const snapshot = await generateAndSaveSnapshot(
      user.id,
      report.analytics.totalPortfolioValue,
      report.analytics.totalCostBasis,
      richLife.snapshot.indicators.netWorth,
      report.currency,
    );

    return NextResponse.json({ ok: true, snapshot }, { headers: cors });
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status, headers: cors });
  }
}

/**
 * GET — SOLO el barrido del cron. El cron de Vercel llega por GET y sin cuerpo.
 *
 * Deliberadamente no atiende el camino con sesión: ese escribe, y un GET que escribe se
 * dispara con una navegación o un prefetch. Sin secreto de cron válido, 401 y nada más.
 */
export async function GET(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  try {
    if (!isSupabaseConfigured())
      throw new AppError("INTERNAL", undefined, "Supabase no configurado");
    if (!isCronRequest(req)) throw new AppError("UNAUTHORIZED");
    const { generatePortfolioSnapshotsForAllUsers } =
      await import("@/modules/wealth/services/snapshot-service");
    const res = await generatePortfolioSnapshotsForAllUsers();
    return NextResponse.json({ ok: true, mode: "cron-todos", ...res }, { headers: cors });
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status, headers: cors });
  }
}

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

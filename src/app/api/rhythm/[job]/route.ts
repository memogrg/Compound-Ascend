/**
 * GET/POST /api/rhythm/{ventana|cierre|diario} — los tres crons del RITMO DEL MES.
 *
 *   · ventana — diario. "Ajustá tus sobres de {mes}" mientras la ventana (días 1-5) esté
 *     abierta para el hogar.
 *   · cierre  — diario. "Cerrá {mes} con todo registrado" del día 28 al último, con la
 *     lista de lo que falta. No escribe si no falta nada.
 *   · diario  — CADA HORA. "¿Tenés algún gasto de hoy?" a quien tenga las 19:00 en la
 *     zona de SU perfil y no haya registrado nada. Correr cada hora es lo que hace que
 *     "las 19:00" sean las de la persona y no las de Vercel (que corre en UTC).
 *
 * Una ruta con segmento dinámico y no tres archivos: los tres comparten autenticación,
 * CORS, manejo de error y forma de respuesta, y lo único que cambia es qué función
 * llaman. Tres copias del mismo envoltorio se desincronizan a la primera corrección.
 *
 * Acceso: SOLO cron, mismo patrón que /api/debts/reminders — header `X-Cron-Secret` o
 * `Authorization: Bearer <CRON_SECRET>` (el que añade Vercel Cron). Sin `CRON_SECRET`
 * configurado nadie entra.
 *
 * Idempotencia: la garantiza `notification_log` con su índice único
 * (user_id, kind, channel, sent_on), no esta ruta. Se puede reinvocar sin miedo.
 *
 * ── QUIÉN LOS DISPARA ───────────────────────────────────────────────────────
 * `ventana` y `cierre` son crons de Vercel (vercel.json), a las 14:00 UTC — 8am en Costa
 * Rica, de mañana para el grueso de los usuarios. Que en otras zonas caiga a otra hora no
 * importa: son avisos de DÍA, no de hora, y el día se resuelve en la zona de cada quien.
 *
 * `diario` NO está en vercel.json: lo dispara un workflow de GitHub Actions
 * (.github/workflows/rhythm-daily-reminder.yml). Este proyecto rechaza el deploy con un
 * cron sub-diario —comprobado: 11 crons diarios despliegan y agregar uno `0 * * * *`
 * falla—, y correr cada hora es justamente lo que hace que "las 19:00" sean las de la
 * persona y no las de Vercel. Mismo arreglo que ya usan price-alerts y email-ingest-poll.
 */
import { NextResponse } from "next/server";
import { corsHeaders } from "@/lib/security/cors";
import { toSafeResponse, AppError } from "@/lib/errors";

export const runtime = "nodejs";

/** Los tres trabajos, por el segmento de la URL. */
const JOBS = ["ventana", "cierre", "diario"] as const;
type Job = (typeof JOBS)[number];

function isJob(v: string): v is Job {
  return (JOBS as readonly string[]).includes(v);
}

function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  if (req.headers.get("x-cron-secret") === secret) return true;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req: Request, ctx: { params: Promise<{ job: string }> }) {
  const cors = corsHeaders(req.headers.get("origin"));
  try {
    if (!isCronRequest(req)) throw new AppError("UNAUTHORIZED");

    const { job } = await ctx.params;
    if (!isJob(job)) throw new AppError("NOT_FOUND");

    const { runVentanaCron, runCierreCron, runRecordatorioDiarioCron } =
      await import("@/lib/rhythm/cron-service");

    const runners: Record<
      Job,
      () => Promise<{ candidates: number; sent: number; skipped: number }>
    > = {
      ventana: runVentanaCron,
      cierre: runCierreCron,
      diario: runRecordatorioDiarioCron,
    };

    const outcome = await runners[job]();
    return NextResponse.json({ ok: true, job, ...outcome }, { headers: cors });
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status, headers: cors });
  }
}

export function GET(req: Request, ctx: { params: Promise<{ job: string }> }) {
  return handle(req, ctx);
}

export function POST(req: Request, ctx: { params: Promise<{ job: string }> }) {
  return handle(req, ctx);
}

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

/**
 * TABLERO DE CALIDAD DEL AGENTE — la ruta admin. Dos trabajos, separados por `?rollup=1`:
 *
 *   /api/ai/metrics?dias=7|30       → LEE: serie diaria, ventana, tasas y deltas (el tablero).
 *   /api/ai/metrics?rollup=1        → ESCRIBE: cierra ayer y refresca hoy (el cron, idempotente).
 *   /api/ai/metrics?rollup=1&dia=…  → recalcula UN día puntual (relleno a mano).
 *
 * El rollup va en una QUERY y no en el verbo porque los cron de Vercel disparan GET: ponerlo en
 * POST lo dejaría sin ejecutarse nunca. Es el mismo patrón que ya usa
 * `/api/investments/price-alerts?kinds=date`. POST queda como alias del rollup para dispararlo a
 * mano con curl.
 *
 * PROTEGIDA con el mismo patrón admin/cron que /api/ai/health (X-Cron-Secret o Bearer). No es una
 * ruta de usuario: `agent_metrics` y `agent_audit_runs` son métricas del PRODUCTO, no llevan
 * user_id y no tienen políticas RLS — el service-role es el único camino, y este es el único lugar
 * desde el que se lo usa para leerlas.
 *
 * POR QUÉ LA LECTURA NO RECALCULA. Lee lo YA persistido: el rollup es trabajo del cron, y hacerlo
 * en la lectura convertiría cada refresh del tablero en un escaneo de `ai_events` de 30 días. Si un
 * día falta en la serie es información real (el cron no corrió), no algo que la lectura deba tapar.
 */
import { NextResponse } from "next/server";
import { corsHeaders } from "@/lib/security/cors";
import { cronAuthorized } from "@/lib/security/cron-auth";
import { toSafeResponse, AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { delta, sumarVentana, tasas, type DailyMetrics } from "@/lib/ai/agent-metrics";
import {
  diaCR,
  loadAuditRuns,
  loadDays,
  rollupAndSave,
  rollupDiario,
} from "@/lib/ai/metrics-store";

export const runtime = "nodejs";

const DIA_MS = 24 * 60 * 60 * 1000;

/** Ventanas permitidas. Acotadas a propósito: el tablero compara 7d contra 7d, o 30d contra 30d. */
const VENTANAS = [7, 30] as const;
const VENTANA_DEFAULT = 7;

const ES_DIA = /^\d{4}-\d{2}-\d{2}$/;

function isAdminRequest(req: Request): boolean {
  return cronAuthorized(
    {
      authorization: req.headers.get("authorization"),
      xCronSecret: req.headers.get("x-cron-secret"),
    },
    process.env.CRON_SECRET,
  );
}

/**
 * El rollup. Sin `dia` corre el del cron (ayer + hoy); con `dia` recalcula ese día.
 *
 * Siempre es seguro repetirlo: el rollup se recalcula desde los eventos crudos y hace upsert por
 * día, nunca acumula sobre lo que ya había.
 */
async function rollup(req: Request): Promise<NextResponse> {
  const cors = corsHeaders(req.headers.get("origin"));
  try {
    const dia = new URL(req.url).searchParams.get("dia");
    if (dia) {
      if (!ES_DIA.test(dia)) throw new AppError("VALIDATION", "El día debe ser YYYY-MM-DD.");
      const metrics = await rollupAndSave(dia);
      return NextResponse.json({ ok: true, dias: [{ dia, ok: true }], metrics }, { headers: cors });
    }

    const dias = await rollupDiario();
    const fallaron = dias.filter((d) => !d.ok);
    if (fallaron.length > 0) {
      logger.warn("agent-metrics: el rollup diario dejó días sin cerrar", {
        dias: fallaron.map((d) => d.dia).join(","),
      });
    }
    // 200 aunque un día falle: `rollupDiario` es best-effort por día y el detalle viaja en el body.
    // Devolver 500 haría que el cron reintentara TODO por un día que quizá no tiene arreglo.
    return NextResponse.json({ ok: fallaron.length === 0, dias }, { headers: cors });
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status, headers: cors });
  }
}

/** La serie diaria con sus tasas ya resueltas (se derivan, nunca se guardan: no pueden desfasarse). */
function serie(dias: { dia: string; metrics: DailyMetrics }[]) {
  return dias.map((d) => ({ dia: d.dia, metrics: d.metrics, tasas: tasas(d.metrics) }));
}

/**
 * La lectura del tablero. Devuelve la ventana pedida Y la inmediatamente anterior, porque un
 * número suelto no dice nada: lo accionable es el DELTA contra el período comparable.
 */
async function leer(req: Request): Promise<NextResponse> {
  const cors = corsHeaders(req.headers.get("origin"));
  try {
    const crudo = new URL(req.url).searchParams.get("dias");
    const pedido = crudo ? Number(crudo) : VENTANA_DEFAULT;
    const n = (VENTANAS as readonly number[]).includes(pedido) ? pedido : VENTANA_DEFAULT;

    const ahora = Date.now();
    // Ventanas en día CR (la app es es-CR): un "día" del tablero es el día que vivió el usuario.
    const hasta = diaCR(ahora);
    const desde = diaCR(ahora - (n - 1) * DIA_MS);
    const hastaPrev = diaCR(ahora - n * DIA_MS);
    const desdePrev = diaCR(ahora - (2 * n - 1) * DIA_MS);

    const [actualDias, previoDias, corridas] = await Promise.all([
      loadDays(desde, hasta),
      loadDays(desdePrev, hastaPrev),
      // Las corridas del banco son otra lectura del mismo tablero: la calidad medida a propósito,
      // no la observada en producción. Best-effort — que falte no puede tumbar las métricas.
      loadAuditRuns(5).catch((): Awaited<ReturnType<typeof loadAuditRuns>> => []),
    ]);

    const actual = sumarVentana(actualDias.map((d) => d.metrics));
    const previo = sumarVentana(previoDias.map((d) => d.metrics));
    const tasasActual = tasas(actual);

    return NextResponse.json(
      {
        ventana: { dias: n, desde, hasta },
        actual: { metrics: actual, tasas: tasasActual },
        previo: {
          metrics: previo,
          tasas: tasas(previo),
          ventana: { desde: desdePrev, hasta: hastaPrev },
        },
        delta: delta(tasasActual, tasas(previo)),
        // Los días que SÍ están persistidos. Un hueco acá significa que el cron no corrió ese día:
        // es información, no un error que la lectura deba disimular rellenando ceros.
        serie: serie(actualDias),
        auditRuns: corridas,
      },
      { headers: cors },
    );
  } catch (err) {
    const { status, body } = toSafeResponse(err);
    return NextResponse.json(body, { status, headers: cors });
  }
}

/**
 * Autoriza UNA vez y despacha. La autorización vive acá y no en cada mitad para que no exista un
 * camino nuevo que se olvide de pedirla.
 */
async function handle(req: Request): Promise<NextResponse> {
  const cors = corsHeaders(req.headers.get("origin"));
  if (!isAdminRequest(req)) {
    const { status, body } = toSafeResponse(new AppError("UNAUTHORIZED"));
    return NextResponse.json(body, { status, headers: cors });
  }
  return new URL(req.url).searchParams.get("rollup") ? rollup(req) : leer(req);
}

/** GET: lo usa tanto el cron (`?rollup=1`) como la lectura del tablero. */
export function GET(req: Request) {
  return handle(req);
}

/** POST: siempre el rollup — nadie “lee” con un POST, y así curl -X POST hace lo obvio. */
export function POST(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  if (!isAdminRequest(req)) {
    const { status, body } = toSafeResponse(new AppError("UNAUTHORIZED"));
    return NextResponse.json(body, { status, headers: cors });
  }
  return rollup(req);
}

export function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

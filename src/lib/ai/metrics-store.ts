import "server-only";
/**
 * Lectura y escritura del TABLERO DE CALIDAD (`agent_metrics`, `agent_audit_runs`).
 *
 * Métricas del PRODUCTO, no de un usuario: se escriben y se leen SIEMPRE con service-role, y las
 * tablas no tienen políticas para `authenticated` (nadie las alcanza con la anon key). El único
 * camino de lectura es la ruta admin con `CRON_SECRET`.
 *
 * Todo el criterio (qué es determinista, cómo se calculan los percentiles, cómo se estima el
 * costo) vive en `agent-metrics`, que es puro. Acá solo hay IO.
 */
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { logger } from "@/lib/logger";
import { rollupDay, type DailyMetrics, type MetricEvent } from "@/lib/ai/agent-metrics";
import type { AgentMetricsRow } from "@/lib/supabase/database.types";

/** Lo que se ESCRIBE en agent_metrics (el resto de columnas lo pone la BD). */
type AgentMetricsInsert = Partial<AgentMetricsRow> & { day: string };

/** Costa Rica: UTC−6 fijo (sin DST). Un "día" del tablero es el día que vivió el usuario. */
const CR_OFFSET_MS = 6 * 60 * 60 * 1000;

/** YYYY-MM-DD del día CR que contiene `ms`. */
export function diaCR(ms: number): string {
  return new Date(ms - CR_OFFSET_MS).toISOString().slice(0, 10);
}

/** Instante UTC (ISO) de las 00:00 CR de un día YYYY-MM-DD. CR es UTC−6 fijo ⇒ ese día a las 06:00Z. */
export function inicioDiaCR(dia: string): string {
  return `${dia}T06:00:00.000Z`;
}

/** El día CR siguiente a `dia`. */
export function diaSiguiente(dia: string): string {
  const t = new Date(`${dia}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000;
  return new Date(t).toISOString().slice(0, 10);
}

type EventRow = {
  event: string;
  name: string | null;
  ms: number | null;
  ok: boolean | null;
  tokens_in: number | null;
  tokens_out: number | null;
  user_id: string;
};

const KINDS: ReadonlySet<string> = new Set(["tool", "lane", "guard", "action", "provider_error"]);

function toMetricEvent(r: EventRow): MetricEvent | null {
  if (!KINDS.has(r.event)) return null;
  return {
    event: r.event as MetricEvent["event"],
    name: r.name,
    ms: r.ms,
    ok: r.ok,
    tokensIn: r.tokens_in,
    tokensOut: r.tokens_out,
    userId: r.user_id,
  };
}

/** Tope de eventos leídos por día. Muy por encima del volumen real; evita una lectura sin techo. */
const MAX_EVENTS = 50_000;

/**
 * Calcula el rollup de un día leyendo `ai_events` en crudo. Es la fuente de verdad: `agent_metrics`
 * es solo su caché persistida, y por eso recalcular un día siempre es seguro.
 */
export async function computeDay(dia: string): Promise<DailyMetrics> {
  const db = createServiceRoleClient();
  const desde = inicioDiaCR(dia);
  const hasta = inicioDiaCR(diaSiguiente(dia));
  const { data, error } = await db
    .from("ai_events")
    .select("event, name, ms, ok, tokens_in, tokens_out, user_id")
    .gte("created_at", desde)
    .lt("created_at", hasta)
    .limit(MAX_EVENTS);
  if (error) throw new Error(error.message);
  const eventos = (data ?? [])
    .map((r) => toMetricEvent(r as EventRow))
    .filter((e): e is MetricEvent => e !== null);
  return rollupDay(eventos);
}

/** Fila de `agent_metrics` tal como vive en la BD. */
type MetricsRow = {
  day: string;
  turnos: number;
  turnos_det: number;
  turnos_llm: number;
  guards_total: number;
  guards: Record<string, number>;
  lat_p50: number | null;
  lat_p95: number | null;
  lat_por_carril: DailyMetrics["latPorCarril"];
  tokens_in: number;
  tokens_out: number;
  // Postgres devuelve `numeric` como string por precisión: en LECTURA puede venir de las dos formas
  // (por eso `fromRow` lo pasa por Number()), pero lo que se ESCRIBE es siempre un número.
  costo_usd: number | string;
  acciones_propuestas: number;
  acciones_confirmadas: number;
  provider_errors: Record<string, number>;
  usuarios: number;
};

function toRow(dia: string, m: DailyMetrics): AgentMetricsInsert {
  return {
    day: dia,
    turnos: m.turnos,
    turnos_det: m.turnosDet,
    turnos_llm: m.turnosLlm,
    guards_total: m.guardsTotal,
    guards: m.guards,
    lat_p50: m.latP50,
    lat_p95: m.latP95,
    lat_por_carril: m.latPorCarril,
    tokens_in: m.tokensIn,
    tokens_out: m.tokensOut,
    costo_usd: m.costoUsd,
    acciones_propuestas: m.accionesPropuestas,
    acciones_confirmadas: m.accionesConfirmadas,
    provider_errors: m.providerErrors,
    usuarios: m.usuarios,
    updated_at: new Date().toISOString(),
  };
}

export function fromRow(r: MetricsRow): DailyMetrics {
  return {
    turnos: r.turnos,
    turnosDet: r.turnos_det,
    turnosLlm: r.turnos_llm,
    guardsTotal: r.guards_total,
    guards: r.guards ?? {},
    latP50: r.lat_p50,
    latP95: r.lat_p95,
    latPorCarril: r.lat_por_carril ?? {},
    tokensIn: Number(r.tokens_in ?? 0),
    tokensOut: Number(r.tokens_out ?? 0),
    costoUsd: Number(r.costo_usd ?? 0),
    accionesPropuestas: r.acciones_propuestas,
    accionesConfirmadas: r.acciones_confirmadas,
    providerErrors: r.provider_errors ?? {},
    usuarios: r.usuarios,
  };
}

/**
 * Recalcula un día y lo persiste (upsert por `day`). IDEMPOTENTE a propósito: el cron puede correr
 * dos veces, o correrse a mano para rellenar un día viejo, y el resultado es el mismo — se recalcula
 * desde los eventos crudos, nunca se acumula sobre lo que ya había.
 */
export async function rollupAndSave(dia: string): Promise<DailyMetrics> {
  const m = await computeDay(dia);
  const db = createServiceRoleClient();
  const { error } = await db.from("agent_metrics").upsert(toRow(dia, m), { onConflict: "day" });
  if (error) throw new Error(error.message);
  return m;
}

/**
 * El rollup del cron: cierra AYER (día CR completo) y refresca HOY (parcial, para que el tablero
 * no muestre el día en curso vacío). Best-effort por día: si ayer falla, hoy igual se intenta.
 */
export async function rollupDiario(
  nowMs: number = Date.now(),
): Promise<{ dia: string; ok: boolean }[]> {
  const hoy = diaCR(nowMs);
  const ayer = diaCR(nowMs - 24 * 60 * 60 * 1000);
  const out: { dia: string; ok: boolean }[] = [];
  for (const dia of [ayer, hoy]) {
    try {
      await rollupAndSave(dia);
      out.push({ dia, ok: true });
    } catch (err) {
      logger.warn("agent-metrics: rollup de un día falló", {
        dia,
        message: err instanceof Error ? err.message : "?",
      });
      out.push({ dia, ok: false });
    }
  }
  return out;
}

/** Serie de días persistidos (más nuevo primero), para las ventanas de 7d/30d del tablero. */
export async function loadDays(
  desde: string,
  hasta: string,
): Promise<{ dia: string; metrics: DailyMetrics }[]> {
  const db = createServiceRoleClient();
  const { data, error } = await db
    .from("agent_metrics")
    .select("*")
    .gte("day", desde)
    .lte("day", hasta)
    .order("day", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    dia: (r as MetricsRow).day,
    metrics: fromRow(r as MetricsRow),
  }));
}

// ── Corridas del banco de auditoría ─────────────────────────────────────────

export type AuditRun = {
  stamp: string;
  origen: string;
  total: number;
  pass: number;
  score: number;
  juez: Record<string, number>;
  fallas: Record<string, number>;
  failsCulpa: number;
  latP50: number | null;
  latP95: number | null;
  modelo: string | null;
  createdAt?: string;
};

/** Guarda el resultado de una corrida del banco. `stamp` es único → re-postear la misma no duplica. */
export async function saveAuditRun(run: AuditRun): Promise<void> {
  const db = createServiceRoleClient();
  const { error } = await db.from("agent_audit_runs").upsert(
    {
      stamp: run.stamp,
      origen: run.origen,
      total: run.total,
      pass: run.pass,
      score: run.score,
      juez: run.juez,
      fallas: run.fallas,
      fails_culpa: run.failsCulpa,
      lat_p50: run.latP50,
      lat_p95: run.latP95,
      modelo: run.modelo,
    },
    { onConflict: "stamp" },
  );
  if (error) throw new Error(error.message);
}

/** Las últimas corridas, más nueva primero. Es lo que permite decir "mejoró/empeoró". */
export async function loadAuditRuns(limit = 10): Promise<AuditRun[]> {
  const db = createServiceRoleClient();
  const { data, error } = await db
    .from("agent_audit_runs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  type Row = {
    stamp: string;
    origen: string;
    total: number;
    pass: number;
    score: number | string;
    juez: Record<string, number> | null;
    fallas: Record<string, number> | null;
    fails_culpa: number;
    lat_p50: number | null;
    lat_p95: number | null;
    modelo: string | null;
    created_at: string;
  };
  return (data ?? []).map((r) => {
    const row = r as Row;
    return {
      stamp: row.stamp,
      origen: row.origen,
      total: row.total,
      pass: row.pass,
      score: Number(row.score),
      juez: row.juez ?? {},
      fallas: row.fallas ?? {},
      failsCulpa: row.fails_culpa,
      latP50: row.lat_p50,
      latP95: row.lat_p95,
      modelo: row.modelo,
      createdAt: row.created_at,
    };
  });
}

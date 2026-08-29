import "server-only";
/**
 * SEGUIMIENTO DE RECOMENDACIONES — el IO. El criterio entero vive en `coaching-followup`, que es
 * puro; acá solo se lee el hilo, se arma el estado real desde los módulos de dominio, y se
 * persiste el cambio de estado.
 *
 * Best-effort de punta a punta: si algo de esto falla, el asesor responde igual — sin la línea de
 * celebración, que es una mejora, no un requisito.
 */
import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
import { logger } from "@/lib/logger";
import {
  resolverTodas,
  type EstadoActual,
  type FollowStatus,
  type Recomendacion,
} from "@/lib/ai/coaching-followup";

/** Cuántas recomendaciones abiertas se revisan por turno. Acota el trabajo del camino caliente. */
const MAX_ABIERTAS = 8;

type ThreadRow = {
  id: string;
  summary: string;
  created_at: string;
  action_type: string | null;
  action_ref: string | null;
  action_amount: number | string | null;
  action_baseline: number | string | null;
  follow_status: string | null;
};

const num = (v: number | string | null): number | null =>
  v === null ? null : Number.isFinite(Number(v)) ? Number(v) : null;

/** Recomendaciones ABIERTAS con acción estructurada. Las filas viejas (sin `action_type`) no entran. */
export async function loadRecomendacionesAbiertas(ctx?: AuthContext): Promise<Recomendacion[]> {
  try {
    const { db, userId } = await resolveAuth(ctx);
    let q = db
      .from("ai_coaching_thread")
      .select(
        "id, summary, created_at, action_type, action_ref, action_amount, action_baseline, follow_status",
      )
      .eq("follow_status", "abierta")
      .not("action_type", "is", null);
    if (ctx) q = q.eq("user_id", userId);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(MAX_ABIERTAS);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => {
      const row = r as ThreadRow;
      return {
        id: row.id,
        fecha: String(row.created_at).slice(0, 10),
        summary: row.summary,
        actionType: row.action_type,
        actionRef: row.action_ref,
        actionAmount: num(row.action_amount),
        status: "abierta" as FollowStatus,
      };
    });
  } catch (err) {
    logger.warn("loadRecomendacionesAbiertas falló", {
      message: err instanceof Error ? err.message : "?",
    });
    return [];
  }
}

/** Línea base guardada al recomendar, por id de recomendación. La necesita el motor para el delta. */
async function loadBaselines(
  ids: string[],
  ctx?: AuthContext,
): Promise<Record<string, { ref: string; baseline: number }>> {
  if (ids.length === 0) return {};
  const { db, userId } = await resolveAuth(ctx);
  let q = db.from("ai_coaching_thread").select("id, action_ref, action_baseline").in("id", ids);
  if (ctx) q = q.eq("user_id", userId);
  const { data } = await q;
  const out: Record<string, { ref: string; baseline: number }> = {};
  for (const r of data ?? []) {
    const row = r as {
      id: string;
      action_ref: string | null;
      action_baseline: number | string | null;
    };
    const b = num(row.action_baseline);
    if (row.action_ref && b !== null) out[row.id] = { ref: row.action_ref, baseline: b };
  }
  return out;
}

/**
 * El estado REAL de metas, deudas y posiciones del usuario, más la línea base de cada recomendación.
 * Se lee de los módulos de dominio (nunca del texto del hilo): el seguimiento se verifica contra los
 * datos, no contra lo que el asesor dijo que iba a pasar.
 */
export async function buildEstadoActual(
  recs: Recomendacion[],
  ctx?: AuthContext,
): Promise<EstadoActual> {
  const estado: EstadoActual = {
    metas: {},
    deudas: {},
    posiciones: {},
    previo: { metas: {}, deudas: {} },
  };

  // Cada lectura por separado: que falte el portafolio no puede dejar sin seguimiento a las metas.
  try {
    const { listGoals } = await import("@/modules/control");
    for (const g of await listGoals(ctx)) {
      estado.metas[g.id] = {
        nombre: g.name,
        acumulado: g.currentAmount ?? 0,
        aporteMensual: g.monthlyContribution ?? null,
      };
    }
  } catch {
    // sin metas legibles
  }
  try {
    const { getCurrentDebtBalances } = await import("@/modules/control");
    for (const d of await getCurrentDebtBalances(ctx)) {
      estado.deudas[d.id] = { nombre: d.name, saldo: d.currentBalance };
    }
  } catch {
    // sin deudas legibles
  }
  try {
    const { listHoldings } = await import("@/modules/wealth");
    for (const h of await listHoldings(ctx)) {
      estado.posiciones[h.id] = {
        nombre: h.label ?? h.symbol ?? "tu inversión",
        aporteMensual: h.monthlyContribution ?? null,
      };
    }
  } catch {
    // sin posiciones legibles
  }

  // La línea base es POR RECOMENDACIÓN, pero el motor la busca por id de entidad: se vuelca ahí.
  // Con dos recomendaciones sobre la misma meta gana la más vieja, que es la base correcta para
  // medir el avance total (si ganara la más nueva, el avance se contaría dos veces a la baja).
  const baselines = await loadBaselines(
    recs.map((r) => r.id),
    ctx,
  ).catch((): Record<string, { ref: string; baseline: number }> => ({}));
  const porFechaAsc = [...recs].sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
  for (const rec of porFechaAsc) {
    const b = baselines[rec.id];
    if (!b) continue;
    if (rec.actionType === "create_goal" && estado.previo?.metas && !(b.ref in estado.previo.metas))
      estado.previo.metas[b.ref] = b.baseline;
    if (
      rec.actionType === "debt_extra_payment" &&
      estado.previo?.deudas &&
      !(b.ref in estado.previo.deudas)
    )
      estado.previo.deudas[b.ref] = b.baseline;
  }
  return estado;
}

/** Persiste los cambios de estado (cumplida / vencida / sin_seguimiento). Best-effort. */
export async function marcarSeguimiento(
  cambios: { id: string; status: FollowStatus }[],
  ctx?: AuthContext,
): Promise<void> {
  if (cambios.length === 0) return;
  try {
    const { db, userId } = await resolveAuth(ctx);
    const ahora = new Date().toISOString();
    // Agrupado por estado: un update por estado en vez de uno por fila.
    const porEstado = new Map<FollowStatus, string[]>();
    for (const c of cambios) {
      const arr = porEstado.get(c.status) ?? [];
      arr.push(c.id);
      porEstado.set(c.status, arr);
    }
    for (const [status, ids] of porEstado) {
      await db
        .from("ai_coaching_thread")
        .update({ follow_status: status, resolved_at: ahora })
        .eq("user_id", userId)
        .in("id", ids);
    }
  } catch (err) {
    logger.warn("marcarSeguimiento falló", { message: err instanceof Error ? err.message : "?" });
  }
}

/**
 * El seguimiento completo de un turno: lee las abiertas, las cruza con el estado real, PERSISTE lo
 * resuelto y devuelve las líneas para el prompt. `[]` ante cualquier fallo.
 *
 * Persistir acá y no en un cron es deliberado: el estado se resuelve en el mismo momento en que el
 * asesor lo va a decir, así nunca celebra algo que ya celebró (la fila queda 'cumplida' y no vuelve
 * a entrar) ni se pierde una celebración por un cron que no corrió.
 */
export async function seguimientoParaContexto(
  hoy: string,
  currency: string,
  ctx?: AuthContext,
): Promise<string[]> {
  try {
    const recs = await loadRecomendacionesAbiertas(ctx);
    if (recs.length === 0) return [];
    const estado = await buildEstadoActual(recs, ctx);
    const { lineas, cambios } = resolverTodas(recs, estado, hoy, currency);
    await marcarSeguimiento(cambios, ctx);
    return lineas;
  } catch (err) {
    logger.warn("seguimientoParaContexto falló", {
      message: err instanceof Error ? err.message : "?",
    });
    return [];
  }
}

/**
 * Valor de la entidad AHORA, para congelarlo como línea base al recomendar. `null` si no se puede
 * leer — y entonces la recomendación queda sin base y el motor nunca la da por cumplida, que es la
 * degradación correcta: mejor no celebrar que celebrar algo falso.
 *
 * `set_dca` no lleva base a propósito: es una CONFIGURACIÓN, y su cumplimiento es que hoy exista
 * con el monto recomendado, no un delta contra un valor anterior.
 */
export async function baselineDeEntidad(
  actionType: string,
  actionRef: string,
  ctx?: AuthContext,
): Promise<number | null> {
  try {
    if (actionType === "create_goal") {
      const { listGoals } = await import("@/modules/control");
      const g = (await listGoals(ctx)).find((x) => x.id === actionRef);
      return g ? (g.currentAmount ?? 0) : null;
    }
    if (actionType === "debt_extra_payment") {
      const { getCurrentDebtBalances } = await import("@/modules/control");
      const d = (await getCurrentDebtBalances(ctx)).find((x) => x.id === actionRef);
      return d ? d.currentBalance : null;
    }
    return null;
  } catch {
    return null;
  }
}

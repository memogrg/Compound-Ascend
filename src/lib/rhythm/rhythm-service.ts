import "server-only";

/**
 * EL RITMO DEL MES — persistencia y lecturas. Todo el cálculo vive en `engine.ts`
 * (puro); acá solo hay IO.
 *
 * ── SCOPE: HOGAR ────────────────────────────────────────────────────────────
 * `budget_month_config` y `budget_late_edits` son del HOGAR, como los `budget_items` que
 * gobiernan: si un adulto cierra agosto, agosto está cerrado para los dos. En modo solo
 * (`household_id` null) el ancla cae al `user_id`. Esa doble llave es la razón de los dos
 * índices únicos PARCIALES de la migración 20260813000001, y de que cada upsert de acá
 * tenga que nombrar explícitamente cuál de los dos usa: PostgREST no adivina.
 *
 * La disciplina, en cambio, es de la PERSONA: `budget_late_edits` guarda `user_id` de
 * quién editó tarde y cuenta por separado. El presupuesto es compartido; el hábito no.
 */
import { cache } from "react";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth/session";
import { getActiveHouseholdId } from "@/lib/household/active";
import { logger } from "@/lib/logger";
import { userToday, userHour } from "@/lib/time/user-time";
import { lastDayOfMonth, monthPeriod } from "@/modules/financial-base/engine/period";
import { detectarRitmo, type SenalRitmo } from "@/lib/rhythm/spend-pace";
import {
  detectarOciosos,
  OCIOSO_MESES_VENTANA,
  type SobreHistorico,
  type SobreOcioso,
} from "@/lib/rhythm/idle-envelopes";
import {
  diaDe,
  enDiasDeCierre,
  estadoVentana,
  mostrarNudgeDiario,
  pendientesDeCierre,
  type PendienteCierre,
  type Ventana,
} from "@/lib/rhythm/engine";
import {
  reclamarEnvio,
  yaNotificadoHoy,
  type RhythmNotificationKind,
} from "@/lib/rhythm/notification-log";
import type { Period } from "@/modules/financial-base/types";

/**
 * El ancla de unicidad de una fila de scope-hogar. `onConflict` DEBE nombrar las columnas
 * del índice parcial que corresponde, porque los dos índices cubren espacios disjuntos
 * (`household_id is null` / `is not null`) y el planner solo puede usar uno.
 *
 * Nombrar el equivocado no falla ruidosamente: hace que el upsert no encuentre conflicto
 * e INSERTE una fila duplicada. Por eso se resuelve en un solo lugar.
 */
function conflictTarget(householdId: string | null, extra: string[] = []): string {
  const base = householdId
    ? ["household_id", "period_year", "period_month", ...extra, "user_id"]
    : ["user_id", "period_year", "period_month", ...extra];
  return base.join(",");
}

// ── Configuración del mes ───────────────────────────────────────────────────

export type MonthConfig = {
  closedAt: string | null;
  closedBy: string | null;
};

/** Config del mes del hogar (o del usuario en modo solo). Sin fila = nunca se cerró. */
export async function getMonthConfig(period: Period): Promise<MonthConfig> {
  try {
    const user = await requireUser();
    const supabase = await createSupabaseServerClient();
    const householdId = await getActiveHouseholdId(supabase, user.id);
    let q = supabase
      .from("budget_month_config")
      .select("closed_at, closed_by")
      .eq("period_year", period.year)
      .eq("period_month", period.month);
    // Espeja el índice parcial que ancla la fila: por hogar, o por usuario en modo solo.
    q = householdId
      ? q.eq("household_id", householdId)
      : q.eq("user_id", user.id).is("household_id", null);
    const { data } = await q.maybeSingle();
    return { closedAt: data?.closed_at ?? null, closedBy: data?.closed_by ?? null };
  } catch (err) {
    // Best-effort: sin config, la ventana se rige solo por el calendario. Nunca deja al
    // usuario sin poder editar por un fallo de lectura.
    logger.warn("getMonthConfig fallido", { message: err instanceof Error ? err.message : "?" });
    return { closedAt: null, closedBy: null };
  }
}

/**
 * Cierra (o reabre) la configuración del mes. Cerrar dentro de la ventana es válido y es
 * una decisión, no un error: "ya está, así queda el mes". Reabrir existe porque cerrar
 * por accidente el día 2 no puede costarle al usuario tres días de ventana.
 */
export async function setMonthConfigClosed(period: Period, closed: boolean): Promise<void> {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();
  const householdId = await getActiveHouseholdId(supabase, user.id);
  const { error } = await supabase.from("budget_month_config").upsert(
    {
      user_id: user.id,
      household_id: householdId,
      period_year: period.year,
      period_month: period.month,
      closed_at: closed ? new Date().toISOString() : null,
      closed_by: closed ? user.id : null,
    },
    { onConflict: conflictTarget(householdId) },
  );
  if (error) throw new Error(error.message);
}

/** Estado de la ventana para un período, resuelto contra la zona del PERFIL. */
export async function getVentana(period: Period): Promise<Ventana> {
  const [today, config] = await Promise.all([userToday(), getMonthConfig(period)]);
  // La ventana solo tiene sentido para el mes EN CURSO: un mes pasado está vencido por
  // definición, y uno futuro todavía no empezó (su día 1 no llegó).
  const esMesEnCurso =
    period.year === Number(today.slice(0, 4)) && period.month === Number(today.slice(5, 7));
  if (!esMesEnCurso) {
    return { estado: "vencida", abierta: false, diasRestantes: 0, ultimoDia: 0 };
  }
  return estadoVentana({ dia: diaDe(today), closedAt: config.closedAt });
}

// ── Contador de ediciones fuera de ventana ──────────────────────────────────

/**
 * Registra UN intento de editar el presupuesto de un sobre fuera de la ventana.
 *
 * Nunca lanza. Es deliberado y es la regla más importante de esta entrega: el contador
 * es una SEÑAL para el asesor, no un peaje. Si la escritura falla, la edición del
 * presupuesto tiene que pasar igual — negarle al usuario un cambio real en sus finanzas
 * porque no pudimos anotar una estadística sería exactamente el castigo que este diseño
 * evita.
 *
 * Incrementa con read-modify-write en vez de un `attempts + 1` atómico: la carrera exige
 * dos ediciones del MISMO sobre, del mismo usuario, en el mismo milisegundo, y el peor
 * daño posible es contar 3 en vez de 4. No amerita un RPC.
 */
export async function recordLateBudgetEdit(categoryId: string, period: Period): Promise<void> {
  try {
    const user = await requireUser();
    const supabase = await createSupabaseServerClient();
    const householdId = await getActiveHouseholdId(supabase, user.id);

    // La fila previa es la de ESTA persona en este sobre: el contador es por individuo
    // aunque el presupuesto sea del hogar, así que `user_id` va en los dos caminos.
    let q = supabase
      .from("budget_late_edits")
      .select("attempts")
      .eq("period_year", period.year)
      .eq("period_month", period.month)
      .eq("category_id", categoryId)
      .eq("user_id", user.id);
    q = householdId ? q.eq("household_id", householdId) : q.is("household_id", null);
    const { data: prev } = await q.maybeSingle();

    await supabase.from("budget_late_edits").upsert(
      {
        user_id: user.id,
        household_id: householdId,
        period_year: period.year,
        period_month: period.month,
        category_id: categoryId,
        attempts: (prev?.attempts ?? 0) + 1,
        last_attempt_at: new Date().toISOString(),
      },
      { onConflict: conflictTarget(householdId, ["category_id"]) },
    );
  } catch (err) {
    logger.warn("recordLateBudgetEdit fallido (la edición sigue adelante)", {
      categoryId,
      message: err instanceof Error ? err.message : "?",
    });
  }
}

export type LateEditCount = { categoryId: string; attempts: number };

/**
 * Ediciones fuera de ventana del período, por sobre y de mayor a menor. Contexto para el
 * asesor: un sobre con 4 ajustes tarde no es indisciplina, es un presupuesto mal
 * calibrado — y esa es la conversación que vale la pena tener.
 */
export async function getLateEditCounts(period: Period): Promise<LateEditCount[]> {
  try {
    const user = await requireUser();
    const supabase = await createSupabaseServerClient();
    const householdId = await getActiveHouseholdId(supabase, user.id);
    let q = supabase
      .from("budget_late_edits")
      .select("category_id, attempts")
      .eq("period_year", period.year)
      .eq("period_month", period.month);
    q = householdId
      ? q.eq("household_id", householdId)
      : q.eq("user_id", user.id).is("household_id", null);
    const { data } = await q;
    // Suma por sobre: en un hogar hay una fila por persona y la vista es del sobre.
    const porSobre = new Map<string, number>();
    for (const r of data ?? []) {
      porSobre.set(r.category_id, (porSobre.get(r.category_id) ?? 0) + r.attempts);
    }
    return [...porSobre.entries()]
      .map(([categoryId, attempts]) => ({ categoryId, attempts }))
      .sort((a, b) => b.attempts - a.attempts);
  } catch {
    return [];
  }
}

// ── Datos para los detectores ───────────────────────────────────────────────

/** Cuántos movimientos registró el usuario HOY (en su zona). Apaga el recordatorio. */
export async function contarMovimientosHoy(): Promise<number> {
  try {
    const user = await requireUser();
    const supabase = await createSupabaseServerClient();
    const { householdMemberIds } = await import("@/lib/household/active");
    const memberIds = await householdMemberIds(supabase, user.id);
    const today = await userToday();
    // `created_at` no: la pregunta es "¿registraste algo de hoy?", y cargar el almuerzo
    // de ayer a las 8pm también cuenta como haber hecho el ritual. `occurred_on` es la
    // fecha del hecho, que es lo que el usuario tiene en la cabeza.
    const { count } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .in("user_id", memberIds)
      .eq("occurred_on", today);
    return count ?? 0;
  } catch {
    // Ante la duda, NO molestar: un fallo de lectura no debe generar un recordatorio
    // falso a quien sí registró.
    return 1;
  }
}

export type ConteosCierre = {
  metasSinAporte: number;
  deudasSinPago: number;
  sobresSinMovimiento: number;
  transaccionesSinSobre: number;
};

/**
 * Lo que falta para cerrar el mes. UNA pasada sobre las transacciones del período
 * alcanza para los cuatro conteos: los aportes a metas y los pagos de deuda ya nacen
 * como transacciones enlazadas (`linked_kind`/`linked_id`, ver el orquestador en
 * linked-transaction-service.ts), así que no hace falta consultar sus ledgers aparte.
 */
export async function getConteosCierre(period: Period): Promise<ConteosCierre> {
  const vacio: ConteosCierre = {
    metasSinAporte: 0,
    deudasSinPago: 0,
    sobresSinMovimiento: 0,
    transaccionesSinSobre: 0,
  };
  try {
    const { listTransactions } =
      await import("@/modules/financial-base/services/transaction-service");
    const { getBudgetTotals } = await import("@/modules/financial-base/services/budget-service");
    const { getRealTotals } = await import("@/modules/financial-base/services/transaction-service");
    const { listGoals, listDebts } = await import("@/modules/control/services/control-service");

    const [txns, goals, debts, budget, real] = await Promise.all([
      listTransactions(period),
      listGoals(),
      listDebts(),
      getBudgetTotals(period),
      getRealTotals(period),
    ]);

    const conAporte = new Set(
      txns.filter((t) => t.linkedKind === "goal" && t.linkedId).map((t) => t.linkedId!),
    );
    const conPago = new Set(
      txns.filter((t) => t.linkedKind === "debt" && t.linkedId).map((t) => t.linkedId!),
    );

    // Solo metas que SE COMPROMETIERON a un aporte mensual. Una meta sin aporte definido
    // no "falta": nunca prometió nada este mes.
    const metasSinAporte = goals.filter(
      (g) => g.monthlyContribution > 0 && !conAporte.has(g.id),
    ).length;

    // Ídem: deudas con cuota. Una deuda saldada (balance 0) tampoco cuenta.
    const deudasSinPago = debts.filter(
      (d) => d.currentPayment > 0 && d.balance > 0 && !conPago.has(d.id),
    ).length;

    // Gastos sin sobre asignado: lo que rompe la foto del mes.
    const transaccionesSinSobre = txns.filter((t) => t.kind === "gasto" && !t.categoryId).length;

    // Sobres con monto presupuestado y CERO gasto real. Puede ser perfectamente normal
    // (el seguro que se paga en marzo) — por eso el copy dice "sin movimientos" y no
    // "sin usar", y por eso va último en la lista de pendientes.
    const sobresSinMovimiento = Object.entries(budget.expenseByKey).filter(
      ([key, b]) => b.value > 0 && (real.expenseByKey[key]?.value ?? 0) === 0,
    ).length;

    return { metasSinAporte, deudasSinPago, sobresSinMovimiento, transaccionesSinSobre };
  } catch (err) {
    logger.warn("getConteosCierre fallido", { message: err instanceof Error ? err.message : "?" });
    return vacio;
  }
}

// ── La foto del mes: UNA lectura, todos derivan de ella ─────────────────────

/**
 * Todo lo que los detectores de sobres necesitan saber del mes, en una sola estructura.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * Tres consumidores distintos —el detector de sobregiro, el de ritmo y el de ociosos— piden
 * exactamente los mismos totales, y cada uno los pedía por su cuenta. Eso son tres
 * `getBudgetTotals` + tres `getRealTotals`, con su conversión de moneda, sus tasas FX y su
 * mapa de categorías, en un camino que corre en CADA mensaje del chat (el context-engine
 * llama a `getActiveInsights`, que dispara `refreshInsights`).
 *
 * Y el costo no era lo peor: con tres lecturas independientes, dos avisos sobre el mismo
 * sobre podían mostrar cifras distintas si algo cambiaba entre una y otra.
 *
 * `cache()` es de React y memoiza POR REQUEST, no entre requests: no hay riesgo de servirle
 * a alguien la foto de otro, ni datos viejos en la siguiente navegación. Mismo patrón que
 * `resolveUserTz` en lib/time/user-time.ts.
 */
export type FotoDelMes = {
  period: Period;
  dia: number;
  todayIso: string;
  diasDelMes: number;
  currency: string;
  /** Presupuesto y gasto del mes EN CURSO, por sobre. */
  sobres: { categoryId: string; path: string; budget: number; spent: number }[];
  /** Presupuesto mensual + gasto ACUMULADO de la ventana de ociosos, por sobre. */
  historico: SobreHistorico[];
  /** Meses de historia real disponibles, topeado a la ventana. 0 = cuenta nueva. */
  mesesHistoria: number;
};

async function _getFotoDelMes(period: Period): Promise<FotoDelMes | null> {
  const todayIso = await userToday();
  try {
    const { getBudgetTotals } = await import("@/modules/financial-base/services/budget-service");
    const { getRealTotals } = await import("@/modules/financial-base/services/transaction-service");
    const { listCategories } = await import("@/modules/financial-base/services/categories-service");
    const { previousMonthPeriod } = await import("@/modules/financial-base/engine/period");

    // Ventana de ociosos: período sintético que arranca `meses−1` atrás y termina en el fin
    // del actual. Mismo truco que expense-range-service.ts para el segmented de 1m/3m/6m.
    let spanStart = period;
    for (let i = 0; i < OCIOSO_MESES_VENTANA - 1; i++) spanStart = previousMonthPeriod(spanStart);
    const spanPeriod: Period = { ...period, from: spanStart.from };

    const [budget, real, spanReal, cats, mesesHistoria] = await Promise.all([
      getBudgetTotals(period),
      getRealTotals(period),
      getRealTotals(spanPeriod),
      listCategories(),
      mesesConHistoria(period, OCIOSO_MESES_VENTANA),
    ]);

    // El frasco (padre) solo lo necesita el detector de ociosos, para proponer fusionar entre
    // hermanos. `expenseByKey` no lo trae.
    const padreDe = new Map(cats.map((c) => [c.id, c.parentId ?? null]));

    const entradas = Object.entries(budget.expenseByKey);
    return {
      period,
      dia: diaDe(todayIso),
      todayIso,
      diasDelMes: lastDayOfMonth(period.year, period.month),
      currency: real.currency,
      sobres: entradas.map(([categoryId, b]) => ({
        categoryId,
        // `expenseByKey` ya trae la etiqueta: no hace falta el árbol solo para nombrar.
        path: b.label,
        budget: b.value,
        spent: real.expenseByKey[categoryId]?.value ?? 0,
      })),
      historico: entradas.map(([categoryId, b]) => ({
        categoryId,
        path: b.label,
        frascoId: padreDe.get(categoryId) ?? null,
        budgetMensual: b.value,
        gastoVentana: spanReal.expenseByKey[categoryId]?.value ?? 0,
      })),
      mesesHistoria,
    };
  } catch (err) {
    logger.warn("getFotoDelMes fallido", { message: err instanceof Error ? err.message : "?" });
    return null;
  }
}

/** Dedup por request: la piden los tres detectores de sobres y el context-engine del asesor. */
export const getFotoDelMes = cache(_getFotoDelMes);

/**
 * Cuántos meses de historia REAL tiene la cuenta, topeado a `tope`.
 *
 * Sin esto, una cuenta de mes y medio dividiría su gasto entre 3 y casi todos sus sobres
 * parecerían ociosos — un aviso masivo y falso el primer mes de uso, que es exactamente cuando
 * peor cae. El motor además exige ≥2 meses para pronunciarse.
 */
async function mesesConHistoria(period: Period, tope: number): Promise<number> {
  try {
    const user = await requireUser();
    const supabase = await createSupabaseServerClient();
    const { householdMemberIds } = await import("@/lib/household/active");
    const memberIds = await householdMemberIds(supabase, user.id);
    const { data } = await supabase
      .from("transactions")
      .select("occurred_on")
      .in("user_id", memberIds)
      .order("occurred_on", { ascending: true })
      .limit(1);
    const primera = data?.[0]?.occurred_on;
    if (!primera) return 0;
    const y = Number(primera.slice(0, 4));
    const m = Number(primera.slice(5, 7));
    const meses = (period.year - y) * 12 + (period.month - m) + 1;
    return Math.max(0, Math.min(tope, meses));
  } catch {
    // Ante la duda, 0: no declarar ociosos es mejor que declararlos mal.
    return 0;
  }
}

// ── Ritmo de gasto por sobre (Fase B) ───────────────────────────────────────

/**
 * Señales de ritmo del mes en curso: sobres que van más rápido que el calendario.
 *
 * Reusa `getBudgetTotals`/`getRealTotals` —los MISMOS totales por `category_id` que ve el tab
 * de Gastos— en vez de sumar transacciones a mano. Que el aviso y la pantalla salgan de la
 * misma fuente no es elegancia: si difirieran, el usuario vería "llevás ₡200.000" en la
 * campana y otro número en Gastos, y a partir de ahí no le cree a ninguno de los dos.
 *
 * Acá SÍ se paga la conversión de moneda (a diferencia de `contarSobresConPresupuesto`):
 * comparar gastado contra presupuesto y proyectar exige que ambos estén en la misma unidad.
 */
export async function getSenalesRitmo(period: Period): Promise<{
  senales: SenalRitmo[];
  dia: number;
  todayIso: string;
}> {
  const foto = await getFotoDelMes(period);
  if (!foto) return { senales: [], dia: diaDe(await userToday()), todayIso: await userToday() };
  return {
    senales: detectarRitmo({
      sobres: foto.sobres,
      dia: foto.dia,
      diasDelMes: foto.diasDelMes,
      currency: foto.currency,
    }),
    dia: foto.dia,
    todayIso: foto.todayIso,
  };
}

/**
 * Mueve presupuesto de un sobre a otro, en el mismo período. La salida "un tap" del aviso de
 * ritmo.
 *
 * Es UN hecho para el usuario ("saco de acá y pongo allá"), así que se comporta como uno: si
 * la segunda escritura falla, la primera se revierte. Sin eso, un fallo a mitad dejaría el
 * sobre donante recortado y el receptor igual — el usuario perdería presupuesto sin recibir
 * nada, que es estrictamente peor que no haber hecho nada. Mismo criterio que el orquestador
 * de transacciones enlazadas (linked-transaction-service.ts).
 *
 * `confirmedOutsideWindow` va en true en las dos patas: el usuario ya confirmó el movimiento
 * con su tap, y si está fuera de la ventana los dos ajustes tienen que quedar registrados —
 * son dos ediciones reales del presupuesto del mes.
 */
export async function moverPresupuestoEntreSobres(args: {
  desdeCategoryId: string;
  desdeName: string;
  hastaCategoryId: string;
  hastaName: string;
  monto: number;
  currency: string;
  period: Period;
}): Promise<{ ok: boolean; message?: string }> {
  const { getBudgetTotals, setCategoryBudget } =
    await import("@/modules/financial-base/services/budget-service");

  const totals = await getBudgetTotals(args.period);
  const desdeActual = totals.expenseByKey[args.desdeCategoryId]?.value ?? 0;
  const hastaActual = totals.expenseByKey[args.hastaCategoryId]?.value ?? 0;

  if (args.monto <= 0) return { ok: false, message: "El monto a mover tiene que ser positivo." };
  if (args.monto > desdeActual) {
    return { ok: false, message: `${args.desdeName} no tiene tanto presupuesto para ceder.` };
  }

  const period = args.period;
  await setCategoryBudget({
    categoryId: args.desdeCategoryId,
    name: args.desdeName,
    period,
    amount: desdeActual - args.monto,
    currency: args.currency,
  });
  try {
    await setCategoryBudget({
      categoryId: args.hastaCategoryId,
      name: args.hastaName,
      period,
      amount: hastaActual + args.monto,
      currency: args.currency,
    });
  } catch (err) {
    // Compensación: devolver el donante a como estaba. Si ESTO también falla, se registra
    // fuerte — quedó un presupuesto inconsistente y hace falta saberlo.
    try {
      await setCategoryBudget({
        categoryId: args.desdeCategoryId,
        name: args.desdeName,
        period,
        amount: desdeActual,
        currency: args.currency,
      });
    } catch (rollbackErr) {
      logger.error("moverPresupuesto: la compensación falló, presupuesto inconsistente", {
        desde: args.desdeCategoryId,
        hasta: args.hastaCategoryId,
        monto: args.monto,
        message: rollbackErr instanceof Error ? rollbackErr.message : "?",
      });
    }
    throw err;
  }

  // Las dos patas son ediciones del presupuesto del mes: si la ventana está cerrada, las dos
  // suman al contador de disciplina.
  const ventana = await getVentana(period);
  if (!ventana.abierta) {
    await recordLateBudgetEdit(args.desdeCategoryId, period);
    await recordLateBudgetEdit(args.hastaCategoryId, period);
  }

  return { ok: true };
}

// ── Sobres ociosos (Fase C) ─────────────────────────────────────────────────

/**
 * Presupuesto mensual + gasto acumulado de los últimos meses, por sobre.
 *
 * El gasto de la ventana sale de UNA consulta y no de N: se arma un período sintético que
 * arranca `meses−1` atrás y termina en `period.to`, y `getRealTotals` lo agrega entero. Es el
 * mismo truco que ya usa `expense-range-service.ts` para el segmented de 1m/3m/6m — se reusa
 * en vez de reinventarlo para que las dos pantallas cuenten lo mismo.
 *
 * El presupuesto se toma del mes ACTUAL, no del promedio histórico: la pregunta es "lo que
 * apartás hoy, ¿lo usás?". Promediar el presupuesto de tres meses respondería otra cosa y
 * arrastraría meses que el usuario ya corrigió.
 */
export async function getSobresOciosos(period: Period): Promise<{
  ociosos: SobreOcioso[];
  todayIso: string;
}> {
  const foto = await getFotoDelMes(period);
  if (!foto) return { ociosos: [], todayIso: await userToday() };
  return {
    ociosos: detectarOciosos({
      sobres: foto.historico,
      mesesVentana: foto.mesesHistoria,
      currency: foto.currency,
    }),
    todayIso: foto.todayIso,
  };
}

/**
 * Fusiona un sobre ocioso dentro de otro (la salida "fusionar" del aviso).
 *
 * Delega en `mergeCategory`, que reasigna TODAS las referencias (transacciones, líneas de
 * presupuesto, reglas) antes de borrar. Es DESTRUCTIVO e irreversible, por eso la superficie
 * pide confirmación explícita y el motor solo lo propone entre hermanos del mismo frasco,
 * donde la redundancia ya está sugerida por la estructura.
 */
export async function fusionarSobres(fromId: string, intoId: string): Promise<void> {
  if (fromId === intoId) throw new Error("El sobre de origen y el de destino son el mismo.");
  const { mergeCategory } = await import("@/modules/financial-base/services/categories-service");
  await mergeCategory(fromId, intoId);
}

// ── Estado en vivo para las superficies (pop-up) ────────────────────────────

export type RhythmState = {
  period: { year: number; month: number };
  ventana: Ventana;
  /** Mostrar el recordatorio de registro (≥19:00 locales y nada registrado hoy). */
  nudgeDiario: boolean;
  /** Mostrar el aviso de ventana abierta como pop-up. */
  nudgeVentana: boolean;
  /**
   * Pendientes del cierre, o null fuera de los días de cierre. null y `[]` NO son lo
   * mismo: `[]` significa "estamos en el cierre y no falta nada" (se puede celebrar),
   * null significa "todavía no es momento" (no se dice nada).
   */
  cierre: PendienteCierre[] | null;
  /** Sobres con presupuesto este mes: decide el tono del aviso de ventana. */
  sobresConPresupuesto: number;
};

/**
 * Silencia un aviso in-app por el resto del DÍA del usuario (la X del pop-up).
 *
 * Reusa `notification_log` con `channel: 'inApp'` en lugar de inventar una tabla de
 * descartes: la pregunta es idéntica ("¿ya le mostramos esto hoy?") y así el descarte
 * expira solo al cambiar el día, que es exactamente lo que la X significa — "hoy no",
 * no "nunca más".
 */
export async function silenciarNudgeHoy(kind: RhythmNotificationKind): Promise<void> {
  const today = await userToday();
  await reclamarEnvio({ kind, channel: "inApp", sentOn: today });
}

/**
 * Estado del ritmo LEÍDO EN VIVO, para el pop-up de web y móvil.
 *
 * No sale de `user_insights` a propósito. La campana se alimenta de los detectores, que
 * corren detrás de la guardia de frescura de 12 h (`isStale`, insights-service.ts:567):
 * perfecto para "tu fondo de emergencia está corto", inservible para "son las 19:00 y no
 * registraste nada" — a las 19:30 la guardia todavía consideraría fresca la pasada de
 * las 9:00 y el aviso no aparecería nunca. Este camino es una consulta chica y sin
 * guardia, así que el pop-up siempre dice la verdad del momento.
 */
export async function getRhythmState(): Promise<RhythmState> {
  const today = await userToday();
  const period = monthPeriod(Number(today.slice(0, 4)), Number(today.slice(5, 7)));
  const [ventana, hora, movimientosHoy, sobres, diarioSilenciado, ventanaSilenciada] =
    await Promise.all([
      getVentana(period),
      userHour(),
      contarMovimientosHoy(),
      contarSobresConPresupuesto(period),
      yaNotificadoHoy({ kind: "registro_diario", channel: "inApp", sentOn: today }),
      yaNotificadoHoy({ kind: "ventana_presupuesto", channel: "inApp", sentOn: today }),
    ]);
  // El cierre se calcula APARTE y solo dentro de sus días: `getConteosCierre` lee
  // transacciones + metas + deudas + presupuesto, y el pop-up se monta en el layout —
  // o sea, en cada navegación. Pagar eso los 27 días en que no aplica sería absurdo.
  let cierre: PendienteCierre[] | null = null;
  if (enDiasDeCierre({ dia: diaDe(today), year: period.year, month: period.month })) {
    const silenciado = await yaNotificadoHoy({
      kind: "cierre_mes",
      channel: "inApp",
      sentOn: today,
    });
    if (!silenciado) cierre = pendientesDeCierre(await getConteosCierre(period));
  }

  return {
    period: { year: period.year, month: period.month },
    ventana,
    nudgeDiario: !diarioSilenciado && mostrarNudgeDiario({ horaLocal: hora, movimientosHoy }),
    nudgeVentana: !ventanaSilenciada && ventana.abierta,
    cierre,
    sobresConPresupuesto: sobres,
  };
}

/**
 * Sobres (categorías) con presupuesto de gasto > 0 este mes.
 *
 * Consulta de CONTEO directa, a propósito. La versión obvia —`getBudgetTotals(period)` y
 * contar las claves— arrastra normalización de moneda, tasas FX y el mapa de categorías
 * para al final quedarse con un número entero. Y esto corre dentro de `refreshInsights`,
 * que a su vez corre desde el context-engine del asesor en cada mensaje del chat: ahí ese
 * peso se paga en latencia de respuesta.
 *
 * No hace falta convertir monedas para preguntar "¿tiene monto asignado?": un sobre con
 * ₡50.000 y otro con $50 cuentan los dos, en cualquier moneda. La cifra convertida sí
 * importa en el tab de Gastos, y para eso está `getBudgetTotals`.
 */
export async function contarSobresConPresupuesto(period: Period): Promise<number> {
  try {
    const user = await requireUser();
    const supabase = await createSupabaseServerClient();
    const { householdMemberIds } = await import("@/lib/household/active");
    const memberIds = await householdMemberIds(supabase, user.id);
    const { count } = await supabase
      .from("budget_items")
      .select("id", { count: "exact", head: true })
      .in("user_id", memberIds)
      .eq("type", "expense")
      .eq("period_year", period.year)
      .eq("period_month", period.month)
      .gt("amount", 0);
    return count ?? 0;
  } catch {
    return 0;
  }
}

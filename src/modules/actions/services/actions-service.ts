import "server-only";

/**
 * Servicio de "Mis acciones": compone las fuentes REALES y llama al motor puro.
 *
 * No calcula nada propio. Lo único que hace además de leer es aplicar la regla del 12% para
 * separar las deudas caras (con DEBT_INVEST_THRESHOLD, que vive en wealth) y atar `compareExtra`
 * a la deuda cara, para que el motor pueda medir el impacto de pausar un objetivo con la misma
 * amortización que usa el comparador del excedente.
 *
 * Tolerancia a fallos: cada fuente va con su timeout y su fallback. Si una se cae, el plan se
 * arma sin ella y se loguea — esta pantalla no puede quedar en blanco porque un proveedor de
 * precios tardó.
 */
import { cache } from "react";
import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
import { withTimeout } from "@/lib/async/with-timeout";
import { logger } from "@/lib/logger";
import { userToday } from "@/lib/time/user-time";
import { convertCurrency } from "@/lib/fx";
import { getActiveInsights, type Insight } from "@/lib/insights";
import {
  getControlSummary,
  getCurrentDebtBalances,
  compareExtra,
  orderDebts,
  type AmortizationInput,
  type ControlSummary,
} from "@/modules/control";
import {
  getSurplusDecision,
  getDefenseFundsReport,
  listHoldings,
  DEBT_INVEST_THRESHOLD,
  type DefenseFundsReport,
  type SurplusDecisionReport,
} from "@/modules/wealth";
import { getDraft } from "@/modules/personal-profile";
import { buildActionPlan, resolveActionPriority } from "@/modules/actions/engine/action-engine";
import type {
  ActionImpact,
  ActionPlan,
  ActionPriority,
  ActionProgress,
  ActionState,
  ActionStatus,
  ExpensiveDebt,
} from "@/modules/actions/types";
import type { UserActionStateRow } from "@/lib/supabase/database.types";

/** Presupuesto por fuente. Generoso, pero acotado: la página se pinta igual. */
const TIMEOUT_MS = 8000;

function rowToState(r: UserActionStateRow): ActionState {
  return {
    id: r.id,
    actionKey: r.action_key,
    status: r.status as ActionStatus,
    snoozeUntil: r.snooze_until,
    impact: (r.impact as ActionImpact | null) ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Decisiones de la persona sobre sus acciones. PERSONAL: siempre por user_id, nunca por hogar. */
async function listActionStates(ctx?: AuthContext): Promise<ActionState[]> {
  const { db, userId } = await resolveAuth(ctx);
  const { data } = await db.from("user_action_states").select("*").eq("user_id", userId);
  return (data ?? []).map(rowToState);
}

/** Prioridad declarada (profiles.action_priority). null = derivar del onboarding. */
async function getStoredPriority(ctx?: AuthContext): Promise<ActionPriority | null> {
  const { db, userId } = await resolveAuth(ctx);
  const { data } = await db
    .from("profiles")
    .select("action_priority")
    .eq("id", userId)
    .maybeSingle();
  return data?.action_priority ?? null;
}

/** Cuántas posiciones cotizadas tienen aporte mensual automático (etapa 4 del camino). */
async function countRecurringHoldings(ctx?: AuthContext): Promise<number> {
  const holdings = await listHoldings(ctx);
  return holdings.filter((h) => h.isRecurring && (h.monthlyContribution ?? 0) > 0).length;
}

export const getActionPlan = cache(async function getActionPlan(
  ctx?: AuthContext,
): Promise<ActionPlan> {
  const fallbackFunds: DefenseFundsReport = {
    emergency: {
      target: 0,
      current: 0,
      gap: 0,
      progressPct: 0,
      covered: true,
      recommendedMonthly: 0,
    },
    peace: {
      target: 0,
      current: 0,
      gap: 0,
      progressPct: 0,
      covered: true,
      recommendedMonthly: 0,
      months: 3,
      blockedByEmergency: false,
    },
    activeFund: "done",
    horizonMonths: 12,
    currency: "CRC",
    emergencyRegistered: false,
    peaceRegistered: false,
    emergencyCandidate: null,
  };

  const [control, surplus, insights, funds, priorities, storedPriority, states, recurring, today] =
    await Promise.all([
      // El `.catch` va DENTRO de withTimeout a propósito: withTimeout nunca rechaza (resuelve
      // con el fallback), así que un catch por fuera jamás se ejecutaría y el fallo sería mudo.
      withTimeout(getControlSummary(ctx).catch(fallo("control", null)), TIMEOUT_MS, null),
      withTimeout(getSurplusDecision().catch(fallo("surplus", null)), TIMEOUT_MS, null),
      withTimeout(
        getActiveInsights(20, ctx).catch(fallo("insights", [] as Insight[])),
        TIMEOUT_MS,
        [] as Insight[],
      ),
      withTimeout(getDefenseFundsReport(ctx).catch(fallo("funds", null)), TIMEOUT_MS, null),
      withTimeout(getDraft().catch(fallo("profile", {})), TIMEOUT_MS, {}),
      getStoredPriority(ctx).catch(fallo("priority", null)),
      listActionStates(ctx).catch(fallo("states", [] as ActionState[])),
      withTimeout(countRecurringHoldings(ctx).catch(fallo("holdings", 0)), TIMEOUT_MS, 0),
      userToday(ctx),
    ]);

  const fundsReport = funds ?? fallbackFunds;
  const currency = control?.currency ?? surplus?.currency ?? fundsReport.currency;

  // Sin control no hay diagnóstico: el plan se arma con lo que sí llegó (fondos, insights).
  const diagnosis = control?.diagnosis ?? {
    scoreControl: 0,
    semaforo: "amarillo" as const,
    diagnosis: "",
    decision: "",
    impact: "",
    nextBestAction: "",
    allocation: [],
    goalRecs: [],
    alerts: [],
    plan30: [],
  };

  const surplusReport: SurplusDecisionReport = surplus ?? {
    monthlySurplus: 0,
    horizonYears: 10,
    apr: null,
    gated: false,
    pay: null,
    invest: [],
    currency,
    fundsCovered: fundsReport.activeFund === "done",
    debtName: null,
  };

  const { expensiveDebts, comparador, payoffDate } = await deudasCaras(control, currency, ctx);

  const priority = resolveActionPriority(
    storedPriority,
    (priorities as { priorities?: string[] }).priorities,
  );

  return buildActionPlan(
    {
      diagnosis,
      goals: control?.goals ?? [],
      debts: control?.debts ?? [],
      expensiveDebts,
      surplus: surplusReport,
      insights,
      funds: fundsReport,
      freeCashflow: control?.freeCashflow ?? 0,
      recurringHoldings: recurring,
      priorities: (priorities as { priorities?: string[] }).priorities ?? [],
      states,
      currency,
      today,
      compararAbono: comparador,
      payoffDate,
    },
    priority,
  );
});

/** Loguea la fuente que falló y sigue con el fallback. Nunca tumba la página. */
function fallo<T>(fuente: string, fallback: T) {
  return (err: unknown): T => {
    logger.warn("actions.fuente_no_disponible", { fuente, error: String(err) });
    return fallback;
  };
}

/**
 * Deudas por encima del umbral del 12% (en moneda de display, con saldo VIVO) + el comparador
 * de abono extra atado a la más cara. Misma elección y mismo motor que getSurplusDecision: si
 * dos pantallas dicen números distintos de la misma deuda, una de las dos miente.
 */
async function deudasCaras(
  control: ControlSummary | null,
  currency: string,
  ctx?: AuthContext,
): Promise<{
  expensiveDebts: ExpensiveDebt[];
  comparador?: (extra: number) => { interestSaved: number; monthsSaved: number } | null;
  payoffDate: string | null;
}> {
  if (!control) return { expensiveDebts: [], payoffDate: null };
  const balances = await getCurrentDebtBalances(ctx).catch(() => []);
  const vivo = new Map(balances.map((d) => [d.id, d.currentBalance]));
  const conv = (n: number, from: string) => convertCurrency(n, from, currency, control.fxRates);

  const caras = control.debts
    .map((d) => ({ d, saldo: vivo.get(d.id) ?? d.balance }))
    .filter(({ d, saldo }) => saldo > 0 && Number(d.apr ?? 0) / 100 > DEBT_INVEST_THRESHOLD)
    .sort((a, b) => Number(b.d.apr ?? 0) - Number(a.d.apr ?? 0));

  const expensiveDebts: ExpensiveDebt[] = caras.map(({ d, saldo }) => ({
    id: d.id,
    name: d.name,
    apr: Number(d.apr ?? 0),
    balance: conv(saldo, d.currency),
  }));

  const peor = caras[0];
  if (!peor) return { expensiveDebts, payoffDate: null };

  const entrada: AmortizationInput = {
    balance: conv(peor.saldo, peor.d.currency),
    apr: Number(peor.d.apr ?? 0),
    termMonths: peor.d.termMonths ?? null,
    monthlyPayment:
      peor.d.currentPayment != null ? conv(Number(peor.d.currentPayment), peor.d.currency) : null,
    insurance: peor.d.insurance != null ? conv(Number(peor.d.insurance), peor.d.currency) : null,
    introApr: peor.d.introApr ?? null,
    introFixedMonths: peor.d.introFixedMonths ?? null,
  };
  const horizonte = peor.d.termMonths ? Math.min(30, Math.max(1, peor.d.termMonths / 12)) : 10;

  // Línea base: cuándo se liquida HOY, sin abono extra. Es el dato de la nota de 'deudas'.
  let payoffDate: string | null = null;
  try {
    payoffDate = compareExtra(entrada, 0, horizonte).newPayoffDate;
  } catch {
    payoffDate = null;
  }

  const comparador = (extra: number) => {
    if (extra <= 0) return null;
    try {
      const c = compareExtra(entrada, extra, horizonte);
      return { interestSaved: c.interestSaved, monthsSaved: c.monthsSaved };
    } catch {
      return null;
    }
  };

  return { expensiveDebts, comparador, payoffDate };
}

/**
 * Lo que la persona ya decidió, con la suma de lo que eso significó. Los impactos vienen
 * CONGELADOS de la fila (`impact`): el motor deja de emitir la acción justo porque se hizo, así
 * que el progreso no se puede recalcular — se recuerda.
 */
export async function getActionProgress(ctx?: AuthContext): Promise<ActionProgress> {
  const [states, control] = await Promise.all([
    listActionStates(ctx).catch(fallo("states", [] as ActionState[])),
    withTimeout(getControlSummary(ctx), TIMEOUT_MS, null).catch(fallo("control", null)),
  ]);
  const currency = control?.currency ?? "CRC";
  const done = states.filter((s) => s.status === "hecha");
  return {
    done: [...done].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    snoozed: states.filter((s) => s.status === "pospuesta"),
    dismissed: states.filter((s) => s.status === "descartada"),
    interestAvoided: done.reduce(
      (s, a) =>
        s + (a.impact?.kind === "monto" || a.impact?.kind === "brecha" ? (a.impact.value ?? 0) : 0),
      0,
    ),
    monthsGained: done.reduce(
      (s, a) => s + (a.impact?.kind === "meses" ? (a.impact.value ?? 0) : 0),
      0,
    ),
    currency,
  };
}

// ── Pestaña "Decisiones" ────────────────────────────────────────────────────

/** Una deuda en la tabla comparativa de métodos, con su puesto en cada estrategia. */
export type DebtRowVM = {
  id: string;
  name: string;
  balance: number;
  apr: number;
  payment: number;
  ordenAvalancha: number;
  ordenBolaNieve: number;
};

/** Las dos columnas del "si lo pausás / si lo mantenés" de un objetivo. */
export type PauseComparisonVM = {
  goalId: string;
  goalName: string;
  monthly: number;
  reason: string;
  debtName: string;
  /** Pausar 90 días = tres aportes dirigidos a la deuda. */
  interestSaved: number;
  monthsSaved: number;
  payoffPausando: string | null;
  payoffManteniendo: string | null;
  /** Meses que se corre el objetivo por los tres aportes que no entraron. */
  goalShiftMonths: number;
};

export type DecisionsView = {
  surplus: SurplusDecisionReport;
  /** Deudas vivas para el selector "¿contra cuál comparo?". */
  selectable: { id: string; name: string; apr: number }[];
  selectedDebtId: string | null;
  debts: DebtRowVM[];
  method: { method: string; reason: string } | null;
  /** Avalancha y bola de nieve dan el mismo orden de ataque: decirlo evita una falsa elección. */
  methodsAgree: boolean;
  pauses: PauseComparisonVM[];
  currency: string;
};

/**
 * Todo lo que la pestaña Decisiones necesita, ya calculado en el servidor con los motores
 * reales (amortización, estrategia de deudas y el comparador del excedente). La UI no vuelve
 * a calcular nada: recibe filas y las pinta.
 */
export async function getDecisionsView(debtId?: string, ctx?: AuthContext): Promise<DecisionsView> {
  const [control, surplusReport, balances] = await Promise.all([
    getControlSummary(ctx).catch(fallo("control", null)),
    getSurplusDecision(debtId).catch(fallo("surplus", null)),
    getCurrentDebtBalances(ctx).catch(
      fallo("balances", [] as { id: string; currentBalance: number }[]),
    ),
  ]);
  const currency = control?.currency ?? surplusReport?.currency ?? "CRC";
  const vacio: DecisionsView = {
    surplus: surplusReport ?? {
      monthlySurplus: 0,
      horizonYears: 10,
      apr: null,
      gated: false,
      pay: null,
      invest: [],
      currency,
      fundsCovered: false,
      debtName: null,
    },
    selectable: [],
    selectedDebtId: debtId ?? null,
    debts: [],
    method: null,
    methodsAgree: false,
    pauses: [],
    currency,
  };
  if (!control) return vacio;

  const vivo = new Map(balances.map((d) => [d.id, d.currentBalance]));
  const conv = (n: number, from: string) => convertCurrency(n, from, currency, control.fxRates);
  const activas = control.debts
    .map((d) => ({ d, saldo: vivo.get(d.id) ?? d.balance }))
    .filter(({ saldo }) => saldo > 0);

  const entradas = activas.map(({ d, saldo }) => ({
    id: d.id,
    name: d.name,
    balance: conv(saldo, d.currency),
    apr: Number(d.apr ?? 0),
    minPayment: conv(d.minPayment, d.currency),
    payment: conv(d.currentPayment || d.minPayment, d.currency),
  }));

  const puesto = (metodo: "avalancha" | "bola_nieve") => {
    const orden = orderDebts(entradas, metodo);
    return new Map(orden.map((d, i) => [d.id, i + 1]));
  };
  const av = puesto("avalancha");
  const bn = puesto("bola_nieve");

  const debts: DebtRowVM[] = entradas.map((e) => ({
    id: e.id,
    name: e.name,
    balance: e.balance,
    apr: e.apr,
    payment: e.payment,
    ordenAvalancha: av.get(e.id) ?? 0,
    ordenBolaNieve: bn.get(e.id) ?? 0,
  }));

  const methodsAgree = entradas.length > 1 && entradas.every((e) => av.get(e.id) === bn.get(e.id));

  return {
    ...vacio,
    surplus: surplusReport ?? vacio.surplus,
    selectable: entradas.map((e) => ({ id: e.id, name: e.name, apr: e.apr })),
    debts,
    method: control.diagnosis.debtMethod ?? null,
    methodsAgree,
    pauses: await comparacionesDePausa(control, currency, ctx),
  };
}

/** Meses de pausa que se comparan. 90 días: suficiente para verse, corto para no doler. */
const PAUSA_MESES = 3;

/** «Si lo pausás 90 días / si lo mantenés», con la amortización real de la deuda cara. */
async function comparacionesDePausa(
  control: ControlSummary,
  currency: string,
  ctx?: AuthContext,
): Promise<PauseComparisonVM[]> {
  const pausas = control.diagnosis.goalRecs.filter((r) => r.action === "pausar");
  if (pausas.length === 0) return [];
  const { expensiveDebts } = await deudasCaras(control, currency, ctx);
  const cara = expensiveDebts[0];
  if (!cara) return [];

  const cruda = control.debts.find((d) => d.id === cara.id);
  if (!cruda) return [];
  const conv = (n: number, from: string) => convertCurrency(n, from, currency, control.fxRates);
  const entrada: AmortizationInput = {
    balance: cara.balance,
    apr: cara.apr,
    termMonths: cruda.termMonths ?? null,
    monthlyPayment:
      cruda.currentPayment != null ? conv(Number(cruda.currentPayment), cruda.currency) : null,
    insurance: cruda.insurance != null ? conv(Number(cruda.insurance), cruda.currency) : null,
    introApr: cruda.introApr ?? null,
    introFixedMonths: cruda.introFixedMonths ?? null,
  };
  const base = compareExtra(entrada, 0, 1);

  const out: PauseComparisonVM[] = [];
  for (const rec of pausas) {
    const goal = control.goals.find((g) => g.id === rec.goalId);
    const aporte = goal ? conv(goal.monthlyContribution, goal.currency) : 0;
    if (aporte <= 0) continue;
    const conPausa = compareExtra(entrada, aporte, PAUSA_MESES / 12);
    out.push({
      goalId: rec.goalId,
      goalName: rec.goalName,
      monthly: aporte,
      reason: rec.reason,
      debtName: cara.name,
      interestSaved: conPausa.interestSaved,
      monthsSaved: conPausa.monthsSaved,
      payoffPausando: conPausa.newPayoffDate,
      payoffManteniendo: base.newPayoffDate,
      goalShiftMonths: PAUSA_MESES,
    });
  }
  return out;
}

/** Prioridad efectiva del usuario (para el selector). Sin sesión válida, 'orden'. */
export async function getEffectivePriority(ctx?: AuthContext): Promise<ActionPriority> {
  const [stored, draft] = await Promise.all([
    getStoredPriority(ctx).catch(() => null),
    getDraft().catch(() => ({}) as { priorities?: string[] }),
  ]);
  return resolveActionPriority(stored, (draft as { priorities?: string[] }).priorities);
}

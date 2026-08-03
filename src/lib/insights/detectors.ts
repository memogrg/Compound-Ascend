/**
 * Detectores conductuales (puros, sin IO). Reciben datos ya cargados y devuelven
 * DetectedInsight[]. Copy en 2ª persona, neutral y sin juicio (antipatrones de la
 * Biblia conductual). El estado/persistencia vive en insights-service.
 */
import type { SavingsGoal, Debt } from "@/modules/control/types";
import type { DetectedInsight } from "@/lib/insights/types";
import type { OpenContribution } from "@/modules/wealth/services/contribution-service";
import { formatMoney } from "@/lib/format";

/**
 * Recordatorio del fondo de PAZ (F2): cuando la emergencia YA está cubierta (hito activo = paz)
 * pero la paz está incompleta, avisa en la campana cuántos meses cubre hoy y cuánto apartar/mes.
 * Self-clearing: al completarse la paz (o si el hito ya no es paz) el detector deja de emitirlo y
 * syncInsights lo marca resuelto. related_id estable → una sola tarjeta, sin spam.
 */
export function detectPeaceFundGap(input: {
  emergencyCovered: boolean;
  peaceCovered: boolean;
  monthsActual: number;
  peaceMonths: number;
  recommendedMonthly: number;
  currency: string;
}): DetectedInsight[] {
  if (!input.emergencyCovered || input.peaceCovered || input.recommendedMonthly <= 0) return [];
  const months = input.monthsActual.toFixed(1).replace(/[.,]0$/, "");
  return [
    {
      kind: "fondo_paz",
      severity: "observar",
      title: "Tu fondo de paz",
      body: `Hoy cubriría ${months} de ${input.peaceMonths} meses de tus gastos esenciales. Apartá ${formatMoney(input.recommendedMonthly, input.currency)}/mes para completarlo.`,
      relatedId: "fondo_paz",
    },
  ];
}

// ----------------------------------------------------------------------------
// Cobertura de "daño" — lo que un asesor amigo vería en los datos y diría.
//
// Todos son deterministas y sobre cifras REALES del usuario. Ninguno usa relatedKind 'holding':
// user_insights tiene un check que solo admite goal/debt/category, así que los de portafolio se
// identifican con un relatedId estable (una sola tarjeta por tipo, sin spam).
// ----------------------------------------------------------------------------

/** Se considera "cara" una deuda con TASA anual desde acá (tarjeta/consumo típico). */
export const APR_CARO = 20;

/** Sobre gastado por encima de su presupuesto: se ignora el ruido de centavos (< 5%). */
const SOBREGIRO_MIN_PCT = 0.05;

/**
 * Sobres pasados de presupuesto ESTE mes. Emite los peores por monto excedido (tope `max`, 2 por
 * defecto): con un insight por sobre la campana se vuelve una lista de reproches, y el asesor solo
 * va a mencionar uno igual.
 */
export function detectOverspentEnvelopes(input: {
  sobres: { categoryId: string; path: string; budget: number; spent: number }[];
  currency: string;
  max?: number;
}): DetectedInsight[] {
  const excedidos = input.sobres
    .filter((s) => s.budget > 0 && s.spent > s.budget * (1 + SOBREGIRO_MIN_PCT))
    .map((s) => ({ ...s, exceso: s.spent - s.budget }))
    .sort((a, b) => b.exceso - a.exceso)
    .slice(0, input.max ?? 2);

  return excedidos.map((s) => ({
    kind: "sobre_sobregirado" as const,
    // Pasarse un quinto del sobre es otra cosa que pasarse un 6%: solo lo primero es accionable.
    severity: s.exceso / s.budget >= 0.2 ? ("accionar" as const) : ("observar" as const),
    relatedKind: "category" as const,
    relatedId: s.categoryId,
    metric: Math.round(s.exceso),
    title: `Te pasaste en "${s.path}"`,
    body: `Llevás ${formatMoney(s.exceso, input.currency)} por encima de tu presupuesto de ${formatMoney(s.budget, input.currency)} este mes.`,
  }));
}

/**
 * Tasa de ahorro baja o negativa. Negativa = está gastando más de lo que entra, que es el daño
 * más urgente de todos: sin flujo libre, nada de lo demás se puede arreglar.
 */
export function detectLowSavingsRate(input: {
  /** Proporción 0..1 (puede ser negativa) — la misma que calcula base-engine. */
  savingsRate: number;
  incomeMonthly: number;
  freeCashflow: number;
  currency: string;
}): DetectedInsight[] {
  if (input.incomeMonthly <= 0) return []; // sin ingreso registrado no hay nada que afirmar
  const pct = Math.round(input.savingsRate * 100);
  if (input.savingsRate < 0) {
    return [
      {
        kind: "ahorro_bajo",
        severity: "accionar",
        relatedId: "ahorro_bajo",
        metric: pct,
        title: "Estás gastando más de lo que entra",
        body: `Tus gastos superan tus ingresos del mes por ${formatMoney(Math.abs(input.freeCashflow), input.currency)}. Es lo primero que conviene cerrar.`,
      },
    ];
  }
  if (input.savingsRate < 0.1) {
    return [
      {
        kind: "ahorro_bajo",
        severity: "observar",
        relatedId: "ahorro_bajo",
        metric: pct,
        title: `Tu tasa de ahorro está en ${pct}%`,
        body: "Queda poco margen para tus metas y para imprevistos. Subirla aunque sea unos puntos cambia el panorama.",
      },
    ];
  }
  return [];
}

/**
 * Deuda CARA por tasa (no por atraso — eso ya lo ve detectGrowingDebt). Emite UNA sola: la de
 * tasa más alta, que es la que hay que atacar primero. Señalar cinco deudas a la vez no ayuda a
 * elegir; señalar la peor, sí.
 */
export function detectExpensiveDebt(debts: Debt[], minApr: number = APR_CARO): DetectedInsight[] {
  const caras = debts.filter((d) => d.apr != null && d.apr >= minApr && d.balance > 0);
  if (caras.length === 0) return [];
  const peor = caras.reduce((a, b) => ((b.apr ?? 0) > (a.apr ?? 0) ? b : a));
  return [
    {
      kind: "deuda_cara",
      severity: "accionar",
      relatedKind: "debt",
      relatedId: peor.id,
      metric: Math.round(peor.apr ?? 0),
      title: `Tu deuda "${peor.name}" es la más cara`,
      body: `Está al ${peor.apr}% anual sobre un saldo de ${formatMoney(peor.balance, peor.currency)}. Cada colón que le abones de más rinde como esa tasa.`,
    },
  ];
}

/**
 * Fondo de EMERGENCIA incompleto. Complementa a detectPeaceFundGap, que solo mira la paz y exige
 * la emergencia ya cubierta: sin este, el caso PEOR (no tener ni el fondo base) no se detectaba.
 *
 * Va en MONTO y no en meses a propósito: la emergencia de este producto es un objetivo fijo
 * (EMERGENCY_FUND_USD, $1.000 convertidos), no un múltiplo del gasto esencial — eso es la paz.
 */
export function detectEmergencyFundGap(input: {
  covered: boolean;
  current: number;
  target: number;
  recommendedMonthly: number;
  currency: string;
}): DetectedInsight[] {
  if (input.covered || input.target <= 0) return [];
  const cuota =
    input.recommendedMonthly > 0
      ? ` Apartá ${formatMoney(input.recommendedMonthly, input.currency)}/mes para cerrarlo.`
      : "";
  return [
    {
      kind: "fondo_emergencia",
      severity: "accionar",
      relatedId: "fondo_emergencia",
      metric: Math.round(input.target - input.current),
      title: "Tu fondo de emergencia está incompleto",
      body: `Llevás ${formatMoney(input.current, input.currency)} de ${formatMoney(input.target, input.currency)}.${cuota} Es la base que sostiene todo lo demás.`,
    },
  ];
}

/** Desde qué proporción una sola posición/clase concentra demasiado el portafolio. */
export const CONCENTRACION_ALTA = 0.6;

/**
 * Concentración del portafolio: una sola posición o clase pesa demasiado. Es riesgo específico,
 * no una mala decisión — por eso 'observar' y no 'accionar'.
 */
export function detectConcentration(input: {
  /** Porciones con su peso 0..1, ya calculadas por el motor de portafolio. */
  slices: { label: string; pct: number }[];
  totalValue: number;
  threshold?: number;
}): DetectedInsight[] {
  if (input.totalValue <= 0 || input.slices.length === 0) return [];
  const umbral = input.threshold ?? CONCENTRACION_ALTA;
  const top = input.slices.reduce((a, b) => (b.pct > a.pct ? b : a));
  // Con una sola posición no hay "concentración" que señalar: es el estado natural de arrancar.
  if (input.slices.length < 2 || top.pct < umbral) return [];
  return [
    {
      kind: "concentracion_inversion",
      severity: "observar",
      relatedId: "concentracion_inversion",
      metric: Math.round(top.pct * 100),
      title: `${top.label} concentra el ${Math.round(top.pct * 100)}% de tu portafolio`,
      body: "Si a esa posición le va mal, se lo lleva casi todo. Diversificar reduce ese riesgo específico sin resignar el plan.",
    },
  ];
}

/**
 * El portafolio rinde por DEBAJO de la inflación.
 *
 * Honestidad del dato: `returnPct` es el rendimiento ACUMULADO desde la compra y la inflación es
 * interanual — no son la misma unidad. Por eso el copy NO afirma un "rendimiento real" calculado:
 * pone las dos cifras al lado y deja ver la brecha, que es lo que el usuario necesita saber. Un
 * número compuesto de dos unidades distintas sería una cifra inventada con cara de real.
 */
export function detectReturnBelowInflation(input: {
  /** Rendimiento acumulado del portafolio, 0..1 (puede ser negativo). */
  returnPct: number;
  /** Inflación interanual, 0..1. */
  inflationPct: number;
  totalValue: number;
}): DetectedInsight[] {
  if (input.totalValue <= 0 || input.inflationPct <= 0) return [];
  if (input.returnPct >= input.inflationPct) return [];
  const r = Math.round(input.returnPct * 100);
  const i = Math.round(input.inflationPct * 100);
  return [
    {
      kind: "rendimiento_bajo_inflacion",
      severity: "observar",
      relatedId: "rendimiento_bajo_inflacion",
      metric: r,
      title: "Tu portafolio va por debajo de la inflación",
      body: `Acumula ${r}% mientras la inflación del último año fue ${i}%. Mantener el poder de compra pide revisar la composición.`,
    },
  ];
}

/** Meses enteros desde `now` hasta una fecha ISO (puede ser negativo si pasó). */
function monthsUntil(dateIso: string, now: Date): number {
  const t = new Date(dateIso);
  return (t.getFullYear() - now.getFullYear()) * 12 + (t.getMonth() - now.getMonth());
}

const isFuture = (dateIso: string, now: Date): boolean =>
  new Date(dateIso).getTime() > now.getTime();

/** Metas que perdieron ritmo: atrasadas o cuyo aporte no alcanza para su fecha. */
export function detectStalledGoals(goals: SavingsGoal[], now: Date = new Date()): DetectedInsight[] {
  const out: DetectedInsight[] = [];
  for (const g of goals) {
    let requiredMonthly = 0;
    let qualifies = g.status === "atrasado";
    if (
      g.targetDate &&
      isFuture(g.targetDate, now) &&
      g.currentAmount < g.targetAmount
    ) {
      const months = Math.max(monthsUntil(g.targetDate, now), 1);
      requiredMonthly = (g.targetAmount - g.currentAmount) / months;
      if (requiredMonthly > g.monthlyContribution) qualifies = true;
    }
    if (!qualifies) continue;
    out.push({
      kind: "meta_estancada",
      severity: "observar",
      relatedKind: "goal",
      relatedId: g.id,
      metric: Math.round(requiredMonthly),
      title: `Tu meta "${g.name}" está perdiendo ritmo`,
      body: "No avanza al paso necesario para su fecha objetivo. Un pequeño ajuste en tu aporte la vuelve a poner en camino.",
    });
  }
  return out;
}

/** Deudas con atraso: requieren atención para que no crezcan por intereses. */
export function detectGrowingDebt(debts: Debt[]): DetectedInsight[] {
  const out: DetectedInsight[] = [];
  for (const d of debts) {
    if (d.delinquency === "1_30" || d.delinquency === "31_60" || d.delinquency === "60_mas") {
      out.push({
        kind: "deuda_creciendo",
        severity: "accionar",
        relatedKind: "debt",
        relatedId: d.id,
        metric: d.balance,
        title: `Tu deuda "${d.name}" necesita atención`,
        body: "Aparece con atraso. Priorizarla ahora evita que siga creciendo por intereses.",
      });
    }
  }
  return out;
}

/** Metas con avance fuerte (>= 80%): celebración y empujón final. */
export function detectPositiveStreak(goals: SavingsGoal[]): DetectedInsight[] {
  const out: DetectedInsight[] = [];
  for (const g of goals) {
    if (g.targetAmount <= 0) continue;
    const pct = g.currentAmount / g.targetAmount;
    if (pct < 0.8) continue;
    const pctInt = Math.round(pct * 100);
    out.push({
      kind: "racha_positiva",
      severity: "celebrar",
      relatedKind: "goal",
      relatedId: g.id,
      metric: pctInt,
      title: pct >= 1 ? `¡Lograste tu meta "${g.name}"!` : `¡Estás muy cerca de "${g.name}"!`,
      body:
        pct >= 1
          ? "La cerraste. Buen momento para definir tu próximo objetivo."
          : `Ya alcanzaste el ${pctInt}% de tu meta. Un último empujón y la cierras.`,
    });
  }
  return out;
}

/**
 * Frasco de jugar: el gasto de disfrute del mes va muy por encima del promedio
 * reciente (> +30%). Observación amable, no prohibición.
 */
export function detectDisfruteSpike(p: {
  current: number;
  priorAvg: number;
  categoryId?: string;
}): DetectedInsight[] {
  if (!(p.priorAvg > 0 && p.current > p.priorAvg * 1.3)) return [];
  return [
    {
      kind: "gasto_disfrute_alza",
      severity: "observar",
      relatedKind: "category",
      relatedId: p.categoryId,
      metric: Math.round(p.current),
      title: "Tu frasco de jugar subió este mes",
      body: "Tu gasto de disfrute va por encima de tu promedio reciente. No se trata de eliminarlo: define un monto libre para disfrutar sin culpa y proteger tus metas.",
    },
  ];
}

/** Corre los tres detectores snapshot sobre los datos de control. */
export function runDetectors(
  { goals, debts }: { goals: SavingsGoal[]; debts: Debt[] },
  now: Date = new Date(),
): DetectedInsight[] {
  return [
    ...detectStalledGoals(goals, now),
    ...detectGrowingDebt(debts),
    ...detectPositiveStreak(goals),
  ];
}

/**
 * Aportes del mes sin confirmar → un insight 'accionar' por holding. relatedId =
 * holdingId para que syncInsights lo resuelva al confirmar el precio.
 */
export function detectOpenContributions(contributions: OpenContribution[]): DetectedInsight[] {
  const out: DetectedInsight[] = [];
  for (const c of contributions) {
    out.push({
      kind: "aporte_pendiente",
      severity: "accionar",
      title: `Confirmá el precio de tu aporte a ${c.label}`,
      body: "Registramos tu aporte del mes al precio en vivo. Confirmá o ajustá el precio de compra en el Portafolio para promediar bien tu costo.",
      relatedKind: "holding",
      relatedId: c.holdingId,
    });
  }
  return out;
}

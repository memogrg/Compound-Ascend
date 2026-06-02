/**
 * Motor de Prioridad Financiera (puro, testeable).
 * Cruza flujo libre, objetivos y deudas con el perfil para decidir la mejor
 * secuencia: qué mantener, pausar, acelerar, convertir y qué deuda atacar.
 * El motor calcula; la IA redacta el porqué.
 */
import type {
  SavingsGoal,
  Debt,
  ControlContext,
  ControlDiagnosis,
  GoalRecommendation,
  Semaforo,
  AllocationItem,
} from "@/modules/control/types";
import { recommendMethod, type DebtInput } from "@/modules/control/engine/debt-strategy";
import { formatMoney } from "@/lib/format";

const HIGH_APR = 30;

function monthsUntil(dateISO?: string | null): number | null {
  if (!dateISO) return null;
  const target = new Date(dateISO + (dateISO.length === 10 ? "T00:00:00" : ""));
  const now = new Date();
  const months =
    (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
  return months > 0 ? months : null;
}

function isCriticalDebt(d: Debt): boolean {
  return (
    (d.apr ?? 0) >= HIGH_APR ||
    d.delinquency === "31_60" ||
    d.delinquency === "60_mas" ||
    d.classification === "critica"
  );
}

/** Recomendación por objetivo según viabilidad y contexto. */
function recommendForGoal(
  g: SavingsGoal,
  ctx: ControlContext,
  hasCriticalDebt: boolean,
  currency: string,
): GoalRecommendation {
  const remaining = Math.max(0, g.targetAmount - g.currentAmount);
  const months = monthsUntil(g.targetDate);
  const requiredMonthly = months ? Math.ceil(remaining / months) : undefined;
  const isSecurity = g.goalType === "seguridad" || /emergencia|paz/i.test(g.name);

  // Flujo negativo: pausa lo no esencial.
  if (ctx.freeCashflow < 0 && !isSecurity && g.priority !== "alta") {
    return {
      goalId: g.id,
      goalName: g.name,
      action: "pausar",
      reason: "Tu flujo es negativo. Pausa este objetivo mientras recuperas estabilidad.",
      requiredMonthly,
    };
  }

  // Deuda crítica + objetivo de disfrute de baja prioridad.
  if (hasCriticalDebt && !isSecurity && g.priority === "baja") {
    return {
      goalId: g.id,
      goalName: g.name,
      action: "pausar",
      reason: "Tienes deuda cara. Pausar este objetivo y redirigir a la deuda ahorra intereses.",
      requiredMonthly,
    };
  }

  // Horizonte largo => evaluar inversión.
  if (months && months > 60 && ctx.hasEmergencyFund && !hasCriticalDebt) {
    return {
      goalId: g.id,
      goalName: g.name,
      action: "convertir",
      reason:
        "Su horizonte es de más de 5 años. Podría evaluarse como inversión según tu perfil de riesgo.",
      requiredMonthly,
    };
  }

  // Viabilidad por aporte.
  if (requiredMonthly !== undefined) {
    if (g.monthlyContribution + 0.01 >= requiredMonthly) {
      if (ctx.freeCashflow > requiredMonthly * 0.5 && g.priority === "alta") {
        return {
          goalId: g.id,
          goalName: g.name,
          action: "acelerar",
          reason: `Vas bien y tienes margen: subir el aporte adelanta la meta.`,
          requiredMonthly,
        };
      }
      return {
        goalId: g.id,
        goalName: g.name,
        action: "mantener",
        reason: "Este objetivo es sostenible con tu aporte actual.",
        requiredMonthly,
      };
    }
    // No alcanza el ritmo.
    if (ctx.freeCashflow > 0) {
      return {
        goalId: g.id,
        goalName: g.name,
        action: "acelerar",
        reason: `Para lograrlo a tiempo necesitas ~${formatMoney(requiredMonthly, currency)}/mes (hoy aportas ${formatMoney(g.monthlyContribution, currency)}).`,
        requiredMonthly,
      };
    }
    return {
      goalId: g.id,
      goalName: g.name,
      action: "replantear",
      reason: "Con tu flujo actual no es alcanzable en la fecha. Conviene ajustar monto o plazo.",
      requiredMonthly,
    };
  }

  return {
    goalId: g.id,
    goalName: g.name,
    action: "mantener",
    reason: "Define una fecha objetivo para medir su viabilidad.",
    requiredMonthly,
  };
}

function computeScore(
  goals: SavingsGoal[],
  debts: Debt[],
  ctx: ControlContext,
  hasCriticalDebt: boolean,
): number {
  let score = 0;
  if (ctx.freeCashflow > 0) score += 25;
  else if (ctx.freeCashflow === 0) score += 10;
  if (!hasCriticalDebt) score += 20;
  if (ctx.hasEmergencyFund) score += 20;
  // Coherencia de objetivos: no demasiados activos para el flujo.
  const active = goals.filter((g) => g.monthlyContribution > 0).length;
  if (active <= 3) score += 15;
  else if (active <= 5) score += 8;
  // Sin mora.
  if (!debts.some((d) => d.delinquency && d.delinquency !== "no")) score += 10;
  // Estrés.
  if ((ctx.stress ?? 5) <= 5) score += 10;
  return Math.min(100, score);
}

function semaforoFrom(score: number, freeCashflow: number, hasCriticalDebt: boolean): Semaforo {
  if (freeCashflow < 0 || (hasCriticalDebt && score < 50)) return "rojo";
  if (score >= 75 && freeCashflow > 0) return "verde";
  return "amarillo";
}

/** Construye el "orden financiero recomendado" del flujo libre. */
function buildAllocation(
  free: number,
  ctx: ControlContext,
  hasCriticalDebt: boolean,
): AllocationItem[] {
  if (free <= 0) {
    return [{ label: "Estabilizar flujo", amount: 0, note: "Recupera flujo positivo antes de asignar." }];
  }
  const items: AllocationItem[] = [];
  let rest = free;

  if (!ctx.hasEmergencyFund) {
    const toEmergency = Math.round(rest * 0.4);
    items.push({ label: "Mini fondo de emergencia", amount: toEmergency, note: "Base de seguridad" });
    rest -= toEmergency;
  }
  if (hasCriticalDebt) {
    const toDebt = Math.round(rest * (ctx.hasEmergencyFund ? 0.7 : 0.6));
    items.push({ label: "Pago extra a deuda cara", amount: toDebt, note: "Reduce intereses" });
    rest -= toDebt;
  }
  if (rest > 0) {
    items.push({ label: "Objetivos prioritarios", amount: Math.round(rest), note: "Avanza tus metas" });
  }
  return items;
}

export function buildControlDiagnosis(
  goals: SavingsGoal[],
  debts: Debt[],
  ctx: ControlContext,
  currency = "CRC",
): ControlDiagnosis {
  const activeDebts = debts.filter((d) => d.balance > 0);
  const hasCriticalDebt = activeDebts.some(isCriticalDebt);
  const score = computeScore(goals, activeDebts, ctx, hasCriticalDebt);
  const semaforo = semaforoFrom(score, ctx.freeCashflow, hasCriticalDebt);

  const goalRecs = goals.map((g) => recommendForGoal(g, ctx, hasCriticalDebt, currency));

  const debtMethod =
    activeDebts.length > 0
      ? recommendMethod(
          activeDebts.map<DebtInput>((d) => ({
            id: d.id,
            name: d.name,
            balance: d.balance,
            apr: d.apr ?? 0,
            minPayment: d.minPayment,
          })),
          { discipline: ctx.discipline, stress: ctx.stress },
        )
      : undefined;

  const alerts = buildAlerts(goalRecs, activeDebts, ctx, hasCriticalDebt);
  const allocation = buildAllocation(ctx.freeCashflow, ctx, hasCriticalDebt);

  const { diagnosis, decision, impact, nextBestAction } = narrative(
    semaforo,
    ctx,
    hasCriticalDebt,
    goalRecs,
    currency,
  );

  const plan30 = buildPlan(ctx, hasCriticalDebt, goalRecs, debtMethod);

  return {
    scoreControl: score,
    semaforo,
    diagnosis,
    decision,
    impact,
    nextBestAction,
    allocation,
    goalRecs,
    alerts,
    plan30,
    debtMethod,
  };
}

function buildAlerts(
  recs: GoalRecommendation[],
  debts: Debt[],
  ctx: ControlContext,
  hasCriticalDebt: boolean,
): string[] {
  const alerts: string[] = [];
  if (hasCriticalDebt && recs.some((r) => r.action === "pausar")) {
    alerts.push("Estás ahorrando para objetivos no esenciales mientras una deuda cara crece.");
  }
  if (!ctx.hasEmergencyFund) {
    alerts.push("Tu fondo de emergencia aún no está construido; es tu primera red de seguridad.");
  }
  const activeGoals = recs.length;
  if (activeGoals > 4) {
    alerts.push("Tienes muchos objetivos activos para tu flujo. Conviene enfocarte en 2-3.");
  }
  if (debts.some((d) => d.delinquency && d.delinquency !== "no")) {
    alerts.push("Tienes deudas con atraso: cubrir mínimos es prioridad para evitar mora.");
  }
  return alerts;
}

function narrative(
  semaforo: Semaforo,
  ctx: ControlContext,
  hasCriticalDebt: boolean,
  recs: GoalRecommendation[],
  currency: string,
): { diagnosis: string; decision: string; impact: string; nextBestAction: string } {
  if (ctx.freeCashflow < 0) {
    return {
      diagnosis: "Tu flujo mensual es negativo: gastas más de lo que ingresas.",
      decision: "Detén la fuga: revisa gastos flexibles y pausa objetivos no esenciales.",
      impact: "Volver a flujo positivo es la base para cualquier avance.",
      nextBestAction: "Recorta gastos flexibles este mes hasta recuperar flujo positivo.",
    };
  }
  if (hasCriticalDebt) {
    return {
      diagnosis: "Tienes deuda cara que consume más energía financiera de la necesaria.",
      decision: `Dirige tu flujo libre (${formatMoney(ctx.freeCashflow, currency)}) a la deuda de mayor tasa y mantén el resto en mínimos.`,
      impact: "Reduces intereses y liberas flujo para tus metas más adelante.",
      nextBestAction: `Paga extra a tu deuda más cara con tus ${formatMoney(ctx.freeCashflow, currency)} libres.`,
    };
  }
  if (!ctx.hasEmergencyFund) {
    return {
      diagnosis: "Tu base es estable pero falta tu red de seguridad.",
      decision: "Construye un mini fondo de emergencia antes de acelerar otros objetivos.",
      impact: "Una reserva mínima evita que un imprevisto te devuelva a la deuda.",
      nextBestAction: "Automatiza un aporte mensual a tu fondo de emergencia.",
    };
  }
  const accelerate = recs.find((r) => r.action === "acelerar");
  return {
    diagnosis: semaforo === "verde" ? "Tu estrategia es saludable." : "Tu estrategia es sólida con ajustes menores.",
    decision: accelerate
      ? `Puedes acelerar "${accelerate.goalName}" con tu margen disponible.`
      : "Mantén tus aportes y evalúa convertir metas largas en inversión.",
    impact: "Avanzas más rápido hacia tu Rich Life sin comprometer tu estabilidad.",
    nextBestAction: accelerate
      ? `Aumenta el aporte a "${accelerate.goalName}".`
      : "Revisa convertir tu meta de largo plazo en una estrategia de inversión.",
  };
}

function buildPlan(
  ctx: ControlContext,
  hasCriticalDebt: boolean,
  recs: GoalRecommendation[],
  debtMethod?: { method: string; reason: string },
): string[] {
  const plan: string[] = ["Mantén al día los pagos mínimos de todas tus deudas."];
  if (!ctx.hasEmergencyFund) plan.push("Aparta un primer monto para tu mini fondo de emergencia.");
  if (hasCriticalDebt && debtMethod) {
    plan.push(`Aplica el método ${methodLabel(debtMethod.method)} a tus deudas.`);
  }
  const pausar = recs.filter((r) => r.action === "pausar").map((r) => r.goalName);
  if (pausar.length) plan.push(`Pausa temporalmente: ${pausar.join(", ")}.`);
  const acelerar = recs.filter((r) => r.action === "acelerar").map((r) => r.goalName);
  if (acelerar.length) plan.push(`Prioriza el avance de: ${acelerar.join(", ")}.`);
  plan.push("Revisamos tu progreso en 30 días.");
  return plan;
}

function methodLabel(m: string): string {
  return { avalancha: "avalancha", bola_nieve: "bola de nieve", hibrido: "híbrido" }[m] ?? m;
}

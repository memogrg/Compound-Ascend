/**
 * Motor de SUGERENCIAS de los asistentes. Puro y sin I/O.
 *
 * Todas las sugerencias se calculan con los números REALES del usuario (su
 * ingreso mensualizado, su gasto esencial, su brecha de fondo, su excedente).
 * Ninguna es un texto fijo: si el ingreso es 0 no hay sugerencia — se dice que
 * falta el dato, en vez de inventar un monto que no significa nada.
 *
 * El dimensionamiento de los fondos de defensa NO vive aquí: ya lo calcula
 * `wealth/engine/fund-sizing` y el asistente lo muestra tal cual (`gap`,
 * `recommendedMonthly`). Duplicarlo daría dos verdades.
 */
import type { SetupSnapshot, SetupSobre } from "@/modules/setup/types";

/**
 * Reparto de referencia por frasco, como fracción del ingreso NETO mensual.
 * Es un punto de partida conversable, no una regla: los seis frascos normales
 * suman ~0,80 y el 20% restante es lo que la filosofía del producto reserva
 * para deudas, defensa, ahorro y libertad (los frascos vinculados, que se
 * configuran en sus propios asistentes).
 */
export const JAR_BENCHMARK: Record<string, number> = {
  g_vivienda: 0.3,
  g_alimentacion: 0.12,
  g_transporte: 0.12,
  g_estilo: 0.15,
  g_salud: 0.06,
  g_educacion: 0.03,
  g_otros: 0.02,
};

/** Frascos alimentados por entidades reales: su monto se edita en su módulo. */
export const LINKED_JAR_KEYS = ["g_deudas", "g_defensa", "g_ahorro_lp", "g_libertad"];

export type Suggestion = {
  /** Monto sugerido en la moneda principal. `null` cuando falta el dato base. */
  amount: number | null;
  /** Frase con SUS números. Vacía si no hay nada honesto que decir. */
  text: string;
};

function money(v: number, currency: string): string {
  return new Intl.NumberFormat("es-CR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Math.round(v));
}

/**
 * Cuánto deja un reparto sano para este frasco, con SU ingreso.
 * Sin ingreso cargado no hay porcentaje que aplicar: se dice eso.
 */
export function suggestJarBudget(
  incomeMonthly: number,
  jarKey: string | null,
  jarName: string,
  currency: string,
): Suggestion {
  const share = jarKey ? JAR_BENCHMARK[jarKey] : undefined;
  if (!share) return { amount: null, text: "" };
  if (incomeMonthly <= 0) {
    return { amount: null, text: "Cargá tus ingresos y te digo cuánto deja un reparto sano aquí." };
  }
  const amount = Math.round(incomeMonthly * share);
  return {
    amount,
    text: `Con tu ingreso de ${money(incomeMonthly, currency)}, un reparto sano deja ~${money(amount, currency)} para ${jarName}.`,
  };
}

/**
 * Sugerencia para UN sobre: la porción del frasco repartida entre los sobres
 * activos de ese frasco. Con un solo sobre, el sobre se lleva el frasco entero.
 */
export function suggestSobreBudget(
  incomeMonthly: number,
  sobre: SetupSobre,
  sobresDelFrasco: number,
  currency: string,
): Suggestion {
  const jar = suggestJarBudget(incomeMonthly, sobre.jarKey, sobre.jarName, currency);
  if (jar.amount === null) return jar;
  const cuantos = Math.max(1, sobresDelFrasco);
  const amount = Math.round(jar.amount / cuantos);
  return {
    amount,
    text:
      cuantos === 1
        ? `${sobre.jarName} suele llevarse ~${money(jar.amount, currency)} de tu ingreso.`
        : `${money(jar.amount, currency)} para ${sobre.jarName}, repartido entre ${cuantos} sobres: ~${money(amount, currency)} cada uno.`,
  };
}

export type BudgetBalance = {
  income: number;
  budgeted: number;
  free: number;
  /** Fracción del ingreso ya presupuestada (0 si no hay ingreso). */
  usedPct: number;
  tone: "ok" | "ajustado" | "excedido" | "sin_datos";
  text: string;
};

/** El resumen del asistente de Presupuesto: ingreso, presupuestado y libre. */
export function budgetBalance(
  incomeMonthly: number,
  budgetedMonthly: number,
  currency: string,
): BudgetBalance {
  const free = incomeMonthly - budgetedMonthly;
  if (incomeMonthly <= 0) {
    return {
      income: incomeMonthly,
      budgeted: budgetedMonthly,
      free,
      usedPct: 0,
      tone: "sin_datos",
      text: "Sin ingresos cargados no se puede repartir. Empezá por el primer paso.",
    };
  }
  const usedPct = budgetedMonthly / incomeMonthly;
  if (free < 0) {
    return {
      income: incomeMonthly,
      budgeted: budgetedMonthly,
      free,
      usedPct,
      tone: "excedido",
      text: `Estás repartiendo ${money(-free, currency)} más de lo que entra. Bajá algún sobre antes de cerrar.`,
    };
  }
  if (usedPct >= 0.95) {
    return {
      income: incomeMonthly,
      budgeted: budgetedMonthly,
      free,
      usedPct,
      tone: "ajustado",
      text: `Te queda ${money(free, currency)} libre. Es poco margen: cualquier imprevisto se come el mes.`,
    };
  }
  return {
    income: incomeMonthly,
    budgeted: budgetedMonthly,
    free,
    usedPct,
    tone: "ok",
    text: `Te queda ${money(free, currency)} libre cada mes.`,
  };
}

/**
 * Encadenado con sentido: qué ofrecer al cerrar Presupuesto. Ese sobrante no es
 * para gastar — es el combustible de Defensa (si los fondos no están) o de
 * Control (si hay deuda cara o metas sin aporte).
 */
export type NextMove = {
  wizard: "defensa" | "control" | "crecimiento";
  title: string;
  text: string;
};

export function nextAfterBudget(s: SetupSnapshot, free: number): NextMove | null {
  if (free <= 0) return null;
  const currency = s.currency;
  const libre = money(free, currency);

  // 1) Defensa primero: sin piso, todo lo demás es frágil.
  const em = s.emergency;
  if (!em || !em.covered) {
    const falta = em ? money(em.gap, currency) : null;
    return {
      wizard: "defensa",
      title: "Ese sobrante no es para gastar",
      text: falta
        ? `Te quedan ${libre} libres y tu fondo de emergencia todavía necesita ${falta}. Dimensionémoslo.`
        : `Te quedan ${libre} libres y todavía no tenés fondo de emergencia. Ese es el primer destino.`,
    };
  }

  // 2) Deuda cara: rinde más que cualquier inversión razonable.
  const cara = s.debts
    .filter((d) => (d.apr ?? 0) >= 20)
    .sort((a, b) => (b.apr ?? 0) - (a.apr ?? 0));
  const peor = cara[0];
  if (peor) {
    return {
      wizard: "control",
      title: "Ese sobrante tiene un destino obvio",
      text: `Te quedan ${libre} libres y "${peor.name}" corre al ${Math.round(peor.apr ?? 0)}%. Abonarle ahí rinde más que cualquier inversión.`,
    };
  }

  // 3) Metas sin aporte: existe el objetivo pero nadie lo alimenta.
  const sinAporte = s.goals.filter(
    (g) => !(g.goalType ?? "").startsWith("defensa:") && g.monthlyContribution <= 0,
  );
  if (sinAporte.length > 0) {
    return {
      wizard: "control",
      title: "Ese sobrante no es para gastar",
      text: `Te quedan ${libre} libres y ${sinAporte.length === 1 ? `tu meta "${sinAporte[0]!.name}" no tiene` : `${sinAporte.length} de tus metas no tienen`} aporte mensual.`,
    };
  }

  // 4) Con la base cubierta, el sobrante va a crecer.
  return {
    wizard: "crecimiento",
    title: "Tu base está cubierta",
    text: `Te quedan ${libre} libres y tus fondos ya están. Ese excedente es el que hace crecer tu patrimonio.`,
  };
}

/** Aporte mensual sugerido para una meta con objetivo y fecha. */
export function suggestGoalMonthly(
  targetAmount: number,
  currentAmount: number,
  targetDate: string | null,
  today: Date,
  currency: string,
): Suggestion {
  const gap = Math.max(0, targetAmount - currentAmount);
  if (gap <= 0) return { amount: null, text: "" };
  if (!targetDate) {
    // Sin fecha no hay plazo: se ofrece el horizonte por defecto de 12 meses.
    const amount = Math.round(gap / 12);
    return {
      amount,
      text: `Te faltan ${money(gap, currency)}. En 12 meses son ${money(amount, currency)} al mes.`,
    };
  }
  const meses = monthsBetween(today, new Date(`${targetDate}T00:00:00`));
  if (meses <= 0) {
    return { amount: gap, text: `La fecha ya llegó y te faltan ${money(gap, currency)}.` };
  }
  const amount = Math.round(gap / meses);
  return {
    amount,
    text: `Te faltan ${money(gap, currency)} en ${meses} ${meses === 1 ? "mes" : "meses"}: ${money(amount, currency)} al mes.`,
  };
}

function monthsBetween(from: Date, to: Date): number {
  const y = to.getFullYear() - from.getFullYear();
  const m = to.getMonth() - from.getMonth();
  return y * 12 + m;
}

/**
 * Aporte DCA sugerido: la mitad del excedente libre, y solo con la base
 * cubierta. Antes de eso invertir es pedir prestado del fondo de emergencia.
 */
export function suggestDca(s: SetupSnapshot, free: number, currency: string): Suggestion {
  if (free <= 0) return { amount: null, text: "" };
  const baseCubierta = Boolean(s.emergency?.covered);
  if (!baseCubierta) {
    return {
      amount: null,
      text: "Tu fondo de emergencia todavía no está cubierto: ese es el destino del excedente antes de invertir.",
    };
  }
  const amount = Math.round(free / 2);
  return {
    amount,
    text: `Te quedan ${money(free, currency)} libres. Aportar ${money(amount, currency)}/mes deja la otra mitad de colchón.`,
  };
}

/**
 * Estilo de vida deseado sugerido: lo que hoy gasta, más un margen. Es el
 * insumo del número de Libertad, así que se ancla en su gasto real y no en un
 * múltiplo inventado.
 */
export function suggestLifestyle(
  budgetedMonthly: number,
  essentialMonthly: number,
  currency: string,
): Suggestion {
  const base = Math.max(budgetedMonthly, essentialMonthly);
  if (base <= 0) {
    return {
      amount: null,
      text: "Configurá tu presupuesto primero: el número de Libertad se calcula sobre lo que querés gastar al mes.",
    };
  }
  const amount = Math.round(base * 1.2);
  return {
    amount,
    text: `Hoy tu vida cuesta ${money(base, currency)}/mes. Con 20% de margen, ${money(amount, currency)} es un punto de partida.`,
  };
}

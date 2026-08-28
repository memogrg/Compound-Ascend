/**
 * PURE mappers: raw per-entity data → the advisor's context "levers". No `server-only`,
 * no Supabase, no clock — deterministic and unit-testable. The context-engine feeds these
 * with data it already fetches; buildSystemPrompt renders the result as NEUTRAL facts.
 *
 * These exist so the advisor can be CONCRETE per entity ("tu Tarjeta al 40% te cuesta
 * ₡26.700/mes") instead of only seeing an aggregate — every figure is REAL/derived, so
 * grounding stays intact (nothing here invites invention).
 */

/** One debt as a lever: live balance + APR + minimum + the monthly interest it costs. */
export type DebtLever = {
  name: string;
  liveBalance: number;
  apr: number | null;
  minPayment: number;
  currency: string;
  /** liveBalance × apr/100 / 12, rounded. 0 when apr is null/≤0 (no cost to attack). */
  monthlyInterestCost: number;
};

export type DebtLeverInput = {
  name: string;
  liveBalance: number;
  apr: number | null;
  minPayment: number;
  currency: string;
};

/**
 * Debts with a live balance, as levers ordered by monthly interest cost (what hurts most,
 * first — the "attack this one" signal), then by balance. Caps at `topN`; the overflow count
 * lets the prompt say "+N más". Debts at ≤0 (saldadas) are dropped: they are not a lever.
 */
export function debtLevers(
  debts: DebtLeverInput[],
  topN = 6,
): { debts: DebtLever[]; moreCount: number } {
  const mapped: DebtLever[] = debts
    .filter((d) => d.liveBalance > 0.5)
    .map((d) => ({
      name: d.name,
      liveBalance: Math.round(d.liveBalance),
      apr: d.apr,
      minPayment: Math.round(d.minPayment),
      currency: d.currency,
      monthlyInterestCost: d.apr && d.apr > 0 ? Math.round((d.liveBalance * d.apr) / 100 / 12) : 0,
    }))
    .sort((a, b) => b.monthlyInterestCost - a.monthlyInterestCost || b.liveBalance - a.liveBalance);
  return { debts: mapped.slice(0, topN), moreCount: Math.max(0, mapped.length - topN) };
}

const MESES_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

/** "YYYY-MM-DD" + n meses → etiqueta "mes año" (p. ej. "marzo 2027"). PURO, tz-safe (nunca `new Date`);
 *  el horizonte se computa desde userToday. "" si la fecha base es inválida. */
export function addMonthsISO(fromISO: string, n: number): string {
  const [y, m] = fromISO.slice(0, 7).split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return "";
  const total = y! * 12 + (m! - 1) + n;
  const year = Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12; // 0-based, normalizado
  return `${MESES_ES[month]} ${year}`;
}

/** Horizonte de un fondo de defensa: a `aporte`/mes, en cuántos meses se cubre el objetivo y para qué
 *  fecha. `aporte` = el flujo libre (lo que el usuario realmente apartaría). Del engine (target/current
 *  de getDefenseFundsReport), grounded. undefined si ya está cubierto o no hay aporte. */
export type FundEta = {
  monthsToTarget: number;
  etaLabel: string;
  aporte: number;
  currency: string;
};

export function fundEta(
  fund: { current: number; target: number },
  aporte: number,
  todayISO: string,
  currency: string,
): FundEta | undefined {
  const gap = fund.target - fund.current;
  if (gap <= 0 || aporte <= 0) return undefined;
  const months = Math.ceil(gap / aporte);
  return {
    monthsToTarget: months,
    etaLabel: addMonthsISO(todayISO, months),
    aporte: Math.round(aporte),
    currency,
  };
}

/** One goal as a lever: target + deadline + actual pace vs the pace the deadline needs. */
export type GoalLever = {
  name: string;
  target: number;
  currency: string;
  targetDate?: string | null;
  monthlyActual: number;
  /** (target − current) / meses restantes. undefined si no hay fecha (no hay ritmo objetivo). */
  monthlyRequired?: number;
  /** monthlyActual ≥ monthlyRequired. undefined si no hay fecha. */
  onTrack?: boolean;
  /** La fecha objetivo ya pasó (o es este mes): monthlyRequired = todo el faltante. */
  vencida?: boolean;
  /** Meses para llegar al objetivo AL RITMO ACTUAL (gap/monthlyActual). undefined si sin aporte o cubierta. */
  monthsAtPace?: number;
  /** Etiqueta "mes año" de esa ETA al ritmo actual. undefined si no aplica. */
  etaAtPace?: string;
};

export type GoalLeverInput = {
  name: string;
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number;
  targetDate?: string | null;
  currency: string;
};

/** Meses ENTEROS de `fromISO` a `toISO` (parciales no cuentan). Opera sobre "YYYY-MM-DD" —
 *  NUNCA construye Date (timezone-safe; la fecha "hoy" viene de userToday en la tz del usuario).
 *  NaN si alguna fecha es inválida. */
export function monthsBetween(fromISO: string, toISO: string): number {
  const parse = (s: string): [number, number, number] => {
    const [y, m, d] = s.slice(0, 10).split("-").map(Number);
    return [y ?? NaN, m ?? NaN, d ?? NaN];
  };
  const [fy, fm, fd] = parse(fromISO);
  const [ty, tm, td] = parse(toISO);
  if ([fy, fm, fd, ty, tm, td].some((n) => !Number.isFinite(n))) return NaN;
  let months = (ty - fy) * 12 + (tm - fm);
  if (td < fd) months -= 1; // el mes en curso no cuenta hasta cumplir el día
  return months;
}

/**
 * Goals WITH a target, as levers: each carries the pace the deadline requires vs the actual
 * contribution, so the advisor can say "vas a ₡X/mes pero necesitás ₡Y para llegar en la fecha".
 * Ordered by shortfall (most behind first). `todayISO` is injected (userToday) → deterministic.
 */
export function goalLevers(
  goals: GoalLeverInput[],
  todayISO: string,
  topN = 6,
): { goals: GoalLever[]; moreCount: number } {
  const mapped: GoalLever[] = goals
    .filter((g) => g.targetAmount > 0)
    .map((g) => {
      const gap = Math.max(0, g.targetAmount - g.currentAmount);
      let monthlyRequired: number | undefined;
      let onTrack: boolean | undefined;
      let vencida: boolean | undefined;
      if (g.targetDate) {
        const months = monthsBetween(todayISO, g.targetDate);
        if (Number.isFinite(months)) {
          if (months <= 0) {
            vencida = true;
            monthlyRequired = gap; // vencida: hace falta todo el faltante ya
            onTrack = gap <= 0;
          } else {
            monthlyRequired = Math.ceil(gap / months);
            onTrack = g.monthlyContribution >= monthlyRequired;
          }
        }
      }
      // ETA al RITMO ACTUAL (independiente de la fecha objetivo): a lo que aporta hoy, cuándo llega.
      let monthsAtPace: number | undefined;
      let etaAtPace: string | undefined;
      if (g.monthlyContribution > 0 && gap > 0) {
        monthsAtPace = Math.ceil(gap / g.monthlyContribution);
        etaAtPace = addMonthsISO(todayISO, monthsAtPace);
      }
      return {
        name: g.name,
        target: Math.round(g.targetAmount),
        currency: g.currency,
        targetDate: g.targetDate ?? null,
        monthlyActual: Math.round(g.monthlyContribution),
        monthlyRequired: monthlyRequired === undefined ? undefined : Math.round(monthlyRequired),
        onTrack,
        vencida,
        monthsAtPace,
        etaAtPace,
      };
    });
  const shortfall = (g: GoalLever): number => (g.monthlyRequired ?? 0) - g.monthlyActual;
  mapped.sort((a, b) => shortfall(b) - shortfall(a));
  return { goals: mapped.slice(0, topN), moreCount: Math.max(0, mapped.length - topN) };
}

/** One protection gap as a lever: what's uncovered + how severe + why it matters. */
export type ProtectionGapLever = {
  type: string;
  severity: "alto" | "medio" | "bajo";
  description: string;
};

// Reuso del engine de amortización PURO (sin server-only) — import directo del engine, no del barrel,
// para no arrastrar server-only a este módulo puro (lo consumen tests puros y el harness headless).
import { compareExtra } from "@/modules/control/engine/amortization";
// Reuso del engine de proyección de inversión PURO (tools.ts no es server-only; sus deps —debt-strategy,
// validity— también son puras) para el lever de PRÓXIMO NIVEL, sin recalcular el interés compuesto.
import { projectInvestment } from "@/lib/ai/tools";

/**
 * Proyección MENTOR de una deuda: con `extra`/mes de más, cuántos meses antes se salda y cuánto
 * interés se ahorra. Los números salen del ENGINE (amortización), NUNCA del modelo — es el horizonte
 * grounded que convierte "aboná ₡X" en "aboná ₡X → salís N meses antes, ₡Y menos de interés".
 */
export type DebtProjection = {
  name: string;
  extra: number;
  monthsSaved: number;
  interestSaved: number;
  currency: string;
};

/**
 * Proyecciones por deuda a un `extra` mensual (el flujo libre del usuario). Descarta las no
 * proyectables: sin extra, saldada, o cuota que no cubre el interés (la base no amortizaría). Ordena
 * por interés ahorrado desc (lo que más mueve la aguja). Puro y testeable.
 */
export function debtProjections(
  debts: {
    name: string;
    liveBalance: number;
    apr: number | null;
    minPayment: number;
    currency: string;
  }[],
  extra: number,
  topN = 3,
): DebtProjection[] {
  if (extra <= 0) return [];
  const out: DebtProjection[] = [];
  for (const d of debts) {
    if (d.liveBalance <= 0.5 || d.minPayment <= 0) continue;
    const apr = d.apr ?? 0;
    const monthlyInterest = (d.liveBalance * apr) / 100 / 12;
    if (d.minPayment <= monthlyInterest) continue; // la cuota no cubre el interés → base no amortiza
    const cmp = compareExtra(
      { balance: d.liveBalance, apr, monthlyPayment: d.minPayment },
      extra,
      30,
    );
    if (cmp.monthsSaved <= 0 && cmp.interestSaved <= 0) continue;
    out.push({
      name: d.name,
      extra: Math.round(extra),
      monthsSaved: cmp.monthsSaved,
      interestSaved: Math.round(cmp.interestSaved),
      currency: d.currency,
    });
  }
  return out.sort((a, b) => b.interestSaved - a.interestSaved).slice(0, topN);
}

/**
 * PRÓXIMO NIVEL (Paso 3.12): para quien va BIEN y tiene superávit, la acción de OPTIMIZACIÓN grounded —
 * invertir el flujo libre a un rendimiento conservador y ver a cuánto llega en `years` años. Reusa el
 * engine PURO `projectInvestment` (interés compuesto); los inputs (capital invertible + flujo libre) son
 * cifras REALES del contexto. NO decide CUÁNDO usarlo (el gate "sin alarma dura" lo aplica el
 * context-engine): acá solo se computa el hecho si hay flujo que desplegar. undefined si no hay aporte.
 */
export type NextLevelProjection = {
  aporte: number;
  years: number;
  futureValue: number;
  interestEarned: number;
  currency: string;
};

export function nextLevelProjection(
  investable: number,
  freeCashflow: number,
  currency: string,
  years = 10,
  rendPct = 8,
): NextLevelProjection | undefined {
  if (freeCashflow <= 0) return undefined;
  const p = projectInvestment(
    {
      monto_inicial: Math.max(0, investable),
      aporte_mensual: freeCashflow,
      anios: years,
      rendimiento_anual_pct: rendPct,
    },
    currency,
  );
  if (p.valor_futuro <= 0) return undefined;
  return {
    aporte: Math.round(freeCashflow),
    years,
    futureValue: Math.round(p.valor_futuro),
    interestEarned: Math.round(p.interes_ganado),
    currency,
  };
}

/** One expense sobre (leaf) as a lever: its name + real monthly spend. */
export type ExpenseSobreLever = { name: string; monthly: number };

/**
 * ¿El mensaje del usuario nombra un sobre de gasto de su contexto? Devuelve ESE sobre (el más pesado
 * si nombra varios) para que el asesor confronte con SU cifra real, no con el gasto total (el reflejo
 * que ni el dato ni la regla rompieron — Paso 3.9-#2 context-salience). Match por NOMBRE EXACTO del
 * sobre como palabra (sin sinónimos: "restaurantes" matchea el sobre "Restaurantes", "comer afuera"
 * NO). PURO, sin acentos, case-insensitive. undefined si no hay match.
 */
export function detectMencionSobre(
  message: string,
  sobres: ExpenseSobreLever[] | undefined,
): ExpenseSobreLever | undefined {
  if (!sobres || sobres.length === 0 || !message) return undefined;
  const norm = (s: string) =>
    ` ${s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9ñ]+/g, " ")
      .trim()} `;
  const msg = norm(message);
  // Más pesado primero: si nombra varios, confrontá con el que más mueve la aguja.
  for (const s of [...sobres].sort((a, b) => b.monthly - a.monthly)) {
    const name = norm(s.name).trim();
    if (name.length < 3) continue; // nombres muy cortos → ruido
    if (msg.includes(` ${name} `)) return s;
  }
  return undefined;
}

/**
 * Top expense sobres by real monthly spend (name + monto). Existe para que el asesor confronte un
 * gasto que el usuario racionaliza SIN dar el monto ("gasto un montón en restaurantes") con la cifra
 * REAL de ESE sobre — no con el gasto total. Ordena por monto desc, cap topN, descarta ≤0. Los montos
 * ya vienen en la moneda de visualización (getRealTotals usa getDisplayCurrency).
 */
export function expenseSobresLevers(
  sobres: { name: string; monthly: number }[],
  topN = 6,
): ExpenseSobreLever[] {
  return sobres
    .filter((s) => s.monthly > 0 && s.name.trim().length > 0)
    .map((s) => ({ name: s.name, monthly: Math.round(s.monthly) }))
    .sort((a, b) => b.monthly - a.monthly)
    .slice(0, topN);
}

/**
 * Protection gaps from computeProtection, narrowed to the advisor's factual context: type +
 * severity + description. Drops `recommendation` (UI sales copy, not the advisor's to echo).
 */
export function protectionLevers(
  gaps: { type: string; severity: "alto" | "medio" | "bajo"; description: string }[],
): ProtectionGapLever[] {
  return gaps.map((g) => ({ type: g.type, severity: g.severity, description: g.description }));
}

/**
 * La ÚNICA señal más grave del cuadro del usuario, para que el asesor la nombre PRIMERO en una
 * evaluación abierta (mata la blandura tipo "vas estable" ante un incendio). NO inventa un ranking:
 * REUSA la decisión canónica del Priority Engine (`buildControlDiagnosis().nextBestAction`, cuyo
 * `narrative` ya ordena déficit > deuda cara > fondo de emergencia > sano — la MISMA prioridad que
 * la app le muestra al usuario). La enriquece con el costo real de la deuda más cara del contexto.
 * Fallback documentado (solo si no hay diagnóstico del engine): el insight de severidad 'accionar'
 * (que el context-engine ya ordena "lo accionable primero"). undefined = sin señal grave → highlight.
 */
export type PrioritySignalInput = {
  /** El diagnóstico canónico del Priority Engine (getControlSummary().diagnosis). */
  diagnosis?: { semaforo: string; nextBestAction: string; alerts?: string[] };
  debts?: DebtLever[];
  insights?: { severity: string; title: string; action?: string }[];
};

export function prioritySignal(input: PrioritySignalInput): string | undefined {
  const { diagnosis, debts, insights } = input;
  // 1. CANÓNICO: hay prioridad si el semáforo no es verde O el engine levantó una ALERTA (p.ej. fondo
  //    de emergencia vacío — que el engine flaggea aunque el semáforo sea verde). Su nextBestAction
  //    (del `narrative`) ES esa prioridad. Sin esto, un "verde-con-alerta" quedaba sin señal.
  if (
    diagnosis &&
    diagnosis.nextBestAction &&
    (diagnosis.semaforo !== "verde" || (diagnosis.alerts?.length ?? 0) > 0)
  ) {
    const topDebt = (debts ?? [])
      .filter((d) => d.monthlyInterestCost > 0)
      .sort((a, b) => b.monthlyInterestCost - a.monthlyInterestCost)[0];
    // Si la prioridad del engine es una deuda cara, enriquecer con su costo real/mes del contexto.
    if (topDebt && /deuda|tarjeta|pag[áa]|abon/i.test(diagnosis.nextBestAction)) {
      return `Tu ${topDebt.name} al ${topDebt.apr}% te cuesta ~${topDebt.monthlyInterestCost} ${topDebt.currency}/mes — es lo más caro. ${diagnosis.nextBestAction}`;
    }
    return diagnosis.nextBestAction;
  }
  // 2. Fallback: el insight 'accionar' de mayor severidad (ya ordenado por el context-engine).
  const acc = (insights ?? []).find((i) => i.severity === "accionar");
  if (acc) return `${acc.title}${acc.action ? ` — ${acc.action}` : ""}`;
  return undefined; // sin señal grave → el asesor lidera con un highlight
}

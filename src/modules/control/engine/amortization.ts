/**
 * Motor de amortización de deudas (puro, 100% testeable, sin red ni BD).
 *
 * Convenciones:
 *  - Tasa mensual r = TAE efectiva / 100 / 12. En deudas variables, la TAE
 *    efectiva (índice + spread) la calcula el llamador y se pasa como `apr`.
 *  - El seguro se SUMA a la cuota cada mes y NO capitaliza (no reduce saldo).
 *  - Los pagos extra reducen capital directamente.
 */

export interface AmortizationInput {
  /** Saldo actual adeudado. */
  balance: number;
  /** TAE efectiva anual en % (índice + spread para variables). */
  apr: number;
  /** Plazo total en meses (para derivar la cuota si no se da). */
  termMonths?: number | null;
  /** Cuota mensual (columna current_payment). */
  monthlyPayment?: number | null;
  /** Seguro mensual (se suma a la cuota, no capitaliza). */
  insurance?: number | null;
  /** Pago extra mensual recurrente. */
  extraMonthly?: number | null;
  /** Fecha de inicio (para fechar la tabla). */
  startDate?: string | null;
  /** Monto original (para progreso vs saldo). */
  originalAmount?: number | null;
  /** TAE fija (%) durante el periodo introductorio (caso CR: 3 años fija). */
  introApr?: number | null;
  /** Meses iniciales a `introApr` antes de pasar a `apr` (índice+spread). */
  introFixedMonths?: number | null;
}

/** TAE vigente en el mes `m` (1-based): intro durante los primeros meses. */
function aprForMonth(input: AmortizationInput, m: number): number {
  if (input.introApr != null && input.introFixedMonths && m <= input.introFixedMonths) {
    return input.introApr;
  }
  return input.apr ?? 0;
}

export interface ScheduleRow {
  month: number; // 1-based
  date: string | null; // yyyy-mm-dd
  payment: number; // desembolso total del mes (cuota + extra + seguro)
  principal: number;
  interest: number;
  insurance: number;
  balance: number; // saldo tras el pago
}

export interface ScheduleOpts {
  /** Sobrescribe el extra mensual del input. */
  extraMonthly?: number;
  /** Aplica el extra mensual solo los primeros N meses. */
  extraMonths?: number;
  /** Cuota fija (ignora el cálculo por plazo / la del input). */
  paymentOverride?: number;
  /** Extras puntuales por mes (mes 1-based → monto). */
  oneOffExtras?: Record<number, number>;
}

const MAX_MONTHS = 1200;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function addMonths(start: Date, months: number): string {
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, start.getUTCDate()));
  return d.toISOString().slice(0, 10);
}

/** Cuota nivelada (PMT) para saldo B, tasa mensual r y n periodos. */
export function pmt(balance: number, r: number, n: number): number {
  if (n <= 0) return balance;
  if (r === 0) return balance / n;
  return (balance * r) / (1 - Math.pow(1 + r, -n));
}

/** Tabla de amortización mes a mes hasta liquidar (o tope MAX_MONTHS). */
export function buildSchedule(input: AmortizationInput, opts: ScheduleOpts = {}): ScheduleRow[] {
  // Tasa principal (post-intro) para derivar la cuota nivelada por plazo.
  const rMain = (input.apr ?? 0) / 100 / 12;
  const insurance = input.insurance ?? 0;
  const extra = opts.extraMonthly ?? input.extraMonthly ?? 0;
  const extraMonths = opts.extraMonths ?? Infinity;

  let balance = input.balance;
  if (balance <= 0) return [];

  const payment =
    opts.paymentOverride ??
    (input.monthlyPayment && input.monthlyPayment > 0
      ? input.monthlyPayment
      : input.termMonths && input.termMonths > 0
        ? pmt(balance, rMain, input.termMonths)
        : 0);
  if (payment <= 0) return [];

  const start = input.startDate ? new Date(input.startDate) : null;
  const rows: ScheduleRow[] = [];

  for (let m = 1; m <= MAX_MONTHS && balance > 0.005; m++) {
    const r = aprForMonth(input, m) / 100 / 12; // intro durante los primeros meses
    const interest = balance * r;
    const principalFromPayment = payment - interest;
    const extraThis = (m <= extraMonths ? extra : 0) + (opts.oneOffExtras?.[m] ?? 0);

    // Si la cuota no cubre ni el interés y no hay extra, el saldo no baja.
    if (principalFromPayment <= 0 && extraThis <= 0) break;

    let principal = principalFromPayment + extraThis;
    if (principal > balance) principal = balance; // último mes
    balance -= principal;

    rows.push({
      month: m,
      date: start ? addMonths(start, m - 1) : null,
      payment: round2(interest + principal + insurance),
      principal: round2(principal),
      interest: round2(interest),
      insurance: round2(insurance),
      balance: round2(Math.max(0, balance)),
    });
  }
  return rows;
}

function sumInterest(rows: ScheduleRow[]): number {
  return rows.reduce((s, r) => s + r.interest, 0);
}

/** ¿La deuda se liquida dentro del tope? */
export function paysOff(rows: ScheduleRow[]): boolean {
  return rows.length > 0 && rows.length < MAX_MONTHS && (rows[rows.length - 1]!.balance ?? 0) <= 0.01;
}

export interface ExtraComparison {
  monthsSaved: number;
  interestSaved: number;
  newPayoffMonths: number;
  newPayoffDate: string | null;
}

/**
 * "Pago $X extra durante Y años" → meses ahorrados, interés ahorrado y nueva
 * fecha de liquidación, comparado con la línea base sin extra.
 */
export function compareExtra(
  input: AmortizationInput,
  extraMensual: number,
  years: number,
): ExtraComparison {
  const base = buildSchedule(input, { extraMonthly: 0 });
  const withExtra = buildSchedule(input, {
    extraMonthly: extraMensual,
    extraMonths: Math.round(years * 12),
  });
  const last = withExtra[withExtra.length - 1];
  return {
    monthsSaved: Math.max(0, base.length - withExtra.length),
    interestSaved: Math.max(0, round2(sumInterest(base) - sumInterest(withExtra))),
    newPayoffMonths: withExtra.length,
    newPayoffDate: last?.date ?? null,
  };
}

/**
 * "Quiero salir en N meses" → extra mensual requerido (búsqueda binaria).
 * Devuelve 0 si ya se liquida a tiempo sin extra.
 */
export function solveExtraForTarget(input: AmortizationInput, targetMonths: number): number {
  const base = buildSchedule(input, { extraMonthly: 0 });
  if (base.length <= targetMonths) return 0;

  let lo = 0;
  let hi = Math.max(input.balance, (input.monthlyPayment ?? 0) * 2, 1);
  // Asegura que hi logre el objetivo.
  for (let i = 0; i < 12; i++) {
    const months = buildSchedule(input, { extraMonthly: hi }).length;
    if (months <= targetMonths) break;
    hi *= 2;
  }
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    const months = buildSchedule(input, { extraMonthly: mid }).length;
    if (months <= targetMonths) hi = mid;
    else lo = mid;
  }
  return round2(hi);
}

export interface ExtraDecision {
  mode: "tiempo" | "cuota";
  months: number;
  totalInterest: number;
  monthlyPayment: number;
  /** Interés ahorrado vs. la línea base sin el extra. */
  interestSaved: number;
}

/**
 * Aplica un pago extra puntual y decide su efecto:
 *  - 'tiempo' → mantiene la cuota; el extra acorta el plazo (más ahorro de interés).
 *  - 'cuota'  → mantiene el plazo restante original; recalcula una cuota menor.
 */
export function applyExtraDecision(
  input: AmortizationInput,
  extra: number,
  mode: "tiempo" | "cuota",
): ExtraDecision {
  const r = (input.apr ?? 0) / 100 / 12;
  const baseRows = buildSchedule(input, { extraMonthly: 0 });
  const baseInterest = sumInterest(baseRows);
  const basePayment =
    input.monthlyPayment && input.monthlyPayment > 0
      ? input.monthlyPayment
      : pmt(input.balance, r, input.termMonths ?? baseRows.length);

  const newBalance = Math.max(0, input.balance - extra);

  if (mode === "tiempo") {
    const rows = buildSchedule({ ...input, balance: newBalance }, { paymentOverride: basePayment });
    return {
      mode,
      months: rows.length,
      totalInterest: round2(sumInterest(rows)),
      monthlyPayment: round2(basePayment),
      interestSaved: round2(baseInterest - sumInterest(rows)),
    };
  }

  // 'cuota': conserva el plazo restante original, baja la cuota.
  const n = baseRows.length;
  const newPayment = pmt(newBalance, r, n);
  const rows = buildSchedule({ ...input, balance: newBalance }, { paymentOverride: newPayment });
  return {
    mode,
    months: rows.length,
    totalInterest: round2(sumInterest(rows)),
    monthlyPayment: round2(newPayment),
    interestSaved: round2(baseInterest - sumInterest(rows)),
  };
}

export interface PaymentRecord {
  paymentDate: string;
  amount: number;
  extraAmount?: number;
}

export interface RecomputeResult {
  currentBalance: number;
  paidPrincipal: number;
  paidInterest: number;
  progressPct: number; // 0-1
  projectedPayoffMonths: number;
  projectedPayoffDate: string | null;
}

/**
 * Recalcula el saldo actual y el payoff proyectado a partir de los pagos
 * reportados (fuente de la verdad). Cada pago se trata como un periodo mensual:
 * interés = saldo·r, capital = (cuota − interés) + extra.
 */
export function recomputeFromPayments(
  input: AmortizationInput,
  payments: PaymentRecord[],
): RecomputeResult {
  const r = (input.apr ?? 0) / 100 / 12;
  const original = input.originalAmount ?? input.balance;
  let balance = original;
  let paidPrincipal = 0;
  let paidInterest = 0;

  const sorted = [...payments].sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
  for (const p of sorted) {
    const interest = balance * r;
    let principal = p.amount - interest + (p.extraAmount ?? 0);
    if (principal < 0) principal = 0;
    if (principal > balance) principal = balance;
    balance -= principal;
    paidPrincipal += principal;
    paidInterest += Math.min(interest, p.amount);
  }

  const projected = buildSchedule({ ...input, balance }, {});
  const last = projected[projected.length - 1];
  return {
    currentBalance: round2(Math.max(0, balance)),
    paidPrincipal: round2(paidPrincipal),
    paidInterest: round2(paidInterest),
    progressPct: original > 0 ? Math.min(1, paidPrincipal / original) : 0,
    projectedPayoffMonths: projected.length,
    projectedPayoffDate: last?.date ?? null,
  };
}

/** Desglose de un pago total contra la cuota vigente (Fase 7 · pagos vía Gastos). */
export type PaymentSplit = {
  /** Parte que cuenta como cuota (≤ total pagado). */
  amount: number;
  /** Excedente sobre la cuota: amortiza capital directo. */
  extraAmount: number;
  /** Capital estimado del pago completo (null sin tasa registrada). */
  principal: number | null;
  /** Interés estimado del mes (null sin tasa registrada). */
  interest: number | null;
};

/**
 * Divide un pago total en cuota + extra y estima capital/interés con la
 * misma regla que recomputeFromPayments (interés del mes = saldo × r).
 * Si la cuota vigente no se conoce (≤ 0), todo el pago cuenta como cuota.
 * Sin tasa (apr ≤ 0) no se estima el split capital/interés.
 */
export function estimatePaymentSplit(args: {
  totalPaid: number;
  cuota: number;
  balance: number;
  apr: number | null;
}): PaymentSplit {
  const cuota = args.cuota > 0 ? args.cuota : args.totalPaid;
  const amount = round2(Math.min(args.totalPaid, cuota));
  const extraAmount = round2(Math.max(0, args.totalPaid - cuota));

  if (!args.apr || args.apr <= 0) {
    return { amount, extraAmount, principal: null, interest: null };
  }
  const r = args.apr / 100 / 12;
  const interest = round2(Math.min(args.balance * r, amount));
  const principal = round2(Math.min(Math.max(0, args.totalPaid - interest), args.balance));
  return { amount, extraAmount, principal, interest };
}

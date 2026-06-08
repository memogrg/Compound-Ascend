/**
 * Cálculo puro de la próxima fecha de pago de una deuda y si está por vencer.
 * Sin red ni BD (testeable). La fecha de pago se infiere del día de pago
 * (`payDay`) o, en su defecto, del día del mes de `startDate`. "Pagado este mes"
 * se determina con las fechas de pagos reportados.
 */

export interface DueStatus {
  /** Próxima fecha de pago estimada (yyyy-mm-dd) o null si no se puede inferir. */
  nextDue: string | null;
  /** Días hasta el próximo vencimiento (negativo = vencido). */
  daysUntil: number | null;
  /** True si falta(n) ≤ umbral días y no se ha pagado este mes (incluye vencido). */
  dueSoon: boolean;
  /** True si ya hay un pago reportado en el mes calendario actual. */
  paidThisMonth: boolean;
}

const DAY_MS = 86_400_000;

function isoUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Fecha (UTC) para year/month0/day, recortando el día al largo del mes. */
function dateFor(year: number, month0: number, day: number): Date {
  const lastDay = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month0, Math.min(day, lastDay)));
}

export function computeDueStatus(
  opts: { payDay?: number | null; startDate?: string | null; paymentDates?: string[] },
  today: Date = new Date(),
  thresholdDays = 2,
): DueStatus {
  const dom =
    opts.payDay && opts.payDay >= 1 && opts.payDay <= 31
      ? opts.payDay
      : opts.startDate
        ? new Date(`${opts.startDate}T00:00:00Z`).getUTCDate()
        : null;

  if (!dom || Number.isNaN(dom)) {
    return { nextDue: null, daysUntil: null, dueSoon: false, paidThisMonth: false };
  }

  const y = today.getUTCFullYear();
  const m0 = today.getUTCMonth();
  const ym = isoUTC(today).slice(0, 7);
  const paidThisMonth = (opts.paymentDates ?? []).some((d) => d.slice(0, 7) === ym);

  const thisMonthDue = dateFor(y, m0, dom);
  const nextDueDate = paidThisMonth ? dateFor(y, m0 + 1, dom) : thisMonthDue;

  const todayMidnight = Date.UTC(y, m0, today.getUTCDate());
  const daysUntil = Math.round((nextDueDate.getTime() - todayMidnight) / DAY_MS);

  return {
    nextDue: isoUTC(nextDueDate),
    daysUntil,
    dueSoon: !paidThisMonth && daysUntil <= thresholdDays,
    paidThisMonth,
  };
}

/**
 * Recurrencia de frascos de ahorro (puro, testeable). Cadencias de reinicio por
 * período y la aritmética del reinicio con arrastre (el sobrante se conserva).
 */
export type Recurrence = "ninguna" | "mensual" | "trimestral" | "semestral" | "anual";

export const RECURRENCES: Recurrence[] = [
  "ninguna",
  "mensual",
  "trimestral",
  "semestral",
  "anual",
];

const CADENCE_MONTHS: Record<Exclude<Recurrence, "ninguna">, number> = {
  mensual: 1,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

/**
 * Suma una cadencia a una fecha ISO (yyyy-mm-dd), en UTC. 'ninguna' devuelve la
 * misma fecha. El overflow de mes lo maneja Date.UTC (p.ej. 31-ene + 1 mes cae
 * en marzo), aceptable para fechas de anclaje.
 */
export function addCadence(dateISO: string, recurrence: Recurrence): string {
  if (recurrence === "ninguna") return dateISO;
  const months = CADENCE_MONTHS[recurrence];
  const d = new Date(dateISO);
  const nd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()));
  return nd.toISOString().slice(0, 10);
}

export interface ResetResult {
  /** Nuevo target_amount = plan pleno del período (period_amount). */
  restoredTarget: number;
  /** current_amount que se arrastra (no cambia); informativo para el historial. */
  carriedOver: number;
  /** Próxima fecha de reinicio, ya avanzada más allá de hoy. */
  nextResetOn: string;
  /** Cuántas cadencias avanzó (≥1 si venció; 0 si todavía no tocaba). */
  cyclesRolled: number;
}

/**
 * Calcula el reinicio de un frasco recurrente (puro, idempotente):
 *   · target vuelve a `periodAmount`;
 *   · `current` se ARRASTRA (no se toca aquí — el caller no lo modifica);
 *   · `nextResetOn` avanza en bucle hasta quedar > hoy (cubre días que el cron
 *     no corrió sin acumular varios reinicios de más).
 * Comparación de fechas ISO por string (lexicográfico = cronológico).
 */
export function computeReset(args: {
  periodAmount: number;
  currentAmount: number;
  nextResetOn: string;
  recurrence: Recurrence;
  todayISO: string;
}): ResetResult {
  let next = args.nextResetOn;
  let cycles = 0;
  // Avanza mientras la fecha de reinicio sea hoy o antes (vencida).
  while (next <= args.todayISO && args.recurrence !== "ninguna") {
    next = addCadence(next, args.recurrence);
    cycles += 1;
    if (cycles > 1200) break; // guard anti-bucle (100 años de mensual)
  }
  return {
    restoredTarget: args.periodAmount,
    carriedOver: args.currentAmount,
    nextResetOn: next,
    cyclesRolled: cycles,
  };
}

/**
 * Deriva los campos de recurrencia al crear/editar un frasco:
 *   · 'ninguna' → period_amount y next_reset_on en null (frasco one-shot).
 *   · recurrente → period_amount = periodAmount ?? targetAmount; el primer
 *     next_reset_on es el targetDate si se dio, si no hoy + 1 cadencia.
 */
export function deriveRecurrenceFields(args: {
  recurrence: Recurrence;
  targetAmount: number;
  periodAmount?: number | null;
  targetDate?: string | null;
  todayISO: string;
}): { periodAmount: number | null; nextResetOn: string | null } {
  if (args.recurrence === "ninguna") {
    return { periodAmount: null, nextResetOn: null };
  }
  const periodAmount = args.periodAmount != null ? args.periodAmount : args.targetAmount;
  const nextResetOn = args.targetDate
    ? args.targetDate
    : addCadence(args.todayISO, args.recurrence);
  return { periodAmount, nextResetOn };
}

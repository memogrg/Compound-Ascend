/**
 * Agenda de una fuente recurrente: en QUÉ meses cae su pago — motor puro.
 *
 * Las frecuencias multi-mes (bimensual, trimestral, cuatrimestral, semestral,
 * anual) necesitan un ANCLA de tiempo: sin ella no se sabe si un bimestral cae
 * en enero/marzo/mayo o en febrero/abril/junio, y el sistema termina tratándolo
 * como si llegara todos los meses (que era el bug).
 *
 * El ancla se guarda en `recurring_items.next_date` y es ESTABLE: no es un
 * cursor que avanza, es la fecha del primer pago conocido; la fase se deriva de
 * ahí para siempre. Eso hace que agendar sea idempotente y que reconstruir un
 * mes viejo dé el mismo resultado que la primera vez.
 */
import { mesesEntrePagos, type Frequency } from "./monthlyize";

export type PeriodoRef = { year: number; month: number };

/** Meses de distancia con signo entre dos periodos (b − a). */
export function mesesEntre(a: PeriodoRef, b: PeriodoRef): number {
  return (b.year - a.year) * 12 + (b.month - a.month);
}

/** Parsea el ancla `YYYY-MM-DD` a periodo. Devuelve null si no es utilizable. */
export function periodoDeAncla(nextDate: string | null | undefined): PeriodoRef | null {
  if (!nextDate) return null;
  const m = /^(\d{4})-(\d{2})/.exec(nextDate);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return { year, month };
}

/**
 * ¿A esta fuente le toca pago en `periodo`?
 *
 * - `unico` nunca se agenda (es un extraordinario, se registra a mano).
 * - Frecuencias de un pago al mes o más (diario…mensual, variable): todos los meses.
 * - Multi-mes CON ancla: sólo en los meses en fase con el ancla, y nunca antes de ella.
 * - Multi-mes SIN ancla: cae todos los meses. Es el comportamiento viejo, y se
 *   conserva a propósito para no hacer desaparecer las fuentes ya cargadas sin
 *   ancla; la UI pide el ancla al crear, así que sólo las heredadas caen acá.
 */
export function caeEnElPeriodo(
  frequency: Frequency,
  nextDate: string | null | undefined,
  periodo: PeriodoRef,
): boolean {
  if (frequency === "unico") return false;

  const cada = mesesEntrePagos(frequency);
  if (cada <= 1) return true;

  const ancla = periodoDeAncla(nextDate);
  if (!ancla) return true; // heredada sin ancla → como antes

  const delta = mesesEntre(ancla, periodo);
  if (delta < 0) return false; // el periodo es anterior al primer pago
  return delta % cada === 0;
}

/** ¿Esta frecuencia exige preguntar el ancla al crear la fuente? */
export function requiereAncla(frequency: Frequency): boolean {
  return frequency !== "unico" && mesesEntrePagos(frequency) > 1;
}

/**
 * Los próximos `cantidad` periodos en que cae el pago, a partir de `desde`
 * (inclusive). Para previsualizar la agenda en el formulario ("enero, marzo,
 * mayo…") y para tests.
 */
export function proximosPeriodos(
  frequency: Frequency,
  nextDate: string | null | undefined,
  desde: PeriodoRef,
  cantidad: number,
): PeriodoRef[] {
  const out: PeriodoRef[] = [];
  const cada = mesesEntrePagos(frequency);
  let cursor = { ...desde };
  // Cota dura: como mucho se inspecciona un pago por vuelta más un margen.
  for (let i = 0; i < cantidad * cada + 12 && out.length < cantidad; i++) {
    if (caeEnElPeriodo(frequency, nextDate, cursor)) out.push({ ...cursor });
    cursor =
      cursor.month === 12
        ? { year: cursor.year + 1, month: 1 }
        : { year: cursor.year, month: cursor.month + 1 };
  }
  return out;
}

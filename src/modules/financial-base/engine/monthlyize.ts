/**
 * Mensualización: convierte cualquier monto+frecuencia a su equivalente mensual.
 * Concepto central de la Base Financiera (Biblia, Módulo 2).
 */

export type Frequency =
  | "diario"
  | "semanal"
  | "quincenal"
  | "mensual"
  | "bimensual"
  | "trimestral"
  | "cuatrimestral"
  | "semestral"
  | "anual"
  | "unico"
  | "variable";

/**
 * Factor por el que se multiplica el monto para obtener el equivalente mensual.
 * - `unico`: 0 (no es recurrente; se trata aparte como extraordinario).
 * - `variable`: 1 (se asume que el usuario ingresa un estimado mensual).
 */
const FACTORS: Record<Frequency, number> = {
  diario: 30,
  semanal: 52 / 12,
  quincenal: 2,
  mensual: 1,
  bimensual: 0.5, // cada 2 meses
  trimestral: 1 / 3,
  cuatrimestral: 1 / 4,
  semestral: 1 / 6,
  anual: 1 / 12,
  unico: 0,
  variable: 1,
};

/** Devuelve el monto mensualizado (redondeado a 2 decimales). */
export function monthlyize(amount: number, frequency: Frequency): number {
  const factor = FACTORS[frequency] ?? 0;
  return Math.round(amount * factor * 100) / 100;
}

export const FREQUENCY_FACTORS = FACTORS;

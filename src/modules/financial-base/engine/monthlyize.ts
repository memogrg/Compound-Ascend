/**
 * Mensualización: convierte cualquier monto+frecuencia a su equivalente mensual.
 * Concepto central de la Base Financiera (Biblia, Módulo 2).
 *
 * SEMÁNTICA ÚNICA DEL MONTO (regla de producto, no negociable):
 * el monto de una fuente/ítem es SIEMPRE **lo que se recibe o se paga POR PAGO**
 * — por quincena, por semana, por bimestre —, nunca un total mensual ya
 * prorrateado. Es como piensa la gente: "mi quincena es de ₡800.000".
 * Todo consumidor del monto se alinea a eso; los dos números que se derivan de
 * ahí son distintos y NO son intercambiables:
 *
 *   · `monthlyize`     → PROMEDIO mensual. Para indicadores y comparaciones
 *                        (tasa de ahorro, DTI, presión financiera). Una fuente
 *                        bimestral de ₡500.000 promedia ₡250.000/mes.
 *   · `monthlyPlanned` → FLUJO del mes en que la línea existe. Una fuente
 *                        bimestral de ₡500.000 aporta ₡500.000 en enero y
 *                        NADA en febrero (en febrero no hay línea).
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Devuelve el monto mensualizado (redondeado a 2 decimales). */
export function monthlyize(amount: number, frequency: Frequency): number {
  const factor = FACTORS[frequency] ?? 0;
  return round2(amount * factor);
}

/**
 * ¿La frecuencia entrega MÁS DE UN pago por mes? (diario, semanal, quincenal).
 * Es la bisagra entre los dos regímenes: sub-mensual = la línea del mes agrupa
 * varios pagos; mensual o más larga = la línea del mes ES un pago.
 */
export function esSubMensual(frequency: Frequency): boolean {
  return (FACTORS[frequency] ?? 1) > 1;
}

/**
 * Cada cuántos meses cae un pago. 1 para mensual y sub-mensual (cae todos los
 * meses); 2 para bimensual, 3 trimestral, 4 cuatrimestral, 6 semestral,
 * 12 anual. `unico` y `variable` no tienen periodicidad multi-mes → 1.
 */
export function mesesEntrePagos(frequency: Frequency): number {
  const factor = FACTORS[frequency] ?? 1;
  if (!(factor > 0) || factor >= 1) return 1;
  return Math.round(1 / factor);
}

/**
 * Aporte al FLUJO del mes en el que la línea del periodo existe.
 *
 * - Sub-mensual (factor > 1): el mes agrupa varios pagos → monto × factor.
 *   Una quincena de ₡800.000 son ₡1.600.000 en el mes.
 * - Mensual o más larga (factor ≤ 1): la línea sólo existe en el mes en que
 *   TOCA el pago (la agenda de `income-schedule` se encarga de eso), así que
 *   ese mes recibe el pago PLENO — no el promedio. Un bimestral de ₡500.000
 *   aporta ₡500.000 en enero; en febrero simplemente no hay línea que sumar.
 *
 * Prorratear acá sería contar el promedio Y saltarse los meses sin pago: la
 * fuente se subestimaría a la mitad. `monthlyize` es el promedio; esto es el flujo.
 */
export function monthlyPlanned(amount: number, frequency: Frequency): number {
  const factor = FACTORS[frequency] ?? 1;
  if (factor > 1) return round2(amount * factor);
  if (factor === 0) return round2(amount); // 'unico': el mes en que se registró
  return round2(amount);
}

export const FREQUENCY_FACTORS = FACTORS;

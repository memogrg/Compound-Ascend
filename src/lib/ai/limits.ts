/**
 * Límites de uso de My Agent C+ por plan (módulo puro, testeable, sin
 * server-only).
 *
 * Se miden en tokens porque es lo que consume el modelo, pero ESA PALABRA NO
 * SALE NUNCA a la interfaz: al cliente le importa cuánto puede usar su asesor,
 * no cuántos tokens gasta. Lo que se le muestra vive en `AGENT_LEVEL`
 * (@/lib/plan) como nivel de acompañamiento.
 *
 * `ninguno` no es un tier gratuito: es una cuenta sin suscripción, y el chat le
 * está cerrado por `PLAN_FEATURES`. El cero de acá es el cinturón de seguridad
 * por si alguna ruta se saltara ese gate.
 */

/**
 * Cuánto rinde cada cupo, medido sobre el consumo REAL de producción
 * (`ai_usage_ledger`, 144 consultas): ~16.500 tokens por consulta en agosto y
 * setiembre de 2026, y ~24.800 en las consultas pesadas. De ahí salen los rangos.
 *
 * Los cupos anteriores (400 k / 1,5 M / 4 M) estaban puestos como si la IA fuera
 * cara. No lo es: con gemini-3.1-flash-lite a $0,25 el millón de entrada —y la
 * entrada es el 99 % del gasto, 143 tokens de contexto por cada uno de respuesta—
 * los 400 k de Esencial costaban 10 centavos al mes en el peor caso, y daban para
 * una consulta cada día y medio. El cupo no protegía el margen; limitaba el
 * producto. Estos cupos cuestan entre 3 % y 5,5 % del precio del plan en el techo,
 * que es donde debía estar desde el principio.
 *
 *   esencial   2M → ~120 consultas/mes (4 por día)   techo $0,52   3,0 % de $17
 *   pro        5M → ~300 consultas/mes (10 por día)  techo $1,29   3,8 % de $34
 *   max       10M → ~600 consultas/mes (20 por día)  techo $2,59   5,5 % de $47
 *
 * Al mover uno hay que mover los tres: la escalera tiene que quedar creciente o
 * un plan más caro compra menos que el de abajo.
 */
export const PLAN_TOKEN_LIMITS = {
  ninguno: 0,
  esencial: 2_000_000,
  pro: 5_000_000,
  max: 10_000_000,
} as const;

export type PlanConLimite = keyof typeof PLAN_TOKEN_LIMITS;

/**
 * `plan` acepta `string` por lo mismo que `aiTokenLimit` (ver @/lib/plan): el
 * valor sale de la base, no del sistema de tipos. Un plan desconocido no tiene
 * cupo — se bloquea, no se abre por defecto.
 */
export function isWithinLimit(plan: PlanConLimite | (string & {}), tokensUsed: number): boolean {
  return tokensUsed < (PLAN_TOKEN_LIMITS[plan as PlanConLimite] ?? 0);
}

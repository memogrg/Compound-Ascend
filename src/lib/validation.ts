/**
 * Helpers de validación Zod compartidos.
 */
import { z } from "zod";

export const NOT_FUTURE_MSG = "La fecha no puede ser futura.";

/**
 * "Hoy" en formato YYYY-MM-DD (UTC). Se evalúa en cada validación.
 *
 * Se usa UTC (no la zona del usuario) a propósito: así el límite es ligeramente
 * permisivo cerca de medianoche y NUNCA rechaza por error una fecha local válida
 * de hoy o del pasado (a lo sumo deja pasar ~1 día de margen).
 */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Predicado: la fecha YYYY-MM-DD no es futura. */
export const notFutureDate = (d: string): boolean => d <= todayISO();

/**
 * Fecha YYYY-MM-DD de un evento que YA ocurrió (compra, venta, dividendo, renta,
 * pago): no puede ser futura. Para fechas a futuro legítimas (metas, vencimientos,
 * renovaciones) NO usar esto.
 */
export const pastDateSchema = z
  .string()
  .date()
  .refine(notFutureDate, { message: NOT_FUTURE_MSG });

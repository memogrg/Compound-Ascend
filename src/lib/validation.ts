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

/**
 * "Hoy" en formato YYYY-MM-DD según la zona LOCAL del dispositivo. Para el DEFAULT de fecha
 * de los formularios de captura (cliente): un movimiento a las 7pm en Costa Rica (UTC-6) debe
 * fecharse HOY, no mañana. `todayISO()` (UTC) haría lo segundo y lo dejaría fuera del corte
 * "de hoy" del frasco.
 *
 * NO usar en el SERVIDOR (Vercel corre en UTC: ahí "local" es UTC y no aporta nada). Los
 * validadores (`notFutureDate`/`pastDateSchema`) y los cálculos canónicos siguen con
 * `todayISO()`. Recibe la fecha por parámetro para poder fijarla en un test.
 */
export function todayLocalISO(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Predicado: la fecha YYYY-MM-DD no es futura. */
export const notFutureDate = (d: string): boolean => d <= todayISO();

/**
 * Fecha YYYY-MM-DD de un evento que YA ocurrió (compra, venta, dividendo, renta,
 * pago): no puede ser futura. Para fechas a futuro legítimas (metas, vencimientos,
 * renovaciones) NO usar esto.
 */
export const pastDateSchema = z.string().date().refine(notFutureDate, { message: NOT_FUTURE_MSG });

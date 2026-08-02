// Núcleo PURO del tiempo del usuario (sin sesión, sin cookies, sin server-only): solo
// aritmética de calendario por zona vía `Intl`. Vive aparte de user-time.ts para poder
// probarse en el entorno node de vitest sin arrastrar next/headers ni la sesión.
import { monthPeriod } from "@/modules/financial-base/engine/period";
import type { Period } from "@/modules/financial-base/types";
import { todayLocalISO } from "@/lib/validation";

/** Nombre de la cookie que transporta la zona al primer render server. */
export const TZ_COOKIE = "tz";

const pad = (n: number): string => String(n).padStart(2, "0");

/** Valida que `tz` sea una zona IANA real (Intl lanza RangeError si no lo es). */
export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Año/mes/día (Gregoriano) del instante `at` en la zona `tz`. */
export function ymdInTz(
  tz: string,
  at: Date = new Date(),
): { year: number; month: number; day: number } {
  // en-CA formatea como YYYY-MM-DD; formatToParts evita depender del orden del locale.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const val = (t: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { year: val("year"), month: val("month"), day: val("day") };
}

/** "YYYY-MM-DD" del instante `at` en la zona `tz`. */
export function todayISOInTz(tz: string, at: Date = new Date()): string {
  const { year, month, day } = ymdInTz(tz, at);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Periodo mensual del instante `at` en la zona `tz`. */
export function currentPeriodInTz(tz: string, at: Date = new Date()): Period {
  const { year, month } = ymdInTz(tz, at);
  return monthPeriod(year, month);
}

/**
 * "Hoy" para el DEFAULT de fecha de una captura en el CLIENTE.
 *
 * Con la zona del PERFIL conocida se calcula en ella, para que el día que propone el
 * formulario sea el MISMO que el servidor considera "hoy" (`userToday()`): si no, un
 * gasto capturado a las 11pm podía guardarse en un día y caer en el corte del otro.
 * Sin zona conocida (todavía no se capturó) cae a la del dispositivo, que sigue siendo
 * mejor que UTC. `at` se inyecta para poder fijar el instante en un test.
 */
export function captureToday(tz: string | null | undefined, at: Date = new Date()): string {
  return isValidTimeZone(tz) ? todayISOInTz(tz, at) : todayLocalISO(at);
}

/** Hora (0-23) del instante `at` en la zona `tz` (para saludos por franja del día). */
export function hourInTz(tz: string, at: Date = new Date()): number {
  const h = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(at)
    .find((p) => p.type === "hour")?.value;
  return Number(h ?? 0);
}

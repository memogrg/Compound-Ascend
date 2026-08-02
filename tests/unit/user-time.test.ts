import { describe, it, expect } from "vitest";
import {
  ymdInTz,
  todayISOInTz,
  currentPeriodInTz,
  captureToday,
  hourInTz,
  isValidTimeZone,
} from "@/lib/time/user-time-core";

// El instante del bug: 2026-08-01T02:00:00Z es el 31-jul 20:00 en Costa Rica (UTC−6),
// pero ya es 1-ago en UTC y al este. El servidor (UTC) veía agosto; el usuario, julio.
const AT = new Date("2026-08-01T02:00:00Z");

describe("user-time-core (calendario por zona, puro)", () => {
  it("Costa Rica (UTC−6): el instante cae en JULIO (no agosto)", () => {
    expect(ymdInTz("America/Costa_Rica", AT)).toEqual({ year: 2026, month: 7, day: 31 });
    expect(todayISOInTz("America/Costa_Rica", AT)).toBe("2026-07-31");
    const p = currentPeriodInTz("America/Costa_Rica", AT);
    expect(p.month).toBe(7);
    expect(p.year).toBe(2026);
    expect(p.label).toBe("jul 2026");
  });

  it("UTC: el MISMO instante ya es agosto (lo que veía el servidor)", () => {
    expect(todayISOInTz("UTC", AT)).toBe("2026-08-01");
    expect(currentPeriodInTz("UTC", AT).month).toBe(8);
  });

  it("Kiritimati (UTC+14): su 'hoy' es 1-ago", () => {
    expect(ymdInTz("Pacific/Kiritimati", AT)).toEqual({ year: 2026, month: 8, day: 1 });
    expect(currentPeriodInTz("Pacific/Kiritimati", AT).month).toBe(8);
  });

  it("la hora local sale de la zona, no del servidor", () => {
    expect(hourInTz("America/Costa_Rica", AT)).toBe(20); // 8pm en CR
    expect(hourInTz("UTC", AT)).toBe(2);
    expect(hourInTz("Pacific/Kiritimati", AT)).toBe(16);
  });

  it("valida zonas IANA reales", () => {
    expect(isValidTimeZone("America/Costa_Rica")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Marte/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
  });
});

/**
 * `captureToday` es el default de fecha de los formularios de captura del asistente. El caso
 * que importa es cerca de MEDIANOCHE: ahí el día del dispositivo y el del perfil se separan,
 * y el gasto tiene que caer en el día que el resto de la app —que calcula con `userToday()`,
 * la zona del perfil— considera hoy.
 */
describe("captureToday · captura cerca de medianoche", () => {
  // 22:30 en Costa Rica del 31-jul. En UTC ya es 1-ago 04:30.
  const CASI_MEDIANOCHE = new Date("2026-08-01T04:30:00Z");

  it("perfil en Costa Rica: a las 22:30 el gasto se fecha HOY (31-jul), no mañana", () => {
    expect(captureToday("America/Costa_Rica", CASI_MEDIANOCHE)).toBe("2026-07-31");
    // Es lo mismo que responde el servidor para ese instante y esa zona: un solo "hoy".
    expect(captureToday("America/Costa_Rica", CASI_MEDIANOCHE)).toBe(
      todayISOInTz("America/Costa_Rica", CASI_MEDIANOCHE),
    );
  });

  it("el MISMO instante en un perfil de Tokio ya es 1-ago (la zona manda, no el instante)", () => {
    expect(captureToday("Asia/Tokyo", CASI_MEDIANOCHE)).toBe("2026-08-01");
  });

  it("sin zona conocida cae al dispositivo, nunca a UTC a ciegas", () => {
    // El entorno de test corre en la zona local del runner: lo comprobable es que NO se
    // comporta como UTC salvo que el runner esté en UTC, y que sigue dando un ISO válido.
    const local = captureToday(null, CASI_MEDIANOCHE);
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const offsetMin = CASI_MEDIANOCHE.getTimezoneOffset();
    expect(local).toBe(offsetMin === 0 ? "2026-08-01" : todayISOInTz(localTz(), CASI_MEDIANOCHE));
  });

  it("una zona basura (cookie corrupta) no explota: cae al dispositivo", () => {
    expect(captureToday("Marte/Olympus", CASI_MEDIANOCHE)).toBe(
      captureToday(null, CASI_MEDIANOCHE),
    );
  });
});

/** Zona del runner de tests, para comparar contra el fallback de dispositivo. */
function localTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

import { describe, it, expect } from "vitest";
import {
  ymdInTz,
  todayISOInTz,
  currentPeriodInTz,
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

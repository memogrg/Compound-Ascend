import { describe, it, expect } from "vitest";
import {
  reviewCutoff,
  isProfileStale,
  reminderKey,
  selectResolvable,
} from "@/lib/insights/profile-review";

const NOW = new Date("2026-07-22T12:00:00Z");

describe("profile-review · helpers puros", () => {
  it("reviewCutoff resta 6 meses", () => {
    expect(reviewCutoff(NOW).toISOString().slice(0, 10)).toBe("2026-01-22");
  });

  it("isProfileStale: ≥6 meses → true; <6 meses → false", () => {
    expect(isProfileStale("2025-12-01T00:00:00Z", NOW)).toBe(true); // ~7.5 meses
    expect(isProfileStale("2026-06-01T00:00:00Z", NOW)).toBe(false); // ~1.5 meses
    // Justo en el borde (mismo día del corte) NO es viejo (estricto <).
    expect(isProfileStale("2026-01-22T12:00:00Z", NOW)).toBe(false);
    expect(isProfileStale("no-es-fecha", NOW)).toBe(false);
  });

  it("reminderKey = fecha (YYYY-MM-DD) de la última actualización (clave de ventana)", () => {
    expect(reminderKey("2026-01-15T09:30:00Z")).toBe("2026-01-15");
  });

  it("selectResolvable: resuelve los reminders activos de usuarios YA frescos", () => {
    const actives = [
      { id: "r1", userId: "u1" }, // u1 sigue viejo → NO se resuelve
      { id: "r2", userId: "u2" }, // u2 ya fresco → se resuelve
      { id: "r3", userId: "u3" }, // u3 ya fresco → se resuelve
    ];
    const staleUserIds = new Set(["u1"]);
    expect(selectResolvable(actives, staleUserIds)).toEqual(["r2", "r3"]);
  });

  it("selectResolvable: sin activos → nada", () => {
    expect(selectResolvable([], new Set(["u1"]))).toEqual([]);
  });
});

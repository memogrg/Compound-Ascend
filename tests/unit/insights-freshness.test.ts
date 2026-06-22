import { describe, it, expect } from "vitest";
import { isStale } from "@/lib/insights";

describe("isStale", () => {
  it("sin corrida previa (null) → stale", () => {
    expect(isStale(null)).toBe(true);
  });

  it("corrida reciente → no stale", () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
    expect(isStale(oneHourAgo)).toBe(false);
  });

  it("corrida vieja (> maxAgeHours) → stale", () => {
    const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000);
    expect(isStale(thirteenHoursAgo)).toBe(true);
  });

  it("respeta un maxAgeHours personalizado", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    expect(isStale(twoHoursAgo, 1)).toBe(true);
    expect(isStale(twoHoursAgo, 3)).toBe(false);
  });
});

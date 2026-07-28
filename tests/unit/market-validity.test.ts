import { describe, it, expect } from "vitest";
import { isValidPrice, sanitizePrice } from "@/lib/market-data/validity";

describe("isValidPrice / sanitizePrice · un precio SOLO vale si es >0 y finito (nunca $0)", () => {
  it("acepta positivos finitos", () => {
    expect(isValidPrice(0.018)).toBe(true);
    expect(isValidPrice(63000)).toBe(true);
    expect(sanitizePrice(0.2478)).toBe(0.2478);
  });

  it("rechaza 0, negativos, null, NaN, Infinity y no-números", () => {
    for (const bad of [0, -1, -0.5, null, undefined, NaN, Infinity, -Infinity, "10", {}]) {
      expect(isValidPrice(bad)).toBe(false);
      expect(sanitizePrice(bad)).toBeNull();
    }
  });
});

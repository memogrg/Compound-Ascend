/**
 * Deterministic PRNG (mulberry32) for the simulation. The whole run — amounts,
 * dates, identity — derives from a single integer seed, so a run is byte-for-byte
 * reproducible. NOT for cryptography; it exists precisely because `Math.random`
 * would break determinism.
 */
export interface Prng {
  /** Next float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** A multiple of `step` within [min, max] (both derived deterministically). */
  amount(min: number, max: number, step: number): number;
  /** Pick one element deterministically. */
  pick<T>(items: readonly T[]): T;
}

export function createPrng(seed: number): Prng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  const amount = (min: number, max: number, step: number): number => {
    const steps = Math.floor((max - min) / step) + 1;
    return min + int(0, steps - 1) * step;
  };
  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new Error("prng.pick: empty array");
    return items[int(0, items.length - 1)]!;
  };
  return { next, int, amount, pick };
}

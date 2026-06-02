import { describe, it, expect } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

describe("rateLimit", () => {
  it("permite hasta el límite y luego bloquea", async () => {
    const id = `test:${Math.random().toString(36).slice(2)}`;
    const cfg = { limit: 3, windowMs: 60_000 };

    const r1 = await rateLimit(id, cfg);
    await rateLimit(id, cfg);
    const r3 = await rateLimit(id, cfg);
    const r4 = await rateLimit(id, cfg);

    expect(r1.ok).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(r3.ok).toBe(true);
    expect(r3.remaining).toBe(0);
    expect(r4.ok).toBe(false);
  });

  it("aísla identidades distintas", async () => {
    const cfg = { limit: 1, windowMs: 60_000 };
    const a = await rateLimit("a:bucket", cfg);
    const b = await rateLimit("b:bucket", cfg);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { withTimeout } from "@/lib/async/with-timeout";

afterEach(() => {
  vi.useRealTimers();
});

describe("withTimeout · el carril nunca se cuelga esperando al LLM", () => {
  it("devuelve el valor si la promesa resuelve a tiempo", async () => {
    const r = await withTimeout(Promise.resolve("ok"), 3500, "fallback");
    expect(r).toBe("ok");
  });

  it("una promesa que NO resuelve → fallback al vencer el timeout", async () => {
    vi.useFakeTimers();
    const never = new Promise<string>(() => {}); // nunca resuelve (LLM colgado)
    const p = withTimeout(never, 3500, "fallback");
    await vi.advanceTimersByTimeAsync(3500);
    expect(await p).toBe("fallback");
  });

  it("una promesa que RECHAZA → fallback (no propaga el error)", async () => {
    const r = await withTimeout(Promise.reject(new Error("gemini caído")), 3500, "fallback");
    expect(r).toBe("fallback");
  });
});

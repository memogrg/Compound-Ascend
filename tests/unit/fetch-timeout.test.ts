import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWithTimeout, isTimeoutError } from "@/lib/fetch-timeout";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchWithTimeout · corta a los N ms en vez de colgarse", () => {
  it("un fetch que NUNCA responde → aborta al vencer el timeout (AbortError)", async () => {
    vi.useFakeTimers();
    // fetch que solo resuelve/rechaza cuando su signal aborta (simula un server colgado).
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        );
      }),
    );

    const p = fetchWithTimeout("/x", { method: "POST" }, 40_000);
    const assertion = expect(p).rejects.toSatisfy(isTimeoutError); // aborta, no cuelga
    await vi.advanceTimersByTimeAsync(40_000); // pasa el umbral
    await assertion;
  });

  it("un fetch que responde a tiempo → devuelve la respuesta, sin abortar", async () => {
    vi.useFakeTimers();
    const ok = { ok: true, json: async () => ({ reply: "hola" }) } as unknown as Response;
    vi.stubGlobal("fetch", async () => ok);
    const res = await fetchWithTimeout("/x", { method: "POST" }, 40_000);
    expect(res.ok).toBe(true);
  });
});

describe("isTimeoutError", () => {
  it("distingue el AbortError del resto", () => {
    expect(isTimeoutError(new DOMException("x", "AbortError"))).toBe(true);
    expect(isTimeoutError(new Error("network"))).toBe(false);
  });
});

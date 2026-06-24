import { describe, it, expect, vi, afterEach } from "vitest";
import { isRetryableStatus, backoffMs, GeminiProvider } from "@/lib/ai/providers/gemini";

const chatArgs = { system: "s", messages: [{ role: "user" as const, content: "hi" }] };
const okJson = {
  candidates: [{ content: { parts: [{ text: "hola" }] } }],
  usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isRetryableStatus", () => {
  it("5xx y 429 → reintentable", () => {
    for (const s of [500, 502, 503, 504, 429]) expect(isRetryableStatus(s)).toBe(true);
  });
  it("4xx (salvo 429) → no reintentable", () => {
    for (const s of [400, 401, 403, 404]) expect(isRetryableStatus(s)).toBe(false);
  });
});

describe("backoffMs", () => {
  it("crece con el intento y queda en rango (base*2^n + jitter<base/2)", () => {
    const b0 = backoffMs(0);
    const b1 = backoffMs(1);
    expect(b0).toBeGreaterThanOrEqual(400);
    expect(b0).toBeLessThan(600); // 400 + jitter(<200)
    expect(b1).toBeGreaterThanOrEqual(800);
    expect(b1).toBeLessThan(1000); // 800 + jitter(<200)
    expect(b1).toBeGreaterThan(b0); // rangos disjuntos → siempre crece
  });
});

describe("call · retry/backoff (integrado vía chat, fake timers)", () => {
  it("503 y luego 200 → resuelve tras un reintento", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, json: async () => okJson });
    vi.stubGlobal("fetch", fetchMock);

    const promise = new GeminiProvider("k").chat(chatArgs);
    await vi.advanceTimersByTimeAsync(700); // cubre el backoff del intento 0 (<600ms)
    const res = await promise;

    expect(res.text).toBe("hola");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("400 → lanza sin reintentar", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(new GeminiProvider("k").chat(chatArgs)).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("503 persistente → lanza PROVIDER_ERROR tras 3 intentos", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal("fetch", fetchMock);

    const promise = new GeminiProvider("k").chat(chatArgs);
    const assertion = expect(promise).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
    await vi.advanceTimersByTimeAsync(3000); // cubre los dos backoffs
    await assertion;

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

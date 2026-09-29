/**
 * TtlCache: memoria (L1) + Redis/Upstash (L2) sin cambiar la interfaz síncrona de los llamadores.
 * Se prueba el modo memoria puro (sin Upstash) y el modo Redis con un doble inyectado.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const warn = vi.fn();
const info = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { warn: (...a: unknown[]) => warn(...a), info: (...a: unknown[]) => info(...a), error: vi.fn() },
}));

import { TtlCache, MemoryTTLCache, type RedisLike } from "@/lib/cache/ttl-cache";

function fakeRedis() {
  const store = new Map<string, unknown>();
  const calls = { get: 0, set: 0 };
  const redis: RedisLike & { store: typeof store; calls: typeof calls } = {
    store,
    calls,
    async get<T>(k: string): Promise<T | null> {
      calls.get += 1;
      return (store.get(k) as T) ?? null;
    },
    async set(k: string, v: unknown): Promise<unknown> {
      calls.set += 1;
      store.set(k, v);
      return "OK";
    },
  };
  return redis;
}

beforeEach(() => {
  warn.mockClear();
  info.mockClear();
});

describe("TtlCache · modo memoria (sin Upstash)", () => {
  it("guarda y devuelve valores; miss devuelve null; no toca la red", async () => {
    const c = new TtlCache("t", 100, null);
    expect(c.get("x")).toBeNull();
    c.set("x", { p: 42 }, 60);
    expect(c.get<{ p: number }>("x")).toEqual({ p: 42 });
    await c.whenIdle(); // no hay operaciones en vuelo
  });

  it("respeta el TTL (expira)", () => {
    vi.useFakeTimers();
    try {
      const c = new TtlCache("t", 100, null);
      c.set("k", "v", 60);
      vi.advanceTimersByTime(59_000);
      expect(c.get("k")).toBe("v");
      vi.advanceTimersByTime(2_000);
      expect(c.get("k")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("evicciona cuando se llena (FIFO tras limpiar expirados)", () => {
    const c = new TtlCache("t", 2, null);
    c.set("a", 1, 60);
    c.set("b", 2, 60);
    c.set("c", 3, 60); // desaloja el más viejo (a)
    expect(c.get("a")).toBeNull();
    expect(c.get("b")).toBe(2);
    expect(c.get("c")).toBe(3);
  });
});

describe("MemoryTTLCache · unidad", () => {
  it("setEntry respeta un expiresAt ya calculado (lo usa el calentado desde Redis)", () => {
    const m = new MemoryTTLCache(10);
    m.setEntry("k", { value: "v", expiresAt: Date.now() + 10_000 });
    expect(m.get("k")).toBe("v");
    m.setEntry("viejo", { value: "x", expiresAt: Date.now() - 1 });
    expect(m.get("viejo")).toBeNull();
  });
});

describe("TtlCache · modo Redis (doble inyectado)", () => {
  it("set escribe en memoria y hace write-through a Redis (con px = ttl)", async () => {
    const r = fakeRedis();
    const c = new TtlCache("mkt", 100, r);
    c.set("price:AAPL", { c: 100 }, 60);
    expect(c.get<{ c: number }>("price:AAPL")).toEqual({ c: 100 }); // L1 inmediato
    await c.whenIdle();
    expect(r.calls.set).toBe(1);
    expect(r.store.get("cache:mkt:price:AAPL")).toMatchObject({ value: { c: 100 } });
  });

  it("una L1 fría se CALIENTA desde Redis en el siguiente get (coherencia entre instancias)", async () => {
    const r = fakeRedis();
    const a = new TtlCache("mkt", 100, r); // instancia A
    a.set("k", "compartido", 60);
    await a.whenIdle();

    const b = new TtlCache("mkt", 100, r); // instancia B, memoria fría
    expect(b.get("k")).toBeNull(); // miss sincrónico
    await b.whenIdle(); // termina el calentado
    expect(b.get("k")).toBe("compartido"); // ya en L1
  });

  it("un L1 hit NO consulta Redis", async () => {
    const r = fakeRedis();
    const c = new TtlCache("mkt", 100, r);
    c.set("k", 1, 60);
    await c.whenIdle();
    const before = r.calls.get;
    expect(c.get("k")).toBe(1);
    await c.whenIdle();
    expect(r.calls.get).toBe(before); // no hubo lectura a Redis
  });

  it("no calienta si la entrada de Redis ya expiró", async () => {
    const r = fakeRedis();
    r.store.set("cache:mkt:viejo", { value: "x", expiresAt: Date.now() - 1 });
    const c = new TtlCache("mkt", 100, r);
    expect(c.get("viejo")).toBeNull();
    await c.whenIdle();
    expect(c.get("viejo")).toBeNull(); // sigue sin estar en L1
  });

  it("si Redis falla, degrada a memoria sin tirar al llamador y lo registra", async () => {
    const roto: RedisLike = {
      get: async () => {
        throw new Error("red caída");
      },
      set: async () => {
        throw new Error("red caída");
      },
    };
    const c = new TtlCache("mkt", 100, roto);
    c.set("k", "v", 60);
    expect(c.get("k")).toBe("v"); // memoria responde
    await c.whenIdle(); // la escritura fallida no revienta
    // fuerza una lectura a Redis (miss de L1) que también falla
    const b = new TtlCache("mkt", 100, roto);
    expect(b.get("k")).toBeNull();
    await b.whenIdle();
    expect(warn).toHaveBeenCalled();
  });
});

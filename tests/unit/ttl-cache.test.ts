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

describe("TtlCache · getOrFetch", () => {
  it("acierto en L2 (Redis) evita el fetcher y calienta L1", async () => {
    const r = fakeRedis();
    r.store.set("cache:mkt:price:AAPL", { value: { c: 100 }, expiresAt: Date.now() + 60_000 });
    const c = new TtlCache("mkt", 100, r);
    let fetched = 0;
    const v = await c.getOrFetch("price:AAPL", 60, async () => {
      fetched += 1;
      return { c: 999 };
    });
    expect(v).toEqual({ c: 100 }); // vino de Redis
    expect(fetched).toBe(0); // el fetcher NO corrió
    expect(c.get<{ c: number }>("price:AAPL")).toEqual({ c: 100 }); // L1 caliente
  });

  it("acierto en L1 devuelve sin tocar Redis ni fetcher", async () => {
    const r = fakeRedis();
    const c = new TtlCache("mkt", 100, r);
    c.set("k", "v", 60);
    await c.whenIdle();
    const getsBefore = r.calls.get;
    let fetched = 0;
    const v = await c.getOrFetch("k", 60, async () => {
      fetched += 1;
      return "otro";
    });
    expect(v).toBe("v");
    expect(fetched).toBe(0);
    expect(r.calls.get).toBe(getsBefore);
  });

  it("10 peticiones concurrentes → UNA sola llamada al fetcher (single-flight)", async () => {
    const r = fakeRedis();
    const c = new TtlCache("mkt", 100, r);
    let fetched = 0;
    const fetcher = async () => {
      fetched += 1;
      await new Promise((res) => setTimeout(res, 10));
      return { c: 42 };
    };
    const results = await Promise.all(
      Array.from({ length: 10 }, () => c.getOrFetch("price:MISS", 60, fetcher)),
    );
    expect(fetched).toBe(1); // coalescido
    expect(results.every((x) => (x as { c: number }).c === 42)).toBe(true);
    expect(r.calls.get).toBe(1); // y una sola lectura a Redis
    await c.whenIdle();
    expect(r.calls.set).toBe(1); // y una sola escritura
  });

  it("tras resolver, un getOrFetch posterior sirve de L1 (sin fetcher)", async () => {
    const r = fakeRedis();
    const c = new TtlCache("mkt", 100, r);
    let fetched = 0;
    const fetcher = async () => {
      fetched += 1;
      return { c: 7 };
    };
    await c.getOrFetch("k", 60, fetcher);
    await c.getOrFetch("k", 60, fetcher);
    expect(fetched).toBe(1);
  });

  it("Redis caído → cae a memoria + fetcher sin romper, y registra", async () => {
    const roto: RedisLike = {
      get: async () => {
        throw new Error("red caída");
      },
      set: async () => {
        throw new Error("red caída");
      },
    };
    const c = new TtlCache("mkt", 100, roto);
    let fetched = 0;
    const v = await c.getOrFetch("k", 60, async () => {
      fetched += 1;
      return { c: 5 };
    });
    expect(v).toEqual({ c: 5 });
    expect(fetched).toBe(1); // el fetcher corrió pese al fallo de Redis
    expect(c.get<{ c: number }>("k")).toEqual({ c: 5 }); // quedó en L1
    await c.whenIdle();
    expect(warn).toHaveBeenCalled();
  });

  it("no cachea null (no envenena con misses)", async () => {
    const r = fakeRedis();
    const c = new TtlCache("mkt", 100, r);
    let fetched = 0;
    const fetcher = async () => {
      fetched += 1;
      return null;
    };
    expect(await c.getOrFetch("k", 60, fetcher)).toBeNull();
    expect(await c.getOrFetch("k", 60, fetcher)).toBeNull();
    expect(fetched).toBe(2); // volvió a intentar; no se cacheó el null
    await c.whenIdle();
    expect(r.calls.set).toBe(0);
  });
});

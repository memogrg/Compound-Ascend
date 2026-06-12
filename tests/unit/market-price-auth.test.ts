/**
 * Regresión del fix: /api/market-price y /api/market-price/search eran
 * públicos (solo rate-limit por IP) y proxyean APIs externas con nuestros
 * tokens. Contrato: 401 sin sesión; con sesión funcionan igual que antes y el
 * rate-limit se llavea por usuario.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let currentUser: { id: string } | null = null;
vi.mock("@/lib/auth/session", () => ({
  getUser: vi.fn(async () => currentUser),
  isSupabaseConfigured: () => true,
}));

const rateLimitMock = vi.fn(async (_key: string, _limits: unknown) => ({
  ok: true,
  remaining: 9,
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (key: string, limits: unknown) => rateLimitMock(key, limits),
  RATE_LIMITS: { marketData: { windowMs: 60000, max: 10 } },
  clientIp: () => "1.2.3.4",
}));

vi.mock("@/lib/market-data", () => ({
  getMarketPrice: vi.fn(async () => ({ price: 500, currency: "USD", symbol: "VOO" })),
  searchSymbols: vi.fn(async () => [{ symbol: "VOO", name: "Vanguard S&P 500" }]),
  isValidSymbol: (s: string) => /^[A-Za-z0-9.\-]{1,12}$/.test(s),
}));

import { GET as getPrice } from "@/app/api/market-price/route";
import { GET as getSearch } from "@/app/api/market-price/search/route";

const PRICE_URL = "http://localhost/api/market-price?symbol=VOO&type=etf";
const SEARCH_URL = "http://localhost/api/market-price/search?q=voo";

beforeEach(() => {
  currentUser = null;
  rateLimitMock.mockClear();
});

describe("auth de /api/market-price*", () => {
  it("sin sesión: 401 en price y NO toca el rate-limit ni proveedores", async () => {
    const res = await getPrice(new Request(PRICE_URL));
    expect(res.status).toBe(401);
    expect(rateLimitMock).not.toHaveBeenCalled();
  });

  it("sin sesión: 401 en search", async () => {
    const res = await getSearch(new Request(SEARCH_URL));
    expect(res.status).toBe(401);
    expect(rateLimitMock).not.toHaveBeenCalled();
  });

  it("con sesión: price responde 200 y el rate-limit se llavea por usuario", async () => {
    currentUser = { id: "user-123" };
    const res = await getPrice(new Request(PRICE_URL));
    expect(res.status).toBe(200);
    expect(rateLimitMock).toHaveBeenCalledWith("market:user:user-123", expect.anything());
    const json = (await res.json()) as { price: number };
    expect(json.price).toBe(500);
  });

  it("con sesión: search responde 200 con resultados", async () => {
    currentUser = { id: "user-123" };
    const res = await getSearch(new Request(SEARCH_URL));
    expect(res.status).toBe(200);
    expect(rateLimitMock).toHaveBeenCalledWith("market-search:user:user-123", expect.anything());
    const json = (await res.json()) as { results: unknown[] };
    expect(json.results).toHaveLength(1);
  });

  it("con sesión pero rate-limited: 429", async () => {
    currentUser = { id: "user-123" };
    rateLimitMock.mockResolvedValueOnce({ ok: false, remaining: 0 });
    const res = await getPrice(new Request(PRICE_URL));
    expect(res.status).toBe(429);
  });
});

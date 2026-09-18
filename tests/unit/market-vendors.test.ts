/**
 * Capa de proveedores de mercado pagos (src/lib/market-data/vendors).
 *
 * Los fixtures copian la FORMA de las respuestas reales, verificada contra la documentación de cada
 * proveedor (sep 2026), no inventada: Massive snapshot (`tickers[].min.c/day.c/prevDay.c`) y barras
 * (`results[].h/t` en ms); Twelve Data `/quote` (números como string, `fifty_two_week.high`, lote
 * con clave por identificador, un solo símbolo = objeto plano); CoinGecko `/coins/markets`.
 *
 * Lo que más importa acá no es que cada adaptador parsee: es que un precio ≤0 NUNCA llegue al
 * store, y que un proveedor muerto no se esconda.
 */
import { describe, it, expect } from "vitest";

import {
  budgetConfigFromEnv,
  budgetReport,
  buildChain,
  buildStoreRow,
  createBudget,
  createVendor,
  fetchWithFallback,
  marketConfigFromEnv,
  missingKeys,
  parseChain,
  toTwelveSymbol,
  type ChainRow,
  type VendorDeps,
} from "@/lib/market-data/vendors";

type Call = { url: string; headers: Record<string, string> };
type Route = (url: string) => { status?: number; body: unknown } | null;

/** fetch falso: la primera ruta que responde gana; sin ruta → 404. Registra URL y headers. */
function fakeFetch(...routes: Route[]) {
  const calls: Call[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    for (const r of routes) {
      const hit = r(url);
      if (hit) {
        const status = hit.status ?? 200;
        return { ok: status < 400, status, json: async () => hit.body } as Response;
      }
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  }) as typeof fetch;
  return { fn, calls };
}

const on =
  (frag: string, body: unknown, status = 200): Route =>
  (url) =>
    url.includes(frag) ? { status, body } : null;

function deps(f: typeof fetch, extra: Partial<VendorDeps> = {}): VendorDeps {
  return {
    fetch: f,
    keys: { massive: "mk", twelvedata: "tk", finnhub: "fk", coingecko: "ck" },
    coingeckoPlan: "demo",
    ...extra,
  };
}

// ---------------------------------------------------------------- adaptadores

describe("CoinGecko", () => {
  const markets = [
    {
      id: "bitcoin",
      current_price: 63000,
      high_24h: 65000,
      ath: 126000,
      ath_date: "2025-10-06T00:00:00.000Z",
      atl: 67.81,
      atl_date: "2013-07-06T00:00:00.000Z",
      market_cap_rank: 1,
      price_change_percentage_24h: -1.5,
      last_updated: "2026-09-18T10:00:00.000Z",
    },
  ];

  it("plan PRO: host pro-api y header x-cg-pro-api-key", async () => {
    const f = fakeFetch(on("/coins/markets", markets));
    const v = createVendor("coingecko", deps(f.fn, { coingeckoPlan: "pro" }));
    await v.getHighlights(["BTC"]);
    expect(f.calls[0]!.url.startsWith("https://pro-api.coingecko.com/api/v3/coins/markets")).toBe(
      true,
    );
    expect(f.calls[0]!.headers).toEqual({ "x-cg-pro-api-key": "ck" });
  });

  it("plan DEMO: host público y header x-cg-demo-api-key (lo de siempre)", async () => {
    const f = fakeFetch(on("/coins/markets", markets));
    await createVendor("coingecko", deps(f.fn)).getHighlights(["BTC"]);
    expect(f.calls[0]!.url.startsWith("https://api.coingecko.com/api/v3/")).toBe(true);
    expect(f.calls[0]!.headers).toEqual({ "x-cg-demo-api-key": "ck" });
  });

  it("conserva ATH, ATL y market cap rank, y el máximo es un ATH REAL", async () => {
    const f = fakeFetch(on("/coins/markets", markets));
    const r = await createVendor("coingecko", deps(f.fn)).getHighlights(["btc"]);
    expect(r.BTC).toMatchObject({
      price: 63000,
      high: 126000,
      highDate: "2025-10-06",
      highKind: "ath",
      high24h: 65000,
      atl: 67.81,
      atlDate: "2013-07-06",
      marketCapRank: 1,
      changePct: -1.5,
      asOf: "2026-09-18T10:00:00.000Z",
    });
  });

  it("todas las cripto en UNA llamada (el lote de siempre)", async () => {
    const f = fakeFetch(on("/coins/markets", []));
    await createVendor("coingecko", deps(f.fn)).getHighlights(["BTC", "ETH", "KMNO"]);
    const llamadas = f.calls.filter((c) => c.url.includes("/coins/markets"));
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]!.url).toContain("ids=bitcoin,ethereum,kamino");
  });
});

describe("Massive", () => {
  const snapshot = {
    status: "OK",
    tickers: [
      {
        ticker: "VOO",
        min: { c: 540.5 },
        day: { c: 540 },
        prevDay: { c: 535 },
        todaysChangePerc: 1.02,
        updated: 1758189600000000000,
      },
      // Mercado cerrado, sin barra del minuto: cae al cierre del día anterior.
      { ticker: "QQQ", min: { c: 0 }, day: { c: 0 }, prevDay: { c: 480 } },
    ],
  };
  const barras = {
    results: [
      { h: 500, t: Date.UTC(2025, 10, 3) },
      { h: 560, t: Date.UTC(2026, 0, 2) },
      { h: 541, t: Date.UTC(2026, 8, 17) },
    ],
  };

  it("precio del snapshot en UNA llamada; min.c → day.c → prevDay.c si el anterior es 0", async () => {
    const f = fakeFetch(on("/v2/snapshot/", snapshot));
    const r = await createVendor("massive", deps(f.fn)).getQuotes(["VOO", "QQQ"]);
    expect(r.VOO!.price).toBe(540.5);
    expect(r.QQQ!.price).toBe(480);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.url).toContain("tickers=VOO,QQQ");
  });

  it("máximo de 52 semanas = la barra diaria más alta del último año, con su fecha", async () => {
    const f = fakeFetch(
      on("/v2/snapshot/", snapshot),
      on("/v2/aggs/ticker/VOO/range/1/day/", barras),
    );
    const r = await createVendor("massive", deps(f.fn)).getHighlights(["VOO"]);
    expect(r.VOO).toMatchObject({ high: 560, highDate: "2026-01-02", highKind: "52w" });
  });

  it("la llave va en Authorization: Bearer, nunca en la URL", async () => {
    const f = fakeFetch(on("/v2/snapshot/", snapshot));
    await createVendor("massive", deps(f.fn)).getQuotes(["VOO"]);
    expect(f.calls[0]!.headers.Authorization).toBe("Bearer mk");
    expect(f.calls[0]!.url).not.toContain("mk");
  });
});

describe("Twelve Data", () => {
  const lote = {
    VOO: {
      symbol: "VOO",
      currency: "USD",
      close: "540.12",
      percent_change: "0.8",
      timestamp: 1758189600,
      fifty_two_week: { high: "560.00", low: "450.00" },
    },
    "VWRA:LSE": {
      symbol: "VWRA",
      currency: "USD",
      close: "135.40",
      fifty_two_week: { high: "140.10" },
    },
    "VUSA:LSE": {
      symbol: "VUSA",
      currency: "GBp",
      close: "9870",
      fifty_two_week: { high: "10150" },
    },
    NOEXISTE: { code: 404, message: "symbol not found", status: "error" },
  };

  it("VWRA.L → VWRA:LSE (el formato de Finnhub que guarda la app → el de Twelve Data)", () => {
    expect(toTwelveSymbol("VWRA.L")).toBe("VWRA:LSE");
    expect(toTwelveSymbol("vwra.lse")).toBe("VWRA:LSE");
    expect(toTwelveSymbol("VOO")).toBe("VOO");
    expect(toTwelveSymbol("SAP.DE")).toBe("SAP.DE"); // bolsa no configurada: pasa igual, no se adivina
    expect(toTwelveSymbol("SAP.DE", { DE: "XETR" })).toBe("SAP:XETR");
  });

  it("lote: UNA llamada, clave por identificador, y cada fila vuelve al símbolo pedido", async () => {
    const f = fakeFetch(on("/quote?", lote));
    const r = await createVendor("twelvedata", deps(f.fn)).getHighlights([
      "VOO",
      "VWRA.L",
      "VUSA.L",
      "NOEXISTE",
    ]);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.url).toContain("symbol=VOO,VWRA%3ALSE,VUSA%3ALSE,NOEXISTE");
    expect(r.VOO).toMatchObject({ price: 540.12, high: 560, highKind: "52w", changePct: 0.8 });
    expect(r["VWRA.L"]).toMatchObject({ price: 135.4, currency: "USD", high: 140.1 });
    expect(r.NOEXISTE).toBeUndefined(); // el error de UN símbolo no tumba el lote
  });

  it("peniques (GBp) → libras: un ETF de £98.70 NO se guarda como 9870", async () => {
    // Con UN solo símbolo la API responde el objeto plano, sin clave: el adaptador lo acepta igual.
    const plano = fakeFetch(on("/quote?", lote["VUSA:LSE"]));
    const r = await createVendor("twelvedata", deps(plano.fn)).getHighlights(["VUSA.L"]);
    expect(r["VUSA.L"]).toMatchObject({ price: 98.7, currency: "GBP", high: 101.5 });
  });

  it("cobra UN crédito por símbolo, no por llamada", async () => {
    const budget = createBudget();
    const f = fakeFetch(on("/quote?", lote));
    await createVendor("twelvedata", deps(f.fn, { charge: budget.charge })).getQuotes([
      "VOO",
      "VWRA.L",
      "VUSA.L",
    ]);
    expect(budget.snapshot()).toEqual({ twelvedata: 3 });
  });

  it("la llave va en Authorization: apikey, nunca en la URL", async () => {
    const f = fakeFetch(on("/quote?", lote));
    await createVendor("twelvedata", deps(f.fn)).getQuotes(["VOO"]);
    expect(f.calls[0]!.headers.Authorization).toBe("apikey tk");
    expect(f.calls[0]!.url).not.toContain("tk");
  });
});

describe("Finnhub (respaldo)", () => {
  it("quote + máximo de 52 semanas de /stock/metric, etiquetado 52w", async () => {
    const f = fakeFetch(
      on("/stock/metric", { metric: { "52WeekHigh": 560, "52WeekHighDate": "2026-01-02" } }),
      on("/quote", { c: 540, dp: 0.5, t: 1758189600 }),
    );
    const r = await createVendor("finnhub", deps(f.fn)).getHighlights(["VOO"]);
    expect(r.VOO).toMatchObject({ price: 540, high: 560, highDate: "2026-01-02", highKind: "52w" });
  });
});

// ------------------------------------------------------------ cadena y fallback

describe("fetchWithFallback · cada proveedor recibe SOLO lo que los anteriores no resolvieron", () => {
  const massiveOk = on("/v2/snapshot/", { tickers: [{ ticker: "VOO", min: { c: 540 } }] });
  const finnhubQuote: Route = (url) =>
    url.includes("finnhub.io") && url.includes("/quote")
      ? { body: { c: url.includes("VWRA") ? 0 : 99 } }
      : null;

  it("el primario resuelve lo suyo; el respaldo, solo el resto", async () => {
    const f = fakeFetch(massiveOk, finnhubQuote);
    const d = deps(f.fn);
    const r = await fetchWithFallback(
      [createVendor("massive", d), createVendor("finnhub", d)],
      ["VOO", "AAPL"],
      "quotes",
    );
    expect(r.rows.VOO!.provider).toBe("massive");
    expect(r.rows.AAPL!.provider).toBe("finnhub");
    // A Finnhub solo le preguntaron por AAPL: VOO ya estaba resuelto.
    expect(f.calls.filter((c) => c.url.includes("finnhub.io")).map((c) => c.url)).toEqual([
      expect.stringContaining("symbol=AAPL"),
    ]);
    expect(r.intentos).toEqual([
      { vendor: "massive", pedidos: 2, conPrecio: 1 },
      { vendor: "finnhub", pedidos: 1, conPrecio: 1 },
    ]);
  });

  it("primario con 401 → el respaldo cubre todo", async () => {
    const f = fakeFetch(on("/v2/snapshot/", {}, 401), finnhubQuote);
    const d = deps(f.fn);
    const r = await fetchWithFallback(
      [createVendor("massive", d), createVendor("finnhub", d)],
      ["VOO"],
      "quotes",
    );
    expect(r.rows.VOO).toMatchObject({ price: 99, provider: "finnhub" });
    expect(r.intentos[0]).toEqual({ vendor: "massive", pedidos: 1, conPrecio: 0 });
  });

  it("precio 0 del primario cuenta como FALLO: pasa al respaldo, no se acepta el 0", async () => {
    const f = fakeFetch(
      on("/v2/snapshot/", {
        tickers: [{ ticker: "VOO", min: { c: 0 }, day: { c: 0 }, prevDay: { c: 0 } }],
      }),
      finnhubQuote,
    );
    const d = deps(f.fn);
    const r = await fetchWithFallback(
      [createVendor("massive", d), createVendor("finnhub", d)],
      ["VOO"],
      "quotes",
    );
    expect(r.rows.VOO).toMatchObject({ price: 99, provider: "finnhub" });
  });

  it("si NADIE trae precio válido, el símbolo no tiene fila: queda en sinPrecio", async () => {
    const f = fakeFetch(on("/v2/snapshot/", {}, 500), finnhubQuote);
    const d = deps(f.fn);
    const r = await fetchWithFallback(
      [createVendor("massive", d), createVendor("finnhub", d)],
      ["VWRA"],
      "quotes",
    );
    expect(r.rows).toEqual({});
    expect(r.sinPrecio).toEqual(["VWRA"]);
  });

  it("un proveedor que LANZA no corta la cadena", async () => {
    const d = deps(fakeFetch(finnhubQuote).fn);
    const roto = {
      id: "massive" as const,
      kinds: ["stock" as const],
      getQuotes: () => Promise.reject(new Error("boom")),
      getHighlights: () => Promise.reject(new Error("boom")),
    };
    const avisos: string[] = [];
    const r = await fetchWithFallback([roto, createVendor("finnhub", d)], ["VOO"], "quotes", (m) =>
      avisos.push(m),
    );
    expect(r.rows.VOO!.provider).toBe("finnhub");
    expect(avisos.join(" ")).toContain("boom");
  });
});

// ------------------------------------------------------- nunca un $0 en el store

describe("buildStoreRow · un precio ≤0 NO se escribe", () => {
  const base: ChainRow = {
    symbol: "VOO",
    price: 540,
    currency: "usd",
    asOf: null,
    high: 560,
    highDate: "2026-01-02",
    highKind: "52w",
    high24h: null,
    provider: "massive",
  };

  it.each([0, -1, Number.NaN, null])(
    "precio %s → null (la fila del store queda como estaba)",
    (price) => {
      expect(buildStoreRow({ ...base, price: price as number | null }, "etf")).toBeNull();
    },
  );

  it("máximo inválido → se OMITEN sus columnas (no se mandan en null y no pisan el bueno)", () => {
    const row = buildStoreRow({ ...base, high: 0 }, "etf")!;
    expect(row.price).toBe(540);
    expect("ath_usd" in row).toBe(false);
    expect("high_kind" in row).toBe(false);
  });

  it("fila válida: moneda en 3 letras mayúsculas y el proveedor que la trajo", () => {
    const row = buildStoreRow(base, "etf", new Date("2026-09-18T10:00:00Z"))!;
    expect(row).toMatchObject({
      symbol: "VOO",
      asset_type: "etf",
      currency: "USD",
      provider: "massive",
      ath_usd: 560,
      high_kind: "52w",
      fetched_at: "2026-09-18T10:00:00.000Z",
      ttl_seconds: 60,
    });
  });
});

// --------------------------------------------------------------- guarda de costo

describe("guarda de costo · proyecta el día y avisa ANTES de pasarse", () => {
  const cfg = budgetConfigFromEnv({
    MARKET_BUDGET_DAILY_COINGECKO: "3300", // Basic: 100k/mes ÷ 30
    MARKET_BUDGET_DAILY_TWELVEDATA: "1000",
    MARKET_RUNS_PER_DAY: "24",
  });

  it("por debajo del 80% → ok; entre 80 y 100 → aviso; arriba → excedido; sin tope → sin-tope", () => {
    const lineas = budgetReport(
      { coingecko: 100, twelvedata: 35, massive: 50, finnhub: 999 },
      {
        ...cfg,
        dailyBudget: { ...cfg.dailyBudget, finnhub: 1000 },
      },
    );
    const nivel = Object.fromEntries(lineas.map((l) => [l.vendor, l.nivel]));
    expect(nivel).toEqual({
      coingecko: "ok", // 100 × 24 = 2400 de 3300 = 73%
      twelvedata: "aviso", // 35 × 24 = 840 de 1000 = 84%
      massive: "sin-tope", // Starter no tiene límite de llamadas
      finnhub: "excedido",
    });
    expect(lineas.find((l) => l.vendor === "twelvedata")!.proyectadoDia).toBe(840);
  });

  it("umbral configurable: con 0.9, el 84% ya no avisa", () => {
    const c = budgetConfigFromEnv({
      MARKET_BUDGET_DAILY_TWELVEDATA: "1000",
      MARKET_BUDGET_WARN_RATIO: "0.9",
    });
    expect(budgetReport({ twelvedata: 35 }, c)[0]!.nivel).toBe("ok");
  });

  it("cuenta lo que gastó cada proveedor en la corrida", async () => {
    const budget = createBudget();
    const f = fakeFetch(on("/v2/snapshot/", { tickers: [] }), on("/quote", { c: 1 }));
    const d = deps(f.fn, { charge: budget.charge });
    await fetchWithFallback(
      [createVendor("massive", d), createVendor("finnhub", d)],
      ["A", "B"],
      "quotes",
    );
    expect(budget.snapshot()).toEqual({ massive: 1, finnhub: 2 });
  });
});

// ------------------------------------------------------ configuración por env

describe("configuración · cambiar de proveedor es cambiar variables", () => {
  it("sin configurar, la cadena es la de antes: finnhub para acciones, coingecko para cripto", () => {
    const c = marketConfigFromEnv({});
    expect(c.chains).toEqual({ stock: ["finnhub"], crypto: ["coingecko"] });
    expect(c.coingeckoPlan).toBe("demo");
  });

  it("el orden de la variable ES la cadena", () => {
    const c = marketConfigFromEnv({
      MARKET_PROVIDER_STOCKS: "twelvedata, finnhub",
      COINGECKO_API_PLAN: "PRO",
    });
    expect(c.chains.stock).toEqual(["twelvedata", "finnhub"]);
    expect(c.coingeckoPlan).toBe("pro");
  });

  it("un nombre mal escrito o de otro tipo de activo se descarta CON aviso", () => {
    const avisos: string[] = [];
    expect(parseChain("masive,coingecko,finnhub", "stock", (m) => avisos.push(m))).toEqual([
      "finnhub",
    ]);
    expect(avisos).toHaveLength(2);
  });

  it("missingKeys señala al primario sin llave (el que el respaldo taparía en silencio)", () => {
    const c = marketConfigFromEnv({
      MARKET_PROVIDER_STOCKS: "massive,finnhub",
      FINNHUB_TOKEN: "x",
    });
    const d = { fetch: fakeFetch().fn, keys: c.keys, coingeckoPlan: c.coingeckoPlan };
    expect(missingKeys(c.chains.stock, d)).toEqual(["massive"]);
    expect(missingKeys(["coingecko"], d)).toEqual([]); // CoinGecko sin llave usa la API pública
  });

  it("buildChain instancia la cadena en orden", () => {
    const c = marketConfigFromEnv({ MARKET_PROVIDER_STOCKS: "massive,twelvedata,finnhub" });
    expect(buildChain("stock", c, { fetch: fakeFetch().fn }).map((v) => v.id)).toEqual([
      "massive",
      "twelvedata",
      "finnhub",
    ]);
  });
});

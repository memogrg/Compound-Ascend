import { describe, it, expect } from "vitest";
import { HORAS_STALE, resumirFrescura } from "@/lib/market-data/freshness";
import { detectStaleMarketFeed, HORAS_FEED_STALE } from "@/lib/insights/detectors";

const AHORA = Date.parse("2026-09-01T20:00:00Z");
const haceHoras = (h: number) => new Date(AHORA - h * 3600_000).toISOString();

const CARTERA = [
  { symbol: "BTC", assetType: "cripto" },
  { symbol: "IBIT", assetType: "etf" },
];

describe("resumirFrescura", () => {
  it("todo fresco → nada stale", () => {
    const r = resumirFrescura({
      filas: [
        { symbol: "BTC", asset_type: "crypto", fetched_at: haceHoras(2) },
        { symbol: "IBIT", asset_type: "etf", fetched_at: haceHoras(5) },
      ],
      cotizadas: CARTERA,
      ahora: AHORA,
    });
    expect(r.posicionesCotizadas).toBe(2);
    expect(r.posicionesSinPrecioFresco).toBe(0);
    expect(r.horasDesdeUltimoPrecio).toBeCloseTo(2, 5);
    expect(r.stale).toBe(false);
  });

  it("más de 24 h en TODAS → stale", () => {
    const r = resumirFrescura({
      filas: [
        { symbol: "BTC", asset_type: "crypto", fetched_at: haceHoras(30) },
        { symbol: "IBIT", asset_type: "etf", fetched_at: haceHoras(40) },
      ],
      cotizadas: CARTERA,
      ahora: AHORA,
    });
    expect(r.stale).toBe(true);
  });

  it("una sola vieja no marca stale, pero sí se cuenta", () => {
    const r = resumirFrescura({
      filas: [
        { symbol: "BTC", asset_type: "crypto", fetched_at: haceHoras(2) },
        { symbol: "IBIT", asset_type: "etf", fetched_at: haceHoras(72) },
      ],
      cotizadas: CARTERA,
      ahora: AHORA,
    });
    expect(r.posicionesSinPrecioFresco).toBe(1);
    expect(r.stale).toBe(false);
  });

  it("sin ninguna fila: todas sin precio y sin 'último'", () => {
    const r = resumirFrescura({ filas: [], cotizadas: CARTERA, ahora: AHORA });
    expect(r.horasDesdeUltimoPrecio).toBeNull();
    expect(r.posicionesSinPrecioFresco).toBe(2);
    expect(r.stale).toBe(true);
  });

  it("el par (símbolo, tipo) es la clave: una fila de otro tipo no da frescura falsa", () => {
    // BTC como "etf" es basura vieja del store real; no debe cubrir a BTC cripto.
    const r = resumirFrescura({
      filas: [{ symbol: "BTC", asset_type: "etf", fetched_at: haceHoras(1) }],
      cotizadas: [{ symbol: "BTC", assetType: "cripto" }],
      ahora: AHORA,
    });
    expect(r.posicionesSinPrecioFresco).toBe(1);
    expect(r.horasDesdeUltimoPrecio).toBeNull();
  });

  it("mide la frescura solo sobre filas que sirven a una posición del usuario", () => {
    const r = resumirFrescura({
      filas: [
        { symbol: "BTC", asset_type: "crypto", fetched_at: haceHoras(30) },
        // Fresquísima, pero de un símbolo que él no tiene.
        { symbol: "DOGE", asset_type: "crypto", fetched_at: haceHoras(1) },
      ],
      cotizadas: [{ symbol: "BTC", assetType: "cripto" }],
      ahora: AHORA,
    });
    expect(r.horasDesdeUltimoPrecio).toBeCloseTo(30, 5);
    expect(r.stale).toBe(true);
  });

  it("las posiciones NO cotizadas no cuentan (nadie les busca precio)", () => {
    const r = resumirFrescura({
      filas: [],
      cotizadas: [
        { symbol: "CASA", assetType: "inmueble" },
        { symbol: "CDP", assetType: "certificado" },
      ],
      ahora: AHORA,
    });
    expect(r.posicionesCotizadas).toBe(0);
    expect(r.stale).toBe(false);
  });

  it("una fecha corrupta se ignora en vez de romper", () => {
    const r = resumirFrescura({
      filas: [{ symbol: "BTC", asset_type: "crypto", fetched_at: "no es fecha" }],
      cotizadas: [{ symbol: "BTC", assetType: "cripto" }],
      ahora: AHORA,
    });
    expect(r.horasDesdeUltimoPrecio).toBeNull();
    expect(r.stale).toBe(true);
  });

  it("los dos umbrales son el mismo número (la alerta y el resumen no pueden discrepar)", () => {
    expect(HORAS_STALE).toBe(HORAS_FEED_STALE);
  });
});

describe("detectStaleMarketFeed", () => {
  it("por debajo del umbral no emite", () => {
    expect(
      detectStaleMarketFeed({
        posicionesCotizadas: 2,
        horasDesdeUltimoPrecio: 5,
        posicionesSinPrecioFresco: 0,
      }),
    ).toEqual([]);
  });

  it("pasado el umbral emite una sola tarjeta, en tono de falla NUESTRA", () => {
    const [i] = detectStaleMarketFeed({
      posicionesCotizadas: 15,
      horasDesdeUltimoPrecio: 30,
      posicionesSinPrecioFresco: 15,
    });
    expect(i!.kind).toBe("feed_precios_stale");
    expect(i!.severity).toBe("observar");
    expect(i!.body).toContain("hace 30 horas");
    expect(i!.body).toContain("Es una falla nuestra, no tuya");
    // Una sola tarjeta para todo el feed: sin relatedId no se multiplica por posición.
    expect(i!.relatedId).toBeUndefined();
  });

  it("a partir de 48 h habla en días", () => {
    const [i] = detectStaleMarketFeed({
      posicionesCotizadas: 2,
      horasDesdeUltimoPrecio: 72,
      posicionesSinPrecioFresco: 2,
    });
    expect(i!.body).toContain("hace 3 días");
  });

  it("sin ningún precio guardado también avisa", () => {
    const [i] = detectStaleMarketFeed({
      posicionesCotizadas: 3,
      horasDesdeUltimoPrecio: null,
      posicionesSinPrecioFresco: 3,
    });
    expect(i!.body).toContain("No tenemos ningún precio guardado");
  });

  it("sin posiciones cotizadas no hay feed que vigilar", () => {
    expect(
      detectStaleMarketFeed({
        posicionesCotizadas: 0,
        horasDesdeUltimoPrecio: null,
        posicionesSinPrecioFresco: 0,
      }),
    ).toEqual([]);
  });

  it("se auto-resuelve: en cuanto vuelven los precios deja de emitirse", () => {
    const caido = detectStaleMarketFeed({
      posicionesCotizadas: 2,
      horasDesdeUltimoPrecio: 40,
      posicionesSinPrecioFresco: 2,
    });
    const vuelto = detectStaleMarketFeed({
      posicionesCotizadas: 2,
      horasDesdeUltimoPrecio: 1,
      posicionesSinPrecioFresco: 0,
    });
    expect(caido).toHaveLength(1);
    expect(vuelto).toHaveLength(0);
  });
});

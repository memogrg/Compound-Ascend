import { describe, it, expect } from "vitest";
import {
  claveCache,
  seleccionarParaRefresco,
} from "@/modules/wealth/services/portfolio-service";
import type { Holding } from "@/modules/wealth/types";

/**
 * Inicio sirve precios desde `market_price_cache` sin esperar nunca a un proveedor, y
 * refresca en segundo plano lo que esté viejo. Estos tests fijan las dos mitades de esa
 * decisión, que son las que evitan los dos fallos opuestos: servir precios rancios
 * (medidos en producción: hasta 37 h, con 2,7% de desvío) y bombardear a los proveedores
 * en cada carga.
 */

const h = (symbol: string, assetType: string): Holding =>
  ({ id: symbol, symbol, assetType, quantity: 1, averageCost: 1, currency: "USD" }) as Holding;

const AHORA = Date.parse("2026-07-20T12:00:00Z");
const haceMin = (m: number) => new Date(AHORA - m * 60_000).toISOString();
const SIN_VUELO = new Set<string>();

describe("clave de la caché de precios", () => {
  it("es el par símbolo+tipo, no el símbolo solo", () => {
    // En la tabla real conviven BTC como 'crypto' (64.376) y como 'etf' (27,84, basura
    // de una búsqueda equivocada). Cruzar solo por símbolo valoraría el bitcoin a 27 $.
    expect(claveCache("btc", "crypto")).toBe("BTC|crypto");
    expect(claveCache("BTC", "etf")).not.toBe(claveCache("BTC", "crypto"));
  });
});

describe("selección de precios a refrescar", () => {
  it("refresca lo viejo y deja en paz lo reciente", () => {
    const quotable = [h("BTC", "cripto"), h("VOO", "etf")];
    const porClave = new Map([
      [claveCache("BTC", "crypto"), { fetchedAt: haceMin(2) }], // fresco
      [claveCache("VOO", "etf"), { fetchedAt: haceMin(60) }], // viejo
    ]);
    const sel = seleccionarParaRefresco(quotable, porClave, AHORA, SIN_VUELO);
    expect(sel.map((x) => x.symbol)).toEqual(["VOO"]);
  });

  it("un símbolo sin entrada entra al refresco", () => {
    // Es la única vía de que un holding nuevo llegue a la caché sin que Inicio espere.
    const sel = seleccionarParaRefresco([h("SUI", "cripto")], new Map(), AHORA, SIN_VUELO);
    expect(sel.map((x) => x.symbol)).toEqual(["SUI"]);
  });

  it("no repite un refresco que ya está en vuelo", () => {
    const enVuelo = new Set([claveCache("ETH", "crypto")]);
    const sel = seleccionarParaRefresco([h("ETH", "cripto")], new Map(), AHORA, enVuelo);
    expect(sel).toEqual([]);
  });

  it("ignora lo no cotizable: un certificado no tiene precio de mercado", () => {
    const sel = seleccionarParaRefresco(
      [h("CUENTA ALTO", "certificado"), h("PRESTAMO", "otro")],
      new Map(),
      AHORA,
      SIN_VUELO,
    );
    expect(sel).toEqual([]);
  });

  it("el umbral es holgado frente al ttl de la tabla, para no llamar en cada carga", () => {
    // ttl_seconds vale 60/300 s; refrescar a esa cadencia dispararía una tanda de
    // llamadas en CADA apertura de Inicio. A los 10 min todavía no; a los 20 sí.
    const diez = new Map([[claveCache("SOL", "crypto"), { fetchedAt: haceMin(10) }]]);
    const veinte = new Map([[claveCache("SOL", "crypto"), { fetchedAt: haceMin(20) }]]);
    expect(seleccionarParaRefresco([h("SOL", "cripto")], diez, AHORA, SIN_VUELO)).toEqual([]);
    expect(seleccionarParaRefresco([h("SOL", "cripto")], veinte, AHORA, SIN_VUELO)).toHaveLength(1);
  });
});

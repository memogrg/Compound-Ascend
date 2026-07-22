import "server-only";

/**
 * Servicio de portafolio: orquesta holdings, precios en vivo, motores de
 * cálculo y analytics completos. Todos los montos se normalizan a la moneda
 * principal del usuario antes de pasarse al motor.
 */
import { requireUser } from "@/lib/auth/session";
import { getMarketPrice, type AssetType as MarketAssetType } from "@/lib/market-data";
import { getFxRates } from "@/lib/market-data/fx-rates";
import { convertCurrency } from "@/lib/fx";
import { getPrimaryCurrency } from "@/modules/financial-base";
import { listHoldings } from "@/modules/wealth/services/holdings-service";
import { after } from "next/server";

import { resolveAuth, type AuthContext } from "@/lib/auth/auth-context";
import { listDividends } from "@/modules/wealth/services/dividend-service";
import {
  computePortfolioAnalytics,
  computeGrowthScore,
  computeDividendAnalytics,
  computeCryptoAnalytics,
} from "@/modules/wealth/engine/portfolio-engine";
import { getWealthSummary } from "@/modules/wealth/services/wealth-service";
import type {
  Holding,
  HoldingNativo,
  PortfolioAnalytics,
  DividendAnalytics,
  CryptoAnalytics,
} from "@/modules/wealth/types";

const MARKET_TYPE: Partial<Record<string, MarketAssetType>> = {
  etf: "etf",
  accion: "stock",
  cripto: "crypto",
};

export type PortfolioReport = {
  /** CRUDOS, cada importe en la moneda de su holding. Es lo que deben usar los
   *  formularios de captura; los agregados de `analytics` van en la primaria. */
  holdings: HoldingNativo[];
  analytics: PortfolioAnalytics;
  dividendAnalytics: DividendAnalytics;
  cryptoAnalytics: CryptoAnalytics;
  currency: string;
  lastUpdated: string;
};

/**
 * Obtiene precios en vivo para los holdings cotizables y los normaliza a la
 * moneda principal. Exportada porque el snapshot de cron (sin sesión) reusa
 * exactamente la misma normalización — no depende de requireUser.
 */
export async function fetchNormalizedPrices(
  holdings: Holding[],
  primaryCurrency: string,
  rates: Record<string, number>,
  ctx?: AuthContext,
): Promise<Record<string, number>> {
  const quotable = holdings.filter((h) => MARKET_TYPE[h.assetType]);
  const prices: Record<string, number> = {};
  await Promise.all(
    quotable.map(async (h) => {
      const marketType = MARKET_TYPE[h.assetType]!;
      const quote = await getMarketPrice(h.symbol, marketType);
      if (quote) {
        prices[h.symbol.toUpperCase()] = convertCurrency(
          quote.price,
          quote.currency,
          primaryCurrency,
          rates,
        );
      }
    }),
  );

  // Respaldo: los que NINGÚN proveedor cotizó (rate-limit transitorio de CoinGecko, etc.)
  // se rellenan con el último precio RECIENTE de market_price_cache antes de rendirse a
  // "precio no disponible". Mata la intermitencia: un fallo puntual del proveedor ya no
  // tira el holding al costo cuando hay un precio bueno de minutos atrás.
  const missing = quotable.filter((h) => prices[h.symbol.toUpperCase()] === undefined);
  if (missing.length > 0) {
    await fillMissingFromCache(missing, prices, primaryCurrency, rates, ctx);
  }
  return prices;
}

/**
 * Antigüedad máxima de un precio de market_price_cache para servirlo como respaldo en el
 * camino EN VIVO. Cubre de sobra las ventanas de fallo transitorio de un proveedor sin
 * presentar como "vigente" un precio de días: pasado esto es más honesto marcar
 * priceUnavailable que mostrar un valor viejo como actual. (Contrasta con fetchCachedPrices
 * —Inicio—, que a propósito NO descarta por viejo porque no afirma un precio en vivo.)
 */
const FALLBACK_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * De las filas de market_price_cache, arma el mapa (símbolo|tipo) → precio DESCARTANDO las
 * más viejas que `maxAgeMs`. Pura y exportada: es la regla de honestidad del respaldo en
 * vivo (no servir un precio rancio como vigente), y se fija con tests sin tocar la BD.
 */
export function pickFreshCachePrice(
  rows: { symbol: string; asset_type: string; price: number | string; currency: string; fetched_at: string }[],
  now: number,
  maxAgeMs: number,
): Map<string, { price: number; currency: string }> {
  const porClave = new Map<string, { price: number; currency: string }>();
  for (const r of rows) {
    const age = now - Date.parse(r.fetched_at);
    if (!Number.isFinite(age) || age > maxAgeMs) continue;
    porClave.set(claveCache(r.symbol, r.asset_type), {
      price: Number(r.price),
      currency: r.currency,
    });
  }
  return porClave;
}

/**
 * Rellena `prices` (mutación in-place) para los holdings sin cotización en vivo, usando el
 * precio reciente de market_price_cache. Best-effort: cualquier fallo de auth/BD omite el
 * respaldo y se degrada al comportamiento previo (priceUnavailable), sin propagar.
 */
async function fillMissingFromCache(
  missing: Holding[],
  prices: Record<string, number>,
  primaryCurrency: string,
  rates: Record<string, number>,
  ctx: AuthContext | undefined,
): Promise<void> {
  try {
    const { db } = await resolveAuth(ctx);
    const symbols = [...new Set(missing.map((h) => h.symbol.toUpperCase()))];
    const types = [...new Set(missing.map((h) => MARKET_TYPE[h.assetType]!))];
    const cutoff = new Date(Date.now() - FALLBACK_MAX_AGE_MS).toISOString();
    const { data } = await db
      .from("market_price_cache")
      .select("symbol,asset_type,price,currency,fetched_at")
      .in("symbol", symbols)
      .in("asset_type", types)
      .gte("fetched_at", cutoff);

    const porClave = pickFreshCachePrice(data ?? [], Date.now(), FALLBACK_MAX_AGE_MS);
    for (const h of missing) {
      const hit = porClave.get(claveCache(h.symbol, MARKET_TYPE[h.assetType]!));
      if (hit) {
        prices[h.symbol.toUpperCase()] = convertCurrency(
          hit.price,
          hit.currency,
          primaryCurrency,
          rates,
        );
      }
    }
  } catch {
    // Sin sesión/BD: se degrada al comportamiento previo. El respaldo es un extra, no un req.
  }
}

/**
 * A partir de esta edad, un precio de la caché se manda a refrescar en segundo plano.
 * Muy por encima del `ttl_seconds` de la tabla (60 s / 300 s) a propósito: ese TTL dice
 * cuándo un precio deja de ser "fresco", pero refrescar tan seguido dispararía una tanda
 * de llamadas a proveedores en CADA carga de Inicio. 15 minutos mantiene el desvío en
 * céntimos sin castigar a los proveedores ni a sus límites de tasa.
 */
const REFRESCO_MS = 15 * 60 * 1000;

/** Símbolos que ya tienen un refresco en vuelo EN ESTA INSTANCIA. Evita que varias
 *  cargas seguidas pidan el mismo precio a la vez. No cruza instancias, y no importa:
 *  el peor caso es un fetch de más, no un dato incorrecto. */
const refrescando = new Set<string>();

/** Clave de la caché: el par símbolo+tipo, nunca el símbolo solo (en la tabla conviven
 *  filas del mismo símbolo con tipos distintos, y alguna es basura). */
export function claveCache(symbol: string, marketType: string): string {
  return `${symbol.toUpperCase()}|${marketType}`;
}

/**
 * Qué símbolos toca refrescar. Pura y exportada para poder fijarla con tests: es la
 * decisión que evita tanto servir precios de 37 horas como bombardear a los proveedores.
 */
export function seleccionarParaRefresco(
  quotable: Holding[],
  porClave: Map<string, { fetchedAt: string }>,
  ahora: number,
  enVuelo: ReadonlySet<string>,
): Holding[] {
  return quotable.filter((h) => {
    const marketType = MARKET_TYPE[h.assetType];
    if (!marketType) return false;
    const clave = claveCache(h.symbol, marketType);
    if (enVuelo.has(clave)) return false;
    const hit = porClave.get(clave);
    // Sin entrada también entra: es la única vía de que un símbolo nuevo llegue a la
    // caché sin que Inicio tenga que esperar a su primer fetch.
    return !hit || ahora - Date.parse(hit.fetchedAt) > REFRESCO_MS;
  });
}

/**
 * Refresco en segundo plano (stale-while-revalidate): la lectura NUNCA espera a esto.
 *
 * Existe porque la caché no se mantenía sola. `persist.ts` solo escribe cuando alguien
 * abre Portafolio o Patrimonio, así que si el usuario no entra ahí los precios envejecen
 * sin límite: medido en producción, la mayoría tenía entre 12 y 37 HORAS, con desvíos de
 * hasta 2,7% frente al precio en vivo. Con esto la caché se cura con el uso — abrir la
 * app la mantiene fresca — y el desvío entre Inicio y Patrimonio baja a minutos.
 *
 * Va dentro de `after()` para que Vercel no corte el trabajo al enviar la respuesta. Si
 * no hay contexto de petición (cron, scripts, tests), `after()` lanza: se ignora y
 * simplemente no se refresca, que es exactamente el comportamiento anterior.
 */
function programarRefresco(
  quotable: Holding[],
  porClave: Map<string, { fetchedAt: string }>,
): void {
  const viejos = seleccionarParaRefresco(quotable, porClave, Date.now(), refrescando);
  if (viejos.length === 0) return;

  try {
    after(async () => {
      const { getMarketPrice } = await import("@/lib/market-data");
      await Promise.all(
        viejos.map(async (h) => {
          const clave = claveCache(h.symbol, MARKET_TYPE[h.assetType]!);
          refrescando.add(clave);
          try {
            // getMarketPrice persiste el resultado en market_price_cache por su cuenta
            // (persist.ts). Aquí no se usa el valor: solo interesa el efecto secundario.
            await getMarketPrice(h.symbol, MARKET_TYPE[h.assetType]!);
          } catch {
            // Best-effort: si el proveedor falla, la caché se queda como estaba.
          } finally {
            refrescando.delete(clave);
          }
        }),
      );
    });
  } catch {
    // Fuera de una petición no hay `after()`. Sin refresco, como antes.
  }
}

/**
 * Precios desde `market_price_cache`: UNA consulta a BD y CERO red externa.
 *
 * Existe para que Inicio no espere a un proveedor. El camino en vivo
 * (`fetchNormalizedPrices`) tiene un timeout de 3 s POR PROVEEDOR y encadena
 * Finnhub → AlphaVantage → Yahoo (×2 hosts): medido, un solo símbolo que ningún
 * proveedor conoce cuesta 3,3 s, y como el fetch va en `Promise.all`, un símbolo
 * malformado en la cartera arrastra a toda la pantalla. La caché real contiene
 * símbolos así ("QQ", "KM", "I"), o sea que no es un caso hipotético.
 *
 * NO sustituye al camino en vivo: ese sigue siendo el correcto en Portafolio y es
 * quien mantiene esta tabla fresca (persist.ts, fire-and-forget tras cada fetch).
 *
 * DELIBERADO: aquí NO se descarta un precio por viejo. `ttl_seconds`/`fetched_at`
 * sirven para saber la antigüedad, pero en esta ruta un precio de hace horas es mejor
 * que ninguno y muchísimo mejor que una espera. Un símbolo sin entrada simplemente no
 * aparece en el mapa, y quien llama ya cae a `averageCost` — exactamente el mismo
 * comportamiento que cuando un proveedor falla, así que no introduce una regla nueva.
 */
export async function fetchCachedPrices(
  holdings: Holding[],
  primaryCurrency: string,
  rates: Record<string, number>,
  ctx?: AuthContext,
): Promise<Record<string, number>> {
  const quotable = holdings.filter((h) => MARKET_TYPE[h.assetType]);
  if (quotable.length === 0) return {};

  const { db } = await resolveAuth(ctx);
  const symbols = [...new Set(quotable.map((h) => h.symbol.toUpperCase()))];
  const types = [...new Set(quotable.map((h) => MARKET_TYPE[h.assetType]!))];

  const { data } = await db
    .from("market_price_cache")
    .select("symbol,asset_type,price,currency,fetched_at")
    .in("symbol", symbols)
    .in("asset_type", types);

  // El par (símbolo, tipo) es la clave: en la tabla conviven filas del MISMO símbolo con
  // tipos distintos, y algunas son basura de una búsqueda equivocada (BTC como "etf" vale
  // 27,84 mientras BTC como "crypto" vale 64.376). Cruzar solo por símbolo daría un valor
  // absurdo, así que el filtro por par se aplica igualmente en memoria.
  const porClave = new Map<string, { price: number; currency: string; fetchedAt: string }>();
  for (const r of data ?? []) {
    porClave.set(claveCache(r.symbol, r.asset_type), {
      price: Number(r.price),
      currency: r.currency,
      fetchedAt: r.fetched_at,
    });
  }

  // Se sirve lo que hay y, si está viejo, se manda a refrescar SIN esperarlo.
  programarRefresco(quotable, porClave);

  const prices: Record<string, number> = {};
  for (const h of quotable) {
    const hit = porClave.get(claveCache(h.symbol, MARKET_TYPE[h.assetType]!));
    // Misma conversión que el camino en vivo: el precio se guarda en su propia moneda.
    if (hit) {
      prices[h.symbol.toUpperCase()] = convertCurrency(
        hit.price,
        hit.currency,
        primaryCurrency,
        rates,
      );
    }
  }
  return prices;
}

/**
 * Normaliza a moneda principal los montos monetarios de un holding que están en
 * su moneda nativa: averageCost, currentValueManual (no cotizados) y rentalIncome.
 * Sin esto, el valor manual/renta quedaban en moneda nativa mientras el costo iba
 * en principal y se mezclaban en profitLoss / valor total. Exportada para que el
 * camino del cron (snapshot-service) reúse la misma lógica.
 */
export function normalizeHoldings(
  holdings: Holding[],
  primaryCurrency: string,
  rates: Record<string, number>,
): Holding[] {
  // Devuelve `Holding` PELADO, sin la marca `HoldingNativo`: estos objetos llevan los
  // importes en primaria pero conservan `currency` nativa (el spread de abajo no la toca),
  // así que no valen para capturar. Los formularios piden `HoldingNativo` y el compilador
  // rechaza lo que salga de aquí.
  return holdings.map((h) => ({
    ...h,
    averageCost: convertCurrency(h.averageCost, h.currency, primaryCurrency, rates),
    currentValueManual:
      h.currentValueManual == null
        ? h.currentValueManual
        : convertCurrency(h.currentValueManual, h.currency, primaryCurrency, rates),
    rentalIncome:
      h.rentalIncome == null
        ? h.rentalIncome
        : convertCurrency(h.rentalIncome, h.currency, primaryCurrency, rates),
  }));
}

/** Normaliza montos de dividendos a la moneda principal. */
function normalizeDividendAmounts(
  dividends: import("@/modules/wealth/types").Dividend[],
  primaryCurrency: string,
  rates: Record<string, number>,
): import("@/modules/wealth/types").Dividend[] {
  return dividends.map((d) => ({
    ...d,
    amount: convertCurrency(d.amount, d.currency, primaryCurrency, rates),
  }));
}

export async function getPortfolioReport(): Promise<PortfolioReport> {
  await requireUser();

  const [holdings, dividends, currency, rates, wealthSummary] = await Promise.all([
    listHoldings(),
    listDividends(),
    getPrimaryCurrency(),
    getFxRates(),
    getWealthSummary(),
  ]);

  const normalizedHoldings = normalizeHoldings(holdings, currency, rates);
  const prices = await fetchNormalizedPrices(holdings, currency, rates);
  const normalizedDividends = normalizeDividendAmounts(dividends, currency, rates);

  const baseAnalytics = computePortfolioAnalytics(normalizedHoldings, prices);
  const growthScore = computeGrowthScore(baseAnalytics, wealthSummary.readiness);

  const analytics: PortfolioAnalytics = { ...baseAnalytics, growthScore };

  const dividendAnalytics = computeDividendAnalytics(
    normalizedDividends,
    analytics.totalPortfolioValue,
    analytics.totalCostBasis,
  );

  const cryptoAnalytics = computeCryptoAnalytics(
    normalizedHoldings,
    prices,
    analytics.totalPortfolioValue,
  );

  return {
    holdings,
    analytics,
    dividendAnalytics,
    cryptoAnalytics,
    currency,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Valor de mercado actual del portafolio (para integración con patrimonio neto).
 * Devuelve un mapa investmentId → currentMarketValue en moneda principal.
 * Holdings sin investmentId se agrupan en "_standalone".
 */
export async function getPortfolioMarketValues(
  ctx?: AuthContext,
  /** `"cache"` resuelve precios desde market_price_cache: una consulta a BD y cero red.
   *  Para pantallas de resumen, donde esperar a un proveedor cuesta más de lo que vale
   *  la frescura. `"vivo"` (por defecto) mantiene el comportamiento de siempre. */
  opts: { precios?: "vivo" | "cache" } = {},
): Promise<{
  byInvestmentId: Record<string, number>;
  total: number;
  currency: string;
}> {
  const [holdings, currency, rates] = await Promise.all([
    listHoldings(ctx),
    getPrimaryCurrency(ctx),
    getFxRates(),
  ]);

  const normalizedHoldings = normalizeHoldings(holdings, currency, rates);
  const prices =
    opts.precios === "cache"
      ? await fetchCachedPrices(holdings, currency, rates, ctx)
      : await fetchNormalizedPrices(holdings, currency, rates, ctx);

  const byInvestmentId: Record<string, number> = {};
  let total = 0;

  for (const h of normalizedHoldings) {
    const price = prices[h.symbol.toUpperCase()];
    const value = price !== undefined ? h.quantity * price : h.quantity * h.averageCost;
    const key = h.investmentId ?? "_standalone";
    byInvestmentId[key] = (byInvestmentId[key] ?? 0) + value;
    total += value;
  }

  return { byInvestmentId, total, currency };
}

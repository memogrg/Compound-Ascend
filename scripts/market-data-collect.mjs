/**
 * Recolector de datos de mercado — corre en el runner de GitHub Actions (NO en Vercel).
 *
 * POR QUÉ ACÁ: los logs probaron que Vercel NO alcanza CoinGecko (timeout hasta para BTC → el store
 * terminaba con "$0"). Los runners de GitHub SÍ alcanzan CoinGecko. Este script:
 *   1) lee los símbolos DISTINTOS de holdings + alertas de precio activas (Supabase REST, service key),
 *   2) hace UNA llamada batched /coins/markets con TODAS las cripto (precio + ATH + fecha + high_24h),
 *   3) Finnhub por acción/ETF (máximo 52 semanas),
 *   4) UPSERTEA al store market_price_cache — RECHAZANDO precios ≤0/inválidos (nunca guarda "$0";
 *      preserva el último valor bueno) y OMITIENDO el ATH inválido para no pisar el bueno.
 *
 * Node 20 (fetch global, ESM). Sin dependencias: solo REST. Autoverifica: si había cripto objetivo
 * y NINGUNA trajo precio válido, sale con código 1 (prueba que el fetch desde el runner funciona).
 *
 * ENV (GitHub → Settings → Secrets and variables → Actions):
 *   · SUPABASE_URL                — variable (no secreto): https://<ref>.supabase.co
 *   · SUPABASE_SERVICE_ROLE_KEY   — secret (bypassa RLS; recorre TODOS los usuarios)
 *   · COINGECKO_API_KEY           — secret opcional (Demo key → header x-cg-demo-api-key, sube el rate)
 *   · FINNHUB_TOKEN               — secret opcional (sin él, no se recolectan acciones/ETF)
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;
const FINNHUB_TOKEN = process.env.FINNHUB_TOKEN;
const CG_TIMEOUT_MS = 12000;

/** asset_type del holding → tipo de mercado del feed (el que usa el store). */
const MARKET_TYPE = { etf: "etf", accion: "stock", cripto: "crypto" };

/**
 * Ids curados de CoinGecko (símbolo → id real). ESPEJO de src/lib/market-data/providers.ts:
 * COINGECKO_IDS — mantener en sync. Los no listados se resuelven vía /search (pickMatch).
 */
const COINGECKO_IDS = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  XRP: "ripple",
  ADA: "cardano",
  AVAX: "avalanche-2",
  DOGE: "dogecoin",
  LINK: "chainlink",
  MATIC: "matic-network",
  DOT: "polkadot",
  LTC: "litecoin",
  BNB: "binancecoin",
  TRX: "tron",
  SUI: "sui",
  APT: "aptos",
  ONDO: "ondo-finance",
  KMNO: "kamino",
  JUP: "jupiter-exchange-solana",
  AERO: "aerodrome-finance",
};

/** Un precio/máximo SOLO vale si es número finito y estrictamente positivo (espeja validity.ts). */
function isValidPrice(n) {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function die(msg) {
  console.error(`::error::${msg}`);
  process.exit(1);
}

async function fetchJson(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? CG_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) return { ok: false, status: res.status, body: null };
    // OJO: el upsert con Prefer:return=minimal responde 204 SIN body → res.json() reventaría
    // (SyntaxError) y quedaría mal clasificado como "network". Leemos texto y parseamos si hay.
    const text = await res.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    return { ok: true, status: res.status, body };
  } catch (err) {
    return { ok: false, status: err?.name === "AbortError" ? "timeout" : "network", body: null };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Supabase REST ----------

const sbHeaders = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function sbGet(path) {
  const r = await fetchJson(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders }, 15000);
  if (!r.ok) die(`Supabase GET ${path} falló (status ${r.status}).`);
  return Array.isArray(r.body) ? r.body : [];
}

/** Upsert de UNA fila (por-fila: así cada una puede omitir el ATH inválido sin nulear el ajeno). */
async function sbUpsert(row) {
  const r = await fetchJson(
    `${SUPABASE_URL}/rest/v1/market_price_cache?on_conflict=symbol,asset_type`,
    {
      method: "POST",
      headers: { ...sbHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(row),
    },
    15000,
  );
  if (!r.ok) console.error(`::warning::upsert ${row.symbol}/${row.asset_type} status ${r.status}`);
  return r.ok;
}

// ---------- CoinGecko ----------

const cgHeaders = COINGECKO_API_KEY ? { "x-cg-demo-api-key": COINGECKO_API_KEY } : {};

/** Elige el mejor coin por símbolo (con market cap real, mejor rank). Espeja pickCoingeckoMatch. */
function pickMatch(coins, ticker) {
  const key = ticker.toUpperCase();
  const match = (coins ?? [])
    .filter((c) => c.symbol?.toUpperCase() === key && c.market_cap_rank != null)
    .sort((a, b) => a.market_cap_rank - b.market_cap_rank)[0];
  return match?.id ?? null;
}

async function resolveId(ticker) {
  const key = ticker.toUpperCase();
  if (COINGECKO_IDS[key]) return COINGECKO_IDS[key];
  const r = await fetchJson(
    `https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(ticker)}`,
    { headers: cgHeaders },
  );
  return r.ok ? pickMatch(r.body?.coins, ticker) : null;
}

/** UNA llamada batched: precio + ATH de todas las cripto. Mapea por SÍMBOLO. */
async function cryptoMarkets(symbols) {
  const idToSymbol = new Map();
  const ids = [];
  for (const s of symbols) {
    const id = await resolveId(s);
    if (id && !idToSymbol.has(id)) {
      idToSymbol.set(id, s);
      ids.push(id);
    }
  }
  const out = {};
  if (ids.length === 0) return out;
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids.map(encodeURIComponent).join(",")}`;
  const r = await fetchJson(url, { headers: cgHeaders });
  console.log(`coingecko /coins/markets: status=${r.status} ids=${ids.length}`);
  if (!r.ok || !Array.isArray(r.body)) return out;
  for (const c of r.body) {
    const s = c.id ? idToSymbol.get(c.id) : undefined;
    if (!s) continue;
    out[s] = {
      price: typeof c.current_price === "number" ? c.current_price : null,
      ath: typeof c.ath === "number" ? c.ath : null,
      athDate: typeof c.ath_date === "string" ? c.ath_date.slice(0, 10) : null,
      high24h: typeof c.high_24h === "number" ? c.high_24h : null,
    };
  }
  return out;
}

// ---------- Finnhub (acciones/ETF) ----------

async function stockHighlight(symbol) {
  if (!FINNHUB_TOKEN) return null;
  const [q, m] = await Promise.all([
    fetchJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_TOKEN}`),
    fetchJson(`https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${FINNHUB_TOKEN}`),
  ]);
  const price = q.ok && typeof q.body?.c === "number" ? q.body.c : null;
  const high = m.ok && typeof m.body?.metric?.["52WeekHigh"] === "number" ? m.body.metric["52WeekHigh"] : null;
  const hd = m.ok ? m.body?.metric?.["52WeekHighDate"] : null;
  return { price, high, highDate: typeof hd === "string" ? hd.slice(0, 10) : null };
}

// ---------- Orquestación ----------

async function collectTargets() {
  const [holdings, alerts] = await Promise.all([
    sbGet("investment_holdings?select=symbol,asset_type&asset_type=in.(etf,accion,cripto)"),
    sbGet("price_alerts?select=symbol,asset_type&kind=eq.price&active=eq.true"),
  ]);
  const seen = new Set();
  const out = [];
  for (const row of [...holdings, ...alerts]) {
    const s = (row.symbol ?? "").trim().toUpperCase();
    const mt = MARKET_TYPE[row.asset_type ?? ""];
    if (!s || !mt) continue;
    const k = `${s}|${mt}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ symbol: s, marketType: mt });
  }
  return out;
}

/** Arma el payload del upsert. Rechaza precio inválido (→ null = no escribir); omite ATH inválido. */
function buildRow(symbol, assetType, price, currency, provider, ath, athDate, high24h, highKind) {
  if (!isValidPrice(price)) return null;
  const row = {
    symbol,
    asset_type: assetType,
    price,
    currency,
    provider,
    fetched_at: new Date().toISOString(),
    ttl_seconds: assetType === "crypto" ? 300 : 60,
  };
  if (isValidPrice(ath)) {
    row.ath_usd = ath;
    row.ath_date = athDate;
    row.high_24h = isValidPrice(high24h) ? high24h : null;
    row.high_kind = highKind;
  }
  return row;
}

async function main() {
  if (!SUPABASE_URL) die("Falta SUPABASE_URL.");
  if (!SERVICE_KEY) die("Falta SUPABASE_SERVICE_ROLE_KEY.");

  const targets = await collectTargets();
  const cryptoSymbols = targets.filter((t) => t.marketType === "crypto").map((t) => t.symbol);
  const stockTargets = targets.filter((t) => t.marketType !== "crypto");
  console.log(`targets=${targets.length} crypto=${cryptoSymbols.length} stock=${stockTargets.length}`);

  let written = 0;
  let cryptoValid = 0;

  // CRIPTO: UNA llamada batched.
  const markets = cryptoSymbols.length > 0 ? await cryptoMarkets(cryptoSymbols) : {};
  for (const [symbol, r] of Object.entries(markets)) {
    if (isValidPrice(r.price)) cryptoValid += 1;
    const row = buildRow(symbol, "crypto", r.price, "USD", "coingecko", r.ath, r.athDate, r.high24h, "ath");
    if (row && (await sbUpsert(row))) written += 1;
  }

  // ACCIONES/ETF: Finnhub por símbolo.
  for (const t of stockTargets) {
    const h = await stockHighlight(t.symbol);
    if (!h) continue;
    const row = buildRow(t.symbol, t.marketType, h.price, "USD", "finnhub", h.high, h.highDate, null, "52w");
    if (row && (await sbUpsert(row))) written += 1;
  }

  // Muestra de verificación (BTC/KMNO no deben dar 0 desde el runner).
  for (const sample of ["BTC", "KMNO"]) {
    if (markets[sample]) console.log(`  ${sample}: price=${markets[sample].price} ath=${markets[sample].ath}`);
  }
  console.log(`market-data.collect → written=${written} cryptoValid=${cryptoValid}`);

  // AUTOVERIFICACIÓN: si había cripto objetivo pero NINGUNA trajo precio válido, el fetch desde el
  // runner falló (o CoinGecko cambió) → fallamos ruidosamente en vez de dejar el store viejo en silencio.
  if (cryptoSymbols.length > 0 && cryptoValid === 0) {
    die(`Había ${cryptoSymbols.length} cripto objetivo y NINGUNA trajo precio válido — CoinGecko no respondió desde el runner.`);
  }
}

main().catch((err) => die(err?.message ?? String(err)));

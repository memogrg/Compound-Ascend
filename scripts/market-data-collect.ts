/**
 * Recolector de datos de mercado — corre en el runner de GitHub Actions (NO en Vercel).
 *
 * POR QUÉ ACÁ: los logs probaron que Vercel NO alcanza CoinGecko (timeout hasta para BTC → el store
 * terminaba con "$0"). Los runners de GitHub SÍ. Este script:
 *   1) lee los símbolos DISTINTOS de holdings + alertas de precio activas (Supabase REST, service key),
 *   2) pide precio + máximo a la CADENA de proveedores de cada tipo de activo, en orden, cada uno
 *      solo lo que los anteriores no resolvieron (src/lib/market-data/vendors),
 *   3) UPSERTEA al store market_price_cache — RECHAZANDO precios ≤0/inválidos (nunca guarda "$0";
 *      preserva el último valor bueno) y OMITIENDO el máximo inválido para no pisar el bueno,
 *   4) reporta el gasto de créditos por proveedor contra el tope del plan,
 *   5) se AUTOVERIFICA por tipo de activo, y además verifica que el primario de cada cadena haya
 *      resuelto algo: un proveedor pago muerto no puede esconderse detrás del respaldo gratis.
 *
 * TypeScript sin compilar: `node scripts/market-data-collect.ts` en Node ≥22.18, que quita los tipos
 * solo. Sin dependencias de npm; por eso todo lo que importa es TypeScript "borrable" con rutas `.ts`.
 *
 * ENV: ver docs/market-data-feed.md y el encabezado de .github/workflows/market-data-refresh.yml.
 */
import {
  budgetConfigFromEnv,
  budgetReport,
  buildChain,
  buildStoreRow,
  createBudget,
  fetchWithFallback,
  marketConfigFromEnv,
  missingKeys,
  VENDOR_KEY_ENV,
  type ChainResult,
  type MarketEnv,
  type MarketKind,
  type StoreRow,
  type VendorId,
} from "../src/lib/market-data/vendors/index.ts";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** asset_type del holding → tipo de mercado del feed (el que usa el store). */
const MARKET_TYPE: Record<string, "stock" | "etf" | "crypto"> = {
  etf: "etf",
  accion: "stock",
  cripto: "crypto",
};

type Target = { symbol: string; marketType: "stock" | "etf" | "crypto" };

function die(msg: string): never {
  console.error(`::error::${msg}`);
  process.exit(1);
}

async function rest(
  url: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number | string; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) return { ok: false, status: res.status, body: null };
    // El upsert con Prefer:return=minimal responde 204 SIN body: res.json() reventaría y quedaría
    // mal clasificado como error de red. Se lee texto y se parsea si hay.
    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    return { ok: true, status: res.status, body };
  } catch (err) {
    return {
      ok: false,
      status: err instanceof Error && err.name === "AbortError" ? "timeout" : "network",
      body: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

const sbHeaders = (): Record<string, string> => ({
  apikey: SERVICE_KEY ?? "",
  Authorization: `Bearer ${SERVICE_KEY ?? ""}`,
  "Content-Type": "application/json",
});

async function sbGet(path: string): Promise<Record<string, unknown>[]> {
  const r = await rest(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() });
  if (!r.ok) die(`Supabase GET ${path} falló (status ${r.status}).`);
  return Array.isArray(r.body) ? (r.body as Record<string, unknown>[]) : [];
}

/** Upsert de UNA fila (por fila: así cada una puede omitir el máximo inválido sin nulear el ajeno). */
async function sbUpsert(row: StoreRow): Promise<boolean> {
  const r = await rest(`${SUPABASE_URL}/rest/v1/market_price_cache?on_conflict=symbol,asset_type`, {
    method: "POST",
    headers: { ...sbHeaders(), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(row),
  });
  if (!r.ok) console.error(`::warning::upsert ${row.symbol}/${row.asset_type} status ${r.status}`);
  return r.ok;
}

async function collectTargets(): Promise<Target[]> {
  const [holdings, alerts] = await Promise.all([
    sbGet("investment_holdings?select=symbol,asset_type&asset_type=in.(etf,accion,cripto)"),
    sbGet("price_alerts?select=symbol,asset_type&kind=eq.price&active=eq.true"),
  ]);
  const seen = new Set<string>();
  const out: Target[] = [];
  for (const row of [...holdings, ...alerts]) {
    const s = String(row.symbol ?? "")
      .trim()
      .toUpperCase();
    const mt = MARKET_TYPE[String(row.asset_type ?? "")];
    if (!s || !mt) continue;
    const k = `${s}|${mt}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ symbol: s, marketType: mt });
  }
  return out;
}

const NOMBRE: Record<MarketKind, string> = { stock: "acciones/ETF", crypto: "cripto" };

/** "massive(12→10) → finnhub(2→0)": quién recibió cuántos y cuántos resolvió. */
function resumenCadena(r: ChainResult): string {
  return r.intentos.map((i) => `${i.vendor}(${i.pedidos}→${i.conPrecio})`).join(" → ") || "-";
}

async function main(): Promise<void> {
  if (!SUPABASE_URL) die("Falta SUPABASE_URL.");
  if (!SERVICE_KEY) die("Falta SUPABASE_SERVICE_ROLE_KEY.");

  const warn = (m: string) => console.log(`  · ${m}`);
  const cfg = marketConfigFromEnv(process.env as MarketEnv, (m) =>
    console.error(`::warning::${m}`),
  );
  const budget = createBudget();
  const deps = { fetch: globalThis.fetch, charge: budget.charge, warn };

  console.log(
    `cadenas → acciones: ${cfg.chains.stock.join("→")} · cripto: ${cfg.chains.crypto.join("→")} (coingecko ${cfg.coingeckoPlan})`,
  );
  // Un primario sin llave no falla: devuelve vacío y el respaldo lo tapa. Se avisa arriba de todo.
  for (const kind of ["stock", "crypto"] as const) {
    for (const id of missingKeys(cfg.chains[kind], {
      ...deps,
      keys: cfg.keys,
      coingeckoPlan: cfg.coingeckoPlan,
    })) {
      console.error(
        `::warning::${id} está en la cadena de ${NOMBRE[kind]} pero falta ${VENDOR_KEY_ENV[id]}`,
      );
    }
  }

  const targets = await collectTargets();
  const cryptoSymbols = targets.filter((t) => t.marketType === "crypto").map((t) => t.symbol);
  const stockTargets = targets.filter((t) => t.marketType !== "crypto");
  console.log(
    `targets=${targets.length} crypto=${cryptoSymbols.length} stock=${stockTargets.length}`,
  );

  const resultados: Record<MarketKind, ChainResult | null> = { stock: null, crypto: null };
  let written = 0;

  if (cryptoSymbols.length > 0) {
    const r = await fetchWithFallback(
      buildChain("crypto", cfg, deps),
      cryptoSymbols,
      "highlights",
      warn,
    );
    resultados.crypto = r;
    for (const row of Object.values(r.rows)) {
      const payload = buildStoreRow(row, "crypto");
      if (payload && (await sbUpsert(payload))) written += 1;
    }
  }

  if (stockTargets.length > 0) {
    // El store separa "stock" de "etf"; los proveedores no. Se pide todo junto y cada fila vuelve a
    // su asset_type. Un mismo símbolo como acción Y como ETF se escribe en las dos filas.
    const tipos = new Map<string, Set<string>>();
    for (const t of stockTargets) {
      if (!tipos.has(t.symbol)) tipos.set(t.symbol, new Set());
      tipos.get(t.symbol)!.add(t.marketType);
    }
    const r = await fetchWithFallback(
      buildChain("stock", cfg, deps),
      [...tipos.keys()],
      "highlights",
      warn,
    );
    resultados.stock = r;
    for (const row of Object.values(r.rows)) {
      for (const assetType of tipos.get(row.symbol) ?? []) {
        const payload = buildStoreRow(row, assetType);
        if (payload && (await sbUpsert(payload))) written += 1;
      }
    }
  }

  for (const kind of ["crypto", "stock"] as const) {
    const r = resultados[kind];
    if (!r) continue;
    console.log(`${NOMBRE[kind]}: ${resumenCadena(r)}`);
    if (r.sinPrecio.length > 0) {
      // No se escriben: su fila en el store conserva el último precio bueno y su fecha.
      console.log(
        `  sin precio en ninguna fuente (se conserva el último): ${r.sinPrecio.join(", ")}`,
      );
    }
  }
  for (const sample of ["BTC", "KMNO"]) {
    const row = resultados.crypto?.rows[sample];
    if (row)
      console.log(
        `  ${sample}: price=${row.price} ath=${row.high} rank=${row.marketCapRank ?? "-"}`,
      );
  }

  // GUARDA DE COSTO. Proyección del día a partir de esta corrida; ver budget.ts por qué es proyección.
  for (const l of budgetReport(budget.snapshot(), budgetConfigFromEnv(process.env))) {
    const tope =
      l.topeDia === null
        ? "sin tope configurado"
        : `tope ${l.topeDia}/día (${Math.round((l.pct ?? 0) * 100)}%)`;
    const linea = `créditos ${l.vendor}: ${l.creditos} esta corrida → ~${l.proyectadoDia}/día · ${tope}`;
    if (l.nivel === "excedido")
      console.error(`::error::${linea} — a este ritmo el plan se agota antes de fin de día`);
    else if (l.nivel === "aviso") console.error(`::warning::${linea} — pasó el umbral de aviso`);
    else console.log(linea);
  }

  const validos = (k: MarketKind) => Object.keys(resultados[k]?.rows ?? {}).length;
  console.log(
    `market-data.collect → written=${written} cryptoValid=${validos("crypto")} stockValid=${validos("stock")}`,
  );

  // AUTOVERIFICACIÓN. Dos preguntas por tipo de activo, las dos fatales:
  //
  // 1. ¿Algún proveedor trajo algo? Si había objetivos y NINGUNO tiene precio, el tipo entero está
  //    muerto para nosotros. Esta verificación de ACCIONES no existía y costó caro: el FINNHUB_TOKEN
  //    del Action devolvió 401 desde (al menos) el 2026-08-23 y el workflow salió `success` en TODAS
  //    las corridas, porque solo se miraba la cripto. Los ETF quedaron diez días sin recolectar.
  //
  // 2. ¿El PRIMARIO resolvió algo? Con una cadena, un primario pago con la llave vencida no deja el
  //    tipo sin precios: el respaldo gratis lo tapa, y la corrida sale verde mientras pagamos por un
  //    proveedor que no se usa. Es el mismo silencio de Finnhub, un piso más arriba.
  //
  // Se escribe TODO primero y se falla después: lo que el respaldo sí trajo queda guardado.
  const fallos: string[] = [];
  const pedidos: Record<MarketKind, number> = {
    crypto: cryptoSymbols.length,
    stock: new Set(stockTargets.map((t) => t.symbol)).size,
  };
  for (const kind of ["crypto", "stock"] as const) {
    const r = resultados[kind];
    if (!r || pedidos[kind] === 0) continue;
    const llaves = cfg.chains[kind].map((id: VendorId) => VENDOR_KEY_ENV[id]).join(", ");
    if (validos(kind) === 0) {
      fallos.push(
        `${pedidos[kind]} ${NOMBRE[kind]} objetivo y NINGUNO trajo precio válido — cadena ${cfg.chains[kind].join("→")}; revisá ${llaves} (un 401 en el log de arriba = llave inválida o vencida)`,
      );
      continue;
    }
    const primario = r.intentos[0];
    if (cfg.chains[kind].length > 1 && primario && primario.conPrecio === 0) {
      fallos.push(
        `el primario de ${NOMBRE[kind]} (${primario.vendor}) no resolvió NINGUNO de ${primario.pedidos}; lo cubrió el respaldo. Revisá ${VENDOR_KEY_ENV[primario.vendor]}, o si ese proveedor cotiza estos símbolos`,
      );
    }
  }
  if (fallos.length > 0) die(fallos.join(" · "));
}

main().catch((err: unknown) => die(err instanceof Error ? err.message : String(err)));

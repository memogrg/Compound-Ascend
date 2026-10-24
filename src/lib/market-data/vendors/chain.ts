import { isValidPrice } from "../validity.ts";
import { createCoingecko } from "./coingecko.ts";
import { createFinnhub } from "./finnhub.ts";
import { createMassive } from "./massive.ts";
import { createTwelveData } from "./twelvedata.ts";
import type { MarketKind, MarketVendor, VendorDeps, VendorHighlight, VendorId } from "./types.ts";

const VENDORS: readonly VendorId[] = ["massive", "twelvedata", "finnhub", "coingecko"];

/** Qué variable trae la llave de cada proveedor. La usan los avisos: "falta X" dice qué cargar. */
export const VENDOR_KEY_ENV: Record<VendorId, string> = {
  massive: "MASSIVE_API_KEY",
  twelvedata: "TWELVEDATA_API_KEY",
  finnhub: "FINNHUB_TOKEN",
  coingecko: "COINGECKO_API_KEY",
};

/**
 * Sin configurar, la cadena es la que corría antes de este cambio: Finnhub para acciones y
 * CoinGecko para cripto. Así mergear no cambia nada; el cambio de proveedor es un cambio de
 * variables, cuando las llaves pagas ya estén cargadas en los DOS lugares.
 */
const DEFAULT_CHAIN: Record<MarketKind, VendorId[]> = { stock: ["finnhub"], crypto: ["coingecko"] };

const KINDS: Record<VendorId, readonly MarketKind[]> = {
  massive: ["stock"],
  twelvedata: ["stock"],
  finnhub: ["stock"],
  coingecko: ["crypto"],
};

/**
 * `MARKET_PROVIDER_STOCKS="massive,finnhub"` → primario massive, respaldo finnhub. El orden ES la
 * cadena. Un nombre que no existe o que no atiende ese tipo de activo se descarta CON aviso: una
 * variable mal escrita no puede dejar un tipo de activo entero sin proveedor en silencio.
 */
export function parseChain(
  raw: string | undefined,
  kind: MarketKind,
  warn?: (msg: string) => void,
): VendorId[] {
  const pedidos = (raw ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const chain: VendorId[] = [];
  for (const p of pedidos) {
    if (!(VENDORS as readonly string[]).includes(p)) {
      warn?.(`proveedor desconocido "${p}" en la cadena de ${kind}: se ignora`);
      continue;
    }
    const id = p as VendorId;
    if (!KINDS[id].includes(kind)) {
      warn?.(`"${id}" no cotiza ${kind}: se ignora en esa cadena`);
      continue;
    }
    if (!chain.includes(id)) chain.push(id);
  }
  return chain.length > 0 ? chain : [...DEFAULT_CHAIN[kind]];
}

export function createVendor(
  id: VendorId,
  deps: VendorDeps,
  opts: { exchangeSuffixes?: Record<string, string> } = {},
): MarketVendor {
  switch (id) {
    case "massive":
      return createMassive(deps);
    case "twelvedata":
      return createTwelveData(deps, opts.exchangeSuffixes);
    case "finnhub":
      return createFinnhub(deps);
    case "coingecko":
      return createCoingecko(deps);
  }
}

/**
 * Proveedores de la cadena que NO tienen llave. CoinGecko no cuenta: sin llave usa la API pública.
 * El colector lo avisa arriba de todo, porque un primario sin llave no falla: devuelve vacío y la
 * cadena pasa en silencio al respaldo, que es exactamente cómo se esconde un 401.
 */
export function missingKeys(chain: VendorId[], deps: VendorDeps): VendorId[] {
  return chain.filter((id) => id !== "coingecko" && !deps.keys[id]);
}

export type ChainRow = VendorHighlight & { provider: VendorId };

export type ChainAttempt = { vendor: VendorId; pedidos: number; conPrecio: number };

export type ChainResult = {
  rows: Record<string, ChainRow>;
  /** Símbolos que ningún proveedor cotizó con precio válido. NO se escriben: el store conserva el último. */
  sinPrecio: string[];
  intentos: ChainAttempt[];
};

/**
 * Pide a cada proveedor de la cadena, en orden, SOLO lo que los anteriores no resolvieron.
 *
 * "Resuelto" es precio válido (> 0 y finito). Un proveedor que responde con precio 0 —mercado
 * cerrado sin barra, símbolo sin dato— cuenta como fallo para ese símbolo, igual que un 401 o un
 * timeout, y el símbolo pasa al siguiente. Si nadie lo resuelve, queda en `sinPrecio` y el
 * llamador no escribe nada: nunca un "$0" en el store.
 *
 * Un proveedor que lanza no corta la cadena.
 */
export async function fetchWithFallback(
  vendors: MarketVendor[],
  symbols: string[],
  mode: "quotes" | "highlights",
  warn?: (msg: string) => void,
): Promise<ChainResult> {
  const rows: Record<string, ChainRow> = {};
  const intentos: ChainAttempt[] = [];
  let pendientes = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];

  for (const v of vendors) {
    if (pendientes.length === 0) break;
    let res: Record<string, VendorHighlight> = {};
    try {
      res = mode === "quotes" ? await v.getQuotes(pendientes) : await v.getHighlights(pendientes);
    } catch (err) {
      warn?.(`${v.id} lanzó: ${err instanceof Error ? err.message : String(err)}`);
    }
    const resueltos = pendientes.filter((s) => isValidPrice(res[s]?.price));
    for (const s of resueltos) rows[s] = { ...res[s]!, provider: v.id };
    intentos.push({ vendor: v.id, pedidos: pendientes.length, conPrecio: resueltos.length });
    pendientes = pendientes.filter((s) => !resueltos.includes(s));
  }
  return { rows, sinPrecio: pendientes, intentos };
}

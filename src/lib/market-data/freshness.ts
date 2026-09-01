/**
 * ¿Qué tan viejo está el store de precios para las posiciones de UN usuario?
 *
 * Puro y sin IO a propósito: quien llama trae las filas de `market_price_cache` y las posiciones
 * cotizadas, y acá se decide si el feed está al día. Así la regla se fija con tests en vez de con
 * una consulta a producción.
 *
 * Existe porque el feed puede morirse sin que nada se queje: el `FINNHUB_TOKEN` del recolector
 * devolvió 401 durante más de diez días con el workflow en verde, y solo se notó cuando una
 * respuesta del asesor salió mal. Un precio viejo no rompe nada visiblemente — simplemente hace
 * que todo lo que se apoya en él sea mentira.
 */

/** asset_type del holding → tipo de mercado con el que se guarda en el store. */
const MARKET_TYPE: Record<string, string> = {
  etf: "etf",
  accion: "stock",
  cripto: "crypto",
};

/** Umbral por defecto: más de un día sin refrescar ya no es un retraso del cron. */
export const HORAS_STALE = 24;

export interface ResumenFrescura {
  posicionesCotizadas: number;
  /** Horas desde el precio MÁS RECIENTE que sirve a alguna posición. `null` = no hay ninguno. */
  horasDesdeUltimoPrecio: number | null;
  /** Posiciones cuyo precio falta o pasó el umbral. */
  posicionesSinPrecioFresco: number;
  /** true cuando hay posiciones cotizadas y ninguna tiene precio dentro del umbral. */
  stale: boolean;
}

export function resumirFrescura(args: {
  filas: { symbol: string; asset_type: string; fetched_at: string }[];
  cotizadas: { symbol: string; assetType: string }[];
  ahora: number;
  umbralHoras?: number;
}): ResumenFrescura {
  const umbralMs = (args.umbralHoras ?? HORAS_STALE) * 3600 * 1000;

  // El par (símbolo, tipo) es la clave: en el store conviven filas del MISMO símbolo con tipos
  // distintos, y algunas son basura de una búsqueda vieja (BTC como "etf" a 27,84 mientras BTC
  // como "crypto" vale 77.221). Cruzar solo por símbolo daría una frescura falsa.
  const masReciente = new Map<string, number>();
  for (const f of args.filas) {
    const t = Date.parse(f.fetched_at);
    if (!Number.isFinite(t)) continue;
    const k = `${f.symbol.toUpperCase()}|${f.asset_type}`;
    const previo = masReciente.get(k);
    if (previo === undefined || t > previo) masReciente.set(k, t);
  }

  const cotizadas = args.cotizadas.filter((h) => MARKET_TYPE[h.assetType]);
  let sinFresco = 0;
  let ultimo: number | null = null;

  for (const h of cotizadas) {
    const t = masReciente.get(`${h.symbol.toUpperCase()}|${MARKET_TYPE[h.assetType]}`);
    if (t === undefined) {
      sinFresco += 1;
      continue;
    }
    // El "último precio" se mide solo sobre filas que SIRVEN a una posición del usuario: una fila
    // fresca de un símbolo que él no tiene no dice nada sobre su portafolio.
    if (ultimo === null || t > ultimo) ultimo = t;
    if (args.ahora - t > umbralMs) sinFresco += 1;
  }

  return {
    posicionesCotizadas: cotizadas.length,
    horasDesdeUltimoPrecio: ultimo === null ? null : (args.ahora - ultimo) / 3600_000,
    posicionesSinPrecioFresco: sinFresco,
    stale: cotizadas.length > 0 && sinFresco === cotizadas.length,
  };
}

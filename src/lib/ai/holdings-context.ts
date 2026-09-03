/**
 * Mapeo PURO de las posiciones del portafolio al contexto compacto de la IA. Sin IO: recibe los
 * holdings con rendimiento (del motor de analytics, en la moneda PRIMARIA del usuario) y devuelve el
 * top-N por valor + los agregados. Vive aparte para testearse sin el setup del context-engine.
 *
 * MONEDA POR POSICIÓN: cada fila se reporta en la moneda en que ese activo COTIZA (política
 * compartida con la tabla web/móvil: holdingDisplayCurrency). Un ETF o una cripto cotizan en USD y
 * se leen en USD aunque la app esté en colones; un inmueble se lee en la moneda en que se registró.
 * Los agregados no se aplanan a una sola moneda: son SUBTOTALES por moneda (ver money.ts).
 */
import { holdingDisplayCurrency } from "@/modules/wealth/engine/quote-currency";
import { subtotales, type Monto } from "@/lib/ai/money";
import {
  mesesDesde,
  resumirValuacion,
  type FuenteValor,
  type PosicionValuada,
  type ValuacionPortafolio,
} from "@/lib/ai/valuacion-portafolio";

export type HoldingPerf = {
  symbol?: string | null;
  label?: string | null;
  assetType: string;
  quantity: number;
  costBasis: number;
  currentValue: number;
  currentPrice?: number | null;
  profitLoss: number;
  returnPct: number;
  currency: string;
  priceUnavailable: boolean;
  /** Valor escrito a mano por el usuario (no cotizadas). Null/undefined = no la valuó él. */
  currentValueManual?: number | null;
  /** Última vez que se tocó la fila; alimenta la pregunta por las manuales dormidas. */
  updatedAt?: string | null;
};

export type HoldingContext = {
  symbol: string | null;
  name: string;
  assetType: string; // etf/accion/cripto — para el carril de datos de mercado del asesor
  quantity: number;
  // Montos de la fila, TODOS en `monedaFila` (ver abajo).
  invested: number;
  value: number;
  price: number | null;
  pl: number;
  plPct: number;
  /**
   * Moneda REGISTRADA por el usuario al cargar la posición (dónde dice él que compró). NO es la
   * moneda en que se reportan los montos de la fila: para eso está `monedaFila`. Se confunden
   * fácil — una cripto registrada en CRC se REPORTA en USD, que es donde cotiza.
   */
  currency: string;
  /** Moneda en la que se REPORTAN los montos de esta fila (USD si cotiza; si no, la registrada). */
  monedaFila: string;
  /**
   * Valor de la posición en la moneda PRIMARIA del motor. Homogéneo entre posiciones → es la única
   * base honesta para porcentajes (peso en el portafolio, concentración). Los montos de la fila
   * están en monedas distintas y NO se pueden sumar entre sí.
   */
  valorPrimario: number;
  priceUnavailable: boolean;
  /**
   * De dónde sale el valor de ESTA fila: del mercado, de lo que escribió el usuario, o de ningún
   * lado (cotizable sin precio → su "valor" es el costo). Sin esto, los tres se leen igual.
   */
  fuente: FuenteValor;
};

export type HoldingsContext = {
  holdings: HoldingContext[];
  holdingsMoreCount?: number;
  /** Moneda en la que el motor entrega sus cifras (la PRINCIPAL del usuario). */
  monedaPrimaria: string;
  /** Agregados por moneda de fila: subtotales, nunca un total inventado sumando monedas distintas. */
  investmentInvested: Monto[];
  investmentValue: Monto[];
  investmentPL: Monto[];
  /** Totales del MOTOR en moneda primaria (homogéneos): base comparable para porcentajes. */
  totalPrimario: { invertido: Monto; valor: Monto; pl: Monto };
  /**
   * El desglose por FUENTE del valor. Es lo que impide que un resultado de mercado y una marca
   * escrita a mano terminen sumados en un mismo titular.
   */
  valuacion: ValuacionPortafolio;
};

/**
 * Conversor inyectado: pasa un monto de una moneda a otra. Devuelve null si NO puede convertir
 * (sin tasas). Ante null la posición se emite en la moneda primaria con su etiqueta correcta —
 * jamás un monto sin convertir rotulado con la moneda de destino.
 */
export type MontoConverter = (monto: number, desde: string, hacia: string) => number | null;

/** Máximo de posiciones listadas en el prompt (COMPACTO: el resto va como holdingsMoreCount). */
export const MAX_HOLDINGS_IN_CONTEXT = 12;

export type MapHoldingsOptions = {
  /** Moneda en la que vienen las cifras del motor (la principal del usuario). */
  monedaPrimaria: string;
  /** Sin conversor, cada fila queda en la moneda primaria (bien etiquetada, no mal rotulada). */
  convertir?: MontoConverter;
  max?: number;
  /** "Ahora" inyectable: la antigüedad de una valuación manual se fija en tests, no con el reloj. */
  ahora?: number;
};

/** Los tipos que el feed cotiza como cripto (mismo criterio que CRYPTO_TYPES del motor). */
const TIPOS_CRIPTO = new Set(["cripto"]);

/**
 * De dónde viene el valor de una posición.
 *  - `sin_precio`: el motor la marcó `priceUnavailable` → su valor es el costo, como placeholder.
 *  - `manual`: el usuario escribió el valor (certificado, préstamo, inmueble, plan).
 *  - `cripto` / `mercado`: precio del feed, separados porque no se mueven igual.
 * El orden importa: `priceUnavailable` manda sobre todo lo demás, y un valor escrito a mano manda
 * sobre el tipo de activo (si el usuario lo valuó él, la fuente es él).
 */
export function fuenteDelValor(h: {
  assetType: string;
  priceUnavailable: boolean;
  currentValueManual?: number | null;
}): FuenteValor {
  if (h.priceUnavailable) return "sin_precio";
  if (h.currentValueManual != null) return "manual";
  return TIPOS_CRIPTO.has(h.assetType) ? "cripto" : "mercado";
}

/**
 * Top-N posiciones por valor + agregados. `totalCostBasis`/`totalProfitLoss` son los del motor (en
 * moneda primaria). Los SUBTOTALES se calculan sobre TODAS las posiciones convertidas, no solo las
 * listadas: el detalle se recorta, el total no. Devuelve null si no hay posiciones.
 */
export function mapHoldingsForContext(
  perf: HoldingPerf[],
  totalCostBasis: number,
  totalProfitLoss: number,
  opts: MapHoldingsOptions,
): HoldingsContext | null {
  if (perf.length === 0) return null;
  const { monedaPrimaria, convertir, max = MAX_HOLDINGS_IN_CONTEXT, ahora = Date.now() } = opts;
  const sorted = [...perf].sort((a, b) => b.currentValue - a.currentValue);
  const todas = sorted.map((h) => toContext(h, monedaPrimaria, convertir));

  // El desglose por fuente se arma sobre TODAS las posiciones (no solo las listadas): el detalle
  // se recorta por tamaño del prompt, la honestidad del agregado no.
  const valuadas: PosicionValuada[] = todas.map((h, i) => {
    const orig = sorted[i]!;
    return {
      name: h.name,
      fuente: h.fuente,
      invested: h.invested,
      value: h.value,
      pl: h.pl,
      monedaFila: h.monedaFila,
      invertidoPrimario: Math.round(orig.costBasis),
      valorPrimario: h.valorPrimario,
      mesesSinTocar: mesesDesde(orig.updatedAt, ahora),
      // "Valuada" de verdad = el usuario puso un número distinto del costo. Si escribió el costo
      // (o lo dejó como vino), nadie está valuando esa posición.
      valorIgualCosto: h.fuente === "manual" && Math.abs(orig.currentValue - orig.costBasis) < 0.01,
    };
  });

  return {
    valuacion: resumirValuacion(valuadas),
    holdings: todas.slice(0, max),
    ...(sorted.length > max ? { holdingsMoreCount: sorted.length - max } : {}),
    monedaPrimaria,
    investmentInvested: subtotales(todas.map((h) => ({ monto: h.invested, moneda: h.monedaFila }))),
    investmentValue: subtotales(todas.map((h) => ({ monto: h.value, moneda: h.monedaFila }))),
    investmentPL: subtotales(todas.map((h) => ({ monto: h.pl, moneda: h.monedaFila }))),
    totalPrimario: {
      invertido: { monto: Math.round(totalCostBasis), moneda: monedaPrimaria },
      valor: { monto: Math.round(totalCostBasis + totalProfitLoss), moneda: monedaPrimaria },
      pl: { monto: Math.round(totalProfitLoss), moneda: monedaPrimaria },
    },
  };
}

/**
 * Una posición a su forma de contexto, con sus montos en la moneda en que cotiza. Si el conversor
 * falta o falla en CUALQUIERA de los montos, la fila entera se queda en la moneda primaria (con
 * monedaFila = primaria): mejor una fila honesta en otra moneda que una mal rotulada.
 */
function toContext(
  h: HoldingPerf,
  monedaPrimaria: string,
  convertir?: MontoConverter,
): HoldingContext {
  const objetivo = holdingDisplayCurrency(h.assetType, h.currency);
  const base = {
    symbol: h.symbol || null,
    name: h.label || h.symbol || "inversión",
    assetType: h.assetType,
    quantity: h.quantity,
    plPct: h.returnPct,
    currency: h.currency,
    valorPrimario: Math.round(h.currentValue),
    priceUnavailable: h.priceUnavailable,
    fuente: fuenteDelValor(h),
  };
  const precioPrimario = h.priceUnavailable || h.currentPrice == null ? null : h.currentPrice;
  const enPrimaria: HoldingContext = {
    ...base,
    invested: Math.round(h.costBasis),
    value: Math.round(h.currentValue),
    price: precioPrimario === null ? null : Math.round(precioPrimario),
    pl: Math.round(h.profitLoss),
    monedaFila: monedaPrimaria,
  };
  if (objetivo === monedaPrimaria) return enPrimaria;
  if (!convertir) return enPrimaria;

  const invested = convertir(h.costBasis, monedaPrimaria, objetivo);
  const value = convertir(h.currentValue, monedaPrimaria, objetivo);
  const pl = convertir(h.profitLoss, monedaPrimaria, objetivo);
  const price =
    precioPrimario === null ? null : convertir(precioPrimario, monedaPrimaria, objetivo);
  // Un solo monto sin convertir invalida la fila: se vuelve a primaria, bien etiquetada.
  if (
    invested === null ||
    value === null ||
    pl === null ||
    (precioPrimario !== null && price === null)
  ) {
    return enPrimaria;
  }
  return {
    ...base,
    invested: Math.round(invested),
    value: Math.round(value),
    price: price === null ? null : redondearPrecio(price),
    pl: Math.round(pl),
    monedaFila: objetivo,
  };
}

/**
 * Un precio en USD puede ser < 1 (DOGE ~0,24): redondear a entero lo colapsaría a 0 y parecería
 * "sin dato". Bajo 1 se guardan decimales; de 1 en adelante, entero como el resto de los montos.
 */
function redondearPrecio(n: number): number {
  const a = Math.abs(n);
  if (a === 0 || a >= 1) return Math.round(n);
  return Number(n.toFixed(a >= 0.01 ? 4 : 6));
}

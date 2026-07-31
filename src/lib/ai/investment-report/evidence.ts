/**
 * PAQUETE DE EVIDENCIA del portafolio (Etapa A del carril "deep"). PURO: cero IO, cero red, cero
 * tokens — solo deriva del FinancialContext y del ToolContext que la ruta YA construyó.
 *
 * INVARIANTE: toda cifra sale del motor o del contexto ya calculado. Acá no se estima, no se
 * proyecta y no se rellena: si falta un insumo, la sección queda `disponible: false` con el motivo
 * y qué registrar para desbloquearla. Es una FOTOGRAFÍA de datos, no una recomendación.
 */
import type { FinancialContext } from "@/lib/ai/system-prompt";
import type { ToolContext } from "@/lib/ai/orchestrator";
import { subtotales, type Monto } from "@/lib/ai/money";

/**
 * Rendimiento SUPUESTO (8% anual): el mismo que usan los Números patrimoniales (capital que, al 8%,
 * cubre X gasto). Se usa como VARA DE COMPARACIÓN contra la tasa de una deuda — no es una promesa de
 * rendimiento ni una proyección.
 */
export const RENDIMIENTO_SUPUESTO = 0.08;

/** Umbral de concentración: más de esto en una sola posición se marca como `alta` (dato, no juicio). */
export const UMBRAL_CONCENTRACION = 0.35;
/** Umbral de descalce: peso de una moneda distinta a la principal por encima de esto se marca. */
export const UMBRAL_DESCALCE = 0.5;
/** Meses de colchón por debajo de los cuales se marca "invierte con defensa corta". */
export const MESES_COLCHON_MINIMO = 3;

/** Sección que no se pudo armar: por qué falta y qué registrar para desbloquearla. */
export type SeccionFaltante = { disponible: false; motivo: string; desbloquea: string };

export type Posicion = {
  etiqueta: string; // símbolo si lo hay; si no, el nombre de la posición
  assetType: string;
  /** Montos de la posición, TODOS en `moneda` (la moneda en que ese activo cotiza). */
  invertido: number;
  valor: number;
  pl: number;
  plPct: number; // 0-1
  moneda: string; // moneda de la fila (USD si cotiza en mercado; si no, la registrada)
  monedaRegistrada: string; // en la que el usuario la cargó (puede diferir de `moneda`)
  priceUnavailable: boolean;
};

export type SeccionPosiciones =
  | SeccionFaltante
  | {
      disponible: true;
      items: Posicion[];
      /** Posiciones que existen pero no vienen listadas en el contexto (top-N). */
      masCount: number;
      // Subtotales por moneda: nunca un total que sume monedas distintas.
      invertidoTotal: Monto[];
      valorTotal: Monto[];
      plTotal: Monto[];
      /** El valor total convertido a la moneda de visualización, si había tasas. */
      valorConvertido?: Monto;
    };

export type SeccionConcentracion =
  | SeccionFaltante
  | {
      disponible: true;
      /**
       * Denominador: el valor del portafolio en la moneda BASE del motor (homogénea). Las
       * participaciones se calculan ahí, nunca sumando montos de monedas distintas. null si no se
       * pudo etiquetar la base (los porcentajes siguen siendo válidos; el monto no se imprime).
       */
      base: Monto | null;
      top1: { etiqueta: string; valor: Monto; pct: number };
      top3Pct: number;
      hhi: number; // Herfindahl-Hirschman sobre las posiciones listadas (0-1)
      mezcla: { assetType: string; pct: number }[];
      alta: boolean; // top-1 por encima de UMBRAL_CONCENTRACION
      /** El contexto trae solo el top-N: los % y el HHI son sobre lo listado. */
      parcial: boolean;
      /** Alguna posición no cotizó: su valor es el costo, no el de mercado. */
      preciosIncompletos: boolean;
    };

export type SeccionMoneda =
  | SeccionFaltante
  | {
      disponible: true;
      visualizacion: string; // ctx.currency (la moneda en que el usuario ve la app)
      /** Peso por moneda en la que cada posición COTIZA (no en la que se registró). */
      porMoneda: { currency: string; pct: number }[];
      dominante: { currency: string; pct: number };
      descalce: boolean; // dominante ≠ visualización y pesa más que UMBRAL_DESCALCE
    };

export type SeccionPlan =
  | SeccionFaltante
  | {
      disponible: true;
      invertible: number;
      independencia: number;
      brecha: number; // independencia − invertible (0 si ya lo superó)
      avancePct: number; // invertible / independencia (0-1)
      dcaMensual: number | null; // null = no hay aporte recurrente registrado
    };

export type SeccionDeuda =
  | SeccionFaltante
  | { disponible: true; sinDeudas: true }
  | {
      disponible: true;
      sinDeudas: false;
      nombre: string;
      apr: number; // 0-1
      saldo: number;
      spreadPp: number; // apr − RENDIMIENTO_SUPUESTO, en puntos porcentuales
      deudaCara: boolean; // apr > RENDIMIENTO_SUPUESTO
    };

export type SeccionDefensa =
  | SeccionFaltante
  | { disponible: true; meses: number; invierteConColchonCorto: boolean };

export type SeccionFrescura = {
  sinPrecio: string[]; // etiquetas de las posiciones que no cotizaron
  total: number; // posiciones listadas
};

export type EvidencePack = {
  currency: string; // moneda de VISUALIZACIÓN: todos los montos del paquete están en ella
  /** false → no hay ni posiciones ni valor de inversión: no hay informe que dar (el carril escala). */
  tieneInversiones: boolean;
  posiciones: SeccionPosiciones;
  concentracion: SeccionConcentracion;
  moneda: SeccionMoneda;
  plan: SeccionPlan;
  deudaVsInversion: SeccionDeuda;
  defensa: SeccionDefensa;
  frescura: SeccionFrescura;
  banderas: string[]; // códigos de diagnóstico §15, tal cual los emite el motor
};

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Suma con redondeo a entero (mismo criterio que el mapeo de holdings del contexto). */
const round = (n: number): number => Math.round(n);

export function buildEvidencePack(ctx: FinancialContext, tc: ToolContext): EvidencePack {
  const currency = tc.currency || ctx.currency;
  const holdings = ctx.holdings ?? [];
  const tieneInversiones = holdings.length > 0 || (ctx.investmentValue ?? []).some((m) => m.monto > 0);

  return {
    currency,
    tieneInversiones,
    posiciones: buildPosiciones(ctx),
    concentracion: buildConcentracion(ctx),
    moneda: buildMoneda(ctx, currency),
    plan: buildPlan(ctx, tc),
    deudaVsInversion: buildDeuda(tc),
    defensa: buildDefensa(ctx),
    frescura: buildFrescura(ctx),
    banderas: ctx.patrimonioDiagnosis ?? [],
  };
}

// ── Secciones ──

function etiquetaDe(h: NonNullable<FinancialContext["holdings"]>[number]): string {
  return h.symbol || h.name || "posición sin nombre";
}

function buildPosiciones(ctx: FinancialContext): SeccionPosiciones {
  const holdings = ctx.holdings ?? [];
  if (holdings.length === 0) {
    return {
      disponible: false,
      motivo: "no tenés posiciones de inversión registradas",
      desbloquea: "registrá tus posiciones en Patrimonio (símbolo, cantidad y costo)",
    };
  }
  return {
    disponible: true,
    items: holdings.map((h) => ({
      etiqueta: etiquetaDe(h),
      assetType: h.assetType,
      invertido: h.invested,
      valor: h.value,
      pl: h.pl,
      plPct: h.plPct,
      moneda: h.monedaFila,
      monedaRegistrada: h.currency,
      priceUnavailable: h.priceUnavailable,
    })),
    masCount: ctx.holdingsMoreCount ?? 0,
    // Del contexto si vienen; si no, subtotales de lo listado (cada monto con su moneda).
    invertidoTotal: ctx.investmentInvested ?? subtotales(holdings.map((h) => ({ monto: h.invested, moneda: h.monedaFila }))),
    valorTotal: ctx.investmentValue ?? subtotales(holdings.map((h) => ({ monto: h.value, moneda: h.monedaFila }))),
    plTotal: ctx.investmentPL ?? subtotales(holdings.map((h) => ({ monto: h.pl, moneda: h.monedaFila }))),
    ...(ctx.portfolioValueConvertido ? { valorConvertido: ctx.portfolioValueConvertido } : {}),
  };
}

function buildConcentracion(ctx: FinancialContext): SeccionConcentracion {
  const holdings = ctx.holdings ?? [];
  if (holdings.length === 0) {
    return {
      disponible: false,
      motivo: "no puedo calcular la concentración porque no hay posiciones registradas",
      desbloquea: "registrá tus posiciones en Patrimonio",
    };
  }
  // Las participaciones se calculan SIEMPRE sobre `valorPrimario` (moneda base del motor, homogénea
  // entre posiciones). Los montos de fila están en monedas distintas: sumarlos sería el bug de
  // moneda mezclada. Denominador: el total del motor si vino (incluye las no listadas); si no, la
  // suma de lo listado — nunca se estima el faltante.
  const sumaListada = holdings.reduce((a, h) => a + h.valorPrimario, 0);
  const totalBase = ctx.investmentValueBase;
  const baseMonto = totalBase && totalBase.monto > 0 ? totalBase.monto : sumaListada;
  if (!(baseMonto > 0)) {
    return {
      disponible: false,
      motivo: "no puedo calcular la concentración porque el valor del portafolio es 0",
      desbloquea: "revisá que tus posiciones tengan cantidad y costo cargados",
    };
  }
  const base: Monto | null = totalBase
    ? { monto: round(baseMonto), moneda: totalBase.moneda }
    : null; // sin etiqueta de moneda no se publica el monto; los % siguen siendo válidos

  const orden = [...holdings].sort((a, b) => b.valorPrimario - a.valorPrimario);
  const primera = orden[0]!;
  const top3 = orden.slice(0, 3).reduce((a, h) => a + h.valorPrimario, 0);
  const hhi = orden.reduce((a, h) => a + (h.valorPrimario / baseMonto) ** 2, 0);

  const porTipo = new Map<string, number>();
  for (const h of orden) porTipo.set(h.assetType, (porTipo.get(h.assetType) ?? 0) + h.valorPrimario);
  const mezcla = [...porTipo.entries()]
    .map(([assetType, valor]) => ({ assetType, pct: valor / baseMonto }))
    .sort((a, b) => b.pct - a.pct);

  return {
    disponible: true,
    base,
    // El MONTO de la posición más grande va en SU moneda; el % sale de la base homogénea.
    top1: {
      etiqueta: etiquetaDe(primera),
      valor: { monto: primera.value, moneda: primera.monedaFila },
      pct: primera.valorPrimario / baseMonto,
    },
    top3Pct: top3 / baseMonto,
    hhi,
    mezcla,
    alta: primera.valorPrimario / baseMonto > UMBRAL_CONCENTRACION,
    parcial: (ctx.holdingsMoreCount ?? 0) > 0,
    preciosIncompletos: holdings.some((h) => h.priceUnavailable),
  };
}

function buildMoneda(ctx: FinancialContext, visualizacion: string): SeccionMoneda {
  const holdings = ctx.holdings ?? [];
  // Pesos sobre `valorPrimario` (base homogénea), agrupados por la moneda en que cada posición
  // COTIZA — que es la exposición real. Una cripto registrada en colones es exposición a dólares.
  const base = holdings.reduce((a, h) => a + h.valorPrimario, 0);
  if (holdings.length === 0 || !(base > 0)) {
    return {
      disponible: false,
      motivo: "no puedo calcular la exposición por moneda porque no hay posiciones con valor",
      desbloquea: "registrá tus posiciones con su moneda en Patrimonio",
    };
  }
  const porMonedaMap = new Map<string, number>();
  for (const h of holdings) porMonedaMap.set(h.monedaFila, (porMonedaMap.get(h.monedaFila) ?? 0) + h.valorPrimario);
  const porMoneda = [...porMonedaMap.entries()]
    .map(([currency, valor]) => ({ currency, pct: valor / base }))
    .sort((a, b) => b.pct - a.pct);
  const dom = porMoneda[0]!;
  return {
    disponible: true,
    visualizacion,
    porMoneda,
    dominante: { currency: dom.currency, pct: dom.pct },
    descalce: dom.currency !== visualizacion && dom.pct > UMBRAL_DESCALCE,
  };
}

function buildPlan(ctx: FinancialContext, tc: ToolContext): SeccionPlan {
  const invertible = num(tc.investableWealth) ?? num(ctx.investableWealth);
  const independencia = num(tc.independenceNumber) ?? num(ctx.numeroDeIndependencia);
  if (independencia === undefined || !(independencia > 0)) {
    return {
      disponible: false,
      motivo: "no puedo medir la brecha porque falta tu Número de Independencia",
      desbloquea: "registrá tus gastos del mes (sobres) para que el motor lo calcule",
    };
  }
  if (invertible === undefined) {
    return {
      disponible: false,
      motivo: "no puedo medir la brecha porque falta tu patrimonio invertible",
      desbloquea: "registrá tus activos en Patrimonio",
    };
  }
  const dca = num(ctx.compromisoDesglose?.dca);
  return {
    disponible: true,
    invertible,
    independencia,
    brecha: Math.max(0, independencia - invertible),
    avancePct: invertible / independencia,
    dcaMensual: dca !== undefined && dca > 0 ? dca : null,
  };
}

function buildDeuda(tc: ToolContext): SeccionDeuda {
  const debts = tc.debts ?? [];
  if (debts.length === 0) return { disponible: true, sinDeudas: true };
  const peor = debts.reduce((a, d) => (d.apr > a.apr ? d : a));
  if (!(peor.apr > 0)) {
    return {
      disponible: false,
      motivo: "no puedo comparar tu deuda contra el rendimiento supuesto porque ninguna tiene tasa (APR) registrada",
      desbloquea: "agregá la tasa anual de tus deudas en Deudas",
    };
  }
  // Las APR del ToolContext vienen en % anual (12 = 12%); el supuesto es una fracción (0,08).
  const apr = peor.apr / 100;
  return {
    disponible: true,
    sinDeudas: false,
    nombre: peor.name,
    apr,
    saldo: peor.balance,
    spreadPp: (apr - RENDIMIENTO_SUPUESTO) * 100,
    deudaCara: apr > RENDIMIENTO_SUPUESTO,
  };
}

function buildDefensa(ctx: FinancialContext): SeccionDefensa {
  const meses = num(ctx.mesesDeColchon);
  if (meses === undefined) {
    return {
      disponible: false,
      motivo: "no puedo calcular tus meses de colchón porque falta liquidez o gasto mensual",
      desbloquea: "registrá tus cuentas líquidas y tus gastos del mes",
    };
  }
  const invierte = (ctx.holdings ?? []).length > 0 || (ctx.investmentValue ?? []).some((m) => m.monto > 0);
  return { disponible: true, meses, invierteConColchonCorto: invierte && meses < MESES_COLCHON_MINIMO };
}

function buildFrescura(ctx: FinancialContext): SeccionFrescura {
  const holdings = ctx.holdings ?? [];
  return {
    sinPrecio: holdings.filter((h) => h.priceUnavailable).map(etiquetaDe),
    total: holdings.length,
  };
}

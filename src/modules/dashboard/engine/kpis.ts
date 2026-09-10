/**
 * KPIs del Centro de mando — UNA FUENTE POR MÉTRICA.
 *
 * El panel NO calcula nada. Cada número que muestra ya lo calculó el motor unificado que
 * responde por esa métrica en el resto de la app y en el chat: el flujo del mes sale de
 * `getMonthFlow` (igual que Mi Base), la libertad de `coberturaPasiva` (igual que los tres
 * números de Patrimonio, #769), las inversiones de `getPortfolioReport` (igual que
 * "¿cómo van mis inversiones?"), las deudas de `getDebtsOverview` (igual que /deudas) y el
 * ahorro del COMPROMISO mensual (igual que el gasto de referencia del patrimonio). Este
 * archivo es el MAPEO de esos reports a las tarjetas, y nada más.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * El panel leía motores VIEJOS mientras el resto migró: `wealth.portfolio.totalInvested`
 * (tabla `investments`, vacía desde que las posiciones viven en `investment_holdings`),
 * `ind.savingsRate` (que es "lo que no presupuesté", no lo que ahorro) y `ind.debtWeight`
 * (la naturaleza `financiero` del presupuesto, no la tabla `debts`). Resultado: la misma
 * pantalla decía "Inversiones $0 · configura tu patrimonio" al lado de "18 posiciones", y
 * "0% de libertad" con dividendos, cupones y CDP configurados.
 *
 * ── REGLA DE HONESTIDAD ─────────────────────────────────────────────────────
 * Cuando la fuente de una métrica no cargó, su KPI es `null`, NUNCA cero. "Tus ingresos
 * pasivos cubren el 0% de tus gastos" y "no pude leer tu patrimonio" son afirmaciones
 * distintas, y el panel llegó a decir la primera queriendo decir la segunda.
 *
 * ── MONEDA ──────────────────────────────────────────────────────────────────
 * Todo lo que entra acá viene YA en la moneda de visualización (el servicio convierte con
 * un solo `Conversor`). Este motor no convierte: si convirtiera, habría dos lugares donde
 * hacerlo y volvería el bug de rotular ₡ con "$".
 */
import type { MonthFlow } from "@/modules/financial-base";
import type { Hito, HoldingPerformance } from "@/modules/wealth";
import type { RichTrend } from "@/modules/rich-life";
import {
  resumirValuacion,
  mesesDesde,
  type ValuacionPortafolio,
} from "@/lib/ai/valuacion-portafolio";
import { fuenteDelValor } from "@/lib/ai/holdings-context";

// ── Fuentes (lo que entregan los motores unificados) ────────────────────────

/** Lo que el panel necesita de `getPatrimonioReport` (motor de #769). */
export type PatrimonioSource = {
  coberturaPasiva: number; // 0-1+ ingreso pasivo ÷ gasto de referencia
  passiveIncomeMonthly: number;
  gastoReferenciaMensual: number;
  progresoIndependencia: number; // 0-1
  hitoAlcanzado: Hito;
  netMonthlyIncome: number;
  /** Compromiso mensual por origen; `goals` es el aporte REAL a metas, ya convertido. */
  aporteMetasMensual: number;
  aporteDcaMensual: number;
  mesesDeColchon: number;
};

/** Lo que el panel necesita de `getRichLifeSummary` (tendencia patrimonial). */
export type RichLifeSource = {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  productiveAssetsPct: number; // 0-1
  trend: RichTrend;
  wealthVelocity: number | null;
  velocityIsPartial: boolean;
};

/** Lo que el panel necesita de `getDebtsOverview` (la MISMA lectura que /deudas). */
export type DeudasSource = {
  /** Saldos vigentes, ya en moneda de visualización. */
  saldos: number[];
  incomeMonthly: number;
  /** Cuota mensual comprometida (mínimo/actual), ya convertida. Denominador del DTI. */
  pagoMensual: number;
  metodo: string | null;
};

/** Lo que el panel necesita del portafolio, con los montos YA en moneda de visualización. */
export type PortafolioSource = {
  valorTotal: number;
  costoTotal: number;
  plTotal: number;
  /** Posiciones con rendimiento, montos ya convertidos a la moneda de visualización. */
  posiciones: HoldingPerformance[];
};

export type KpisInput = {
  currency: string;
  monthFlow: MonthFlow | null;
  patrimonio: PatrimonioSource | null;
  richLife: RichLifeSource | null;
  deudas: DeudasSource | null;
  portafolio: PortafolioSource | null;
  /** Instante de referencia para la antigüedad de las valuaciones manuales (inyectable). */
  ahora?: number;
};

// ── KPIs (lo que consume la UI) ─────────────────────────────────────────────

export type FlujoKpi = {
  /** Flujo operativo REAL del mes (misma definición que Mi Base: ingreso − gasto). */
  real: number;
  /** Flujo libre PLANEADO (presupuesto del mes). */
  plan: number;
  gap: number;
  realIngreso: number;
  realGasto: number;
  planIngreso: number;
  planGasto: number;
  /** Ingreso real ÷ ingreso planeado. >1 = entró más de lo presupuestado. */
  ingresoVsPlan: number;
  /**
   * Por qué el real puede superar al plan. `null` cuando no lo supera. No se corrige el
   * número — se explica: un flujo real mayor que el ingreso presupuestado es legítimo
   * (ingreso extraordinario, un cobro adelantado, un mes con gasto aún sin registrar) y
   * lo que no era legítimo era mostrarlo sin decir de dónde salía.
   */
  explicacion: string | null;
};

export type AhorroKpi = {
  /** Aportes ÷ ingreso. La MISMA tasa que alimenta el score de salud. */
  tasa: number;
  /** Aporte mensual a metas, mensualizado y convertido (compromiso, origen `goals`). */
  aporteMetas: number;
  aporteDca: number;
  ingresoMensual: number;
  /** Runway de liquidez (motor de patrimonio), no el fondo formal de emergencia. */
  mesesDeColchon: number | null;
};

export type DeudasKpi = {
  total: number;
  /** Cuota mensual ÷ ingreso mensual (DTI), la misma razón que muestra /deudas. */
  dti: number;
  numDeudas: number;
  metodo: string | null;
};

export type GrupoInversion = { posiciones: number; valor: number; invertido: number };

export type InversionesKpi = {
  /** Valor de MERCADO del portafolio (holdings), no el monto invertido histórico. */
  valorMercado: number;
  invertido: number;
  pl: number;
  plPct: number;
  posiciones: number;
  /** El corte que impide sumar un resultado de mercado con una marca escrita a mano. */
  valuacion: ValuacionPortafolio;
  /** Posiciones valuadas por el usuario (para el aviso "valuadas por vos"). */
  manual: GrupoInversion;
  /** Cotizables sin precio ahora mismo: su "valor" es el costo, como placeholder. */
  sinPrecio: GrupoInversion;
  /** Valor y resultado SOLO de lo que tiene precio de mercado (cripto + tradicional). */
  conPrecio: GrupoInversion & { pl: number; plPct: number | null };
};

export type LibertadKpi = {
  /** Ingreso pasivo ÷ gasto de referencia (promedio mensualizado, #769). 0-1+. */
  cobertura: number;
  ingresoPasivo: number;
  gastoReferencia: number;
  progresoIndependencia: number;
  fase: Hito;
};

export type PatrimonioKpi = {
  neto: number;
  activos: number;
  pasivos: number;
  productivoPct: number;
  trend: RichTrend;
  velocidad: number | null;
  velocidadParcial: boolean;
};

export type DashboardKpis = {
  currency: string;
  flujo: FlujoKpi | null;
  ahorro: AhorroKpi | null;
  deudas: DeudasKpi | null;
  inversiones: InversionesKpi | null;
  libertad: LibertadKpi | null;
  patrimonio: PatrimonioKpi | null;
};

// ── Construcción ────────────────────────────────────────────────────────────
/**
 * Etiqueta de moneda de fila para el reparto de valuación. Es una sola porque el servicio
 * ya convirtió TODO a la moneda de visualización antes de entrar acá; el módulo compartido
 * admite varias (el asesor reporta cada posición en la moneda en que cotiza) y acá esa
 * capacidad no se usa a propósito: el panel es una sola moneda, declarada.
 */
const MONEDA_UNICA = "__display__";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
function ratio(part: number, whole: number): number {
  return whole > 0 ? round4(part / whole) : 0;
}

export function buildDashboardKpis(input: KpisInput): DashboardKpis {
  return {
    currency: input.currency,
    flujo: buildFlujo(input.monthFlow),
    ahorro: buildAhorro(input.patrimonio),
    deudas: buildDeudas(input.deudas),
    inversiones: buildInversiones(input.portafolio, input.ahora ?? Date.now()),
    libertad: buildLibertad(input.patrimonio),
    patrimonio: buildPatrimonio(input.richLife),
  };
}

function buildFlujo(mf: MonthFlow | null): FlujoKpi | null {
  if (!mf) return null;
  const real = mf.real.operatingFlow;
  const plan = mf.plan.free;
  const ingresoVsPlan = mf.plan.income > 0 ? round4(mf.real.operatingIncome / mf.plan.income) : 0;

  // El real supera al plan por una de dos razones, y decirlas es el punto: o entró más
  // dinero del presupuestado, o todavía no se registró el gasto del mes. Nunca "porque sí".
  let explicacion: string | null = null;
  if (real > plan) {
    const masIngreso = mf.real.operatingIncome > mf.plan.income;
    const menosGasto = mf.real.operatingExpense < mf.plan.expense;
    const partes: string[] = [];
    if (masIngreso) {
      partes.push(`entró ${pct(ingresoVsPlan)} de lo presupuestado como ingreso`);
    }
    if (menosGasto) {
      partes.push(
        mf.real.operatingExpense === 0
          ? "y aún no hay gasto registrado este mes"
          : "y el gasto registrado va por debajo del plan",
      );
    }
    if (partes.length > 0) explicacion = `El real supera al plan porque ${partes.join(" ")}.`;
  }

  return {
    real,
    plan,
    gap: round2(real - plan),
    realIngreso: mf.real.operatingIncome,
    realGasto: mf.real.operatingExpense,
    planIngreso: mf.plan.income,
    planGasto: mf.plan.expense,
    ingresoVsPlan,
    explicacion,
  };
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function buildAhorro(p: PatrimonioSource | null): AhorroKpi | null {
  if (!p) return null;
  return {
    tasa: ratio(p.aporteMetasMensual, p.netMonthlyIncome),
    aporteMetas: round2(p.aporteMetasMensual),
    aporteDca: round2(p.aporteDcaMensual),
    ingresoMensual: round2(p.netMonthlyIncome),
    mesesDeColchon: p.mesesDeColchon,
  };
}

function buildDeudas(d: DeudasSource | null): DeudasKpi | null {
  if (!d) return null;
  const activas = d.saldos.filter((s) => s > 0);
  return {
    total: round2(activas.reduce((s, n) => s + n, 0)),
    dti: ratio(d.pagoMensual, d.incomeMonthly),
    numDeudas: activas.length,
    metodo: d.metodo,
  };
}

function buildLibertad(p: PatrimonioSource | null): LibertadKpi | null {
  if (!p) return null;
  return {
    cobertura: p.coberturaPasiva,
    ingresoPasivo: round2(p.passiveIncomeMonthly),
    gastoReferencia: round2(p.gastoReferenciaMensual),
    progresoIndependencia: p.progresoIndependencia,
    fase: p.hitoAlcanzado,
  };
}

function buildPatrimonio(r: RichLifeSource | null): PatrimonioKpi | null {
  if (!r) return null;
  return {
    neto: round2(r.netWorth),
    activos: round2(r.totalAssets),
    pasivos: round2(r.totalLiabilities),
    productivoPct: r.productiveAssetsPct,
    trend: r.trend,
    velocidad: r.wealthVelocity,
    velocidadParcial: r.velocityIsPartial,
  };
}

/**
 * Inversiones desde el portafolio REAL (holdings a valor de mercado), con el corte
 * mercado/manual del asesor (`resumirValuacion`) para que un valor escrito a mano nunca
 * se presente como un resultado de mercado. Es exactamente el mismo reparto que responde
 * "¿cómo van mis inversiones?" en el chat — por eso se reusa el módulo, no se recalcula.
 */
function buildInversiones(p: PortafolioSource | null, ahora: number): InversionesKpi | null {
  if (!p || p.posiciones.length === 0) return null;
  const valuacion = resumirValuacion(
    p.posiciones.map((h) => {
      const fuente = fuenteDelValor(h);
      return {
        name: h.label || h.symbol || "inversión",
        fuente,
        invested: Math.round(h.costBasis),
        value: Math.round(h.currentValue),
        pl: Math.round(h.profitLoss),
        // Todo llega ya en la moneda de visualización: una sola moneda de fila.
        monedaFila: MONEDA_UNICA,
        invertidoPrimario: Math.round(h.costBasis),
        valorPrimario: Math.round(h.currentValue),
        mesesSinTocar: mesesDesde(h.updatedAt, ahora),
        valorIgualCosto: fuente === "manual" && Math.abs(h.currentValue - h.costBasis) < 0.01,
      };
    }),
  );

  const conPrecioValor = valuacion.cripto.valorPrimario + valuacion.mercado.valorPrimario;
  const conPrecioCosto = valuacion.cripto.invertidoPrimario + valuacion.mercado.invertidoPrimario;
  const conPrecioPl = conPrecioValor - conPrecioCosto;

  return {
    valorMercado: round2(p.valorTotal),
    invertido: round2(p.costoTotal),
    pl: round2(p.plTotal),
    plPct: ratio(p.plTotal, p.costoTotal),
    posiciones: p.posiciones.length,
    valuacion,
    manual: {
      posiciones: valuacion.manual.posiciones,
      valor: valuacion.manual.valorPrimario,
      invertido: valuacion.manual.invertidoPrimario,
    },
    sinPrecio: {
      posiciones: valuacion.sinPrecio.posiciones,
      valor: valuacion.sinPrecio.valorPrimario,
      invertido: valuacion.sinPrecio.invertidoPrimario,
    },
    conPrecio: {
      posiciones: valuacion.cripto.posiciones + valuacion.mercado.posiciones,
      valor: conPrecioValor,
      invertido: conPrecioCosto,
      pl: conPrecioPl,
      plPct: conPrecioCosto > 0 ? round4(conPrecioPl / conPrecioCosto) : null,
    },
  };
}

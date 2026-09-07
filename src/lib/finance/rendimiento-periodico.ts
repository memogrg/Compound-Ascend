/**
 * Rendimiento periódico de una inversión — motor puro.
 *
 * Sirve a los dos casos que pagan de forma recurrente y con retención:
 *  · DIVIDENDOS de acciones/ETF (yield anual sobre el valor, o monto fijo por pago);
 *  · CUPÓN de una nota estructurada (tasa anual sobre el capital).
 *
 * Es el mismo cálculo, así que vive una sola vez: bruto por pago → menos la
 * retención → neto por pago → neto mensualizado. El mensualizado es lo que
 * alimenta la proyección de ingreso pasivo (la línea derivada del presupuesto),
 * y por eso usa los MISMOS factores que `monthlyize`: si acá se inventara una
 * tabla de frecuencias propia, la proyección diría un número y el resto de la
 * app otro.
 *
 * La retención es dato del USUARIO, no una tasa que el producto afirme. Acá sólo
 * se aplica el porcentaje que venga.
 */
// Vive en `lib/` y no en un módulo A PROPÓSITO: lo consumen wealth (el wizard) y
// financial-base (la proyección de ingreso pasivo), y `financial-base` no puede
// importar de `wealth` — la dirección es control/wealth → financial-base, nunca
// al revés (CLAUDE.md). Desde `lib/` además se importa `monthlyize` directo: la
// regla que prohíbe imports profundos aplica a `src/modules/**`, no acá, así que
// no hace falta replicar los factores como sí tuvo que hacer `rental-roi.ts`.
import { FREQUENCY_FACTORS, type Frequency } from "@/modules/financial-base/engine/monthlyize";

/** Frecuencias con las que se puede pagar un dividendo o un cupón. */
export const FRECUENCIAS_PAGO = [
  "mensual",
  "bimensual",
  "trimestral",
  "cuatrimestral",
  "semestral",
  "anual",
] as const;

export type FrecuenciaPago = (typeof FRECUENCIAS_PAGO)[number];

export function esFrecuenciaPago(v: string | null | undefined): v is FrecuenciaPago {
  return !!v && (FRECUENCIAS_PAGO as readonly string[]).includes(v);
}

/**
 * Pagos por año de una frecuencia. Sale del factor mensual de `monthlyize`
 * (×12), no de una tabla nueva: `bimensual` es 0.5/mes → 6 al año.
 *
 * Ojo con la grafía: el motor conoce `bimensual`, no `bimestral`. Una segunda
 * grafía haría fallar el lookup en silencio (factor 0 → todo daría cero).
 */
export function pagosPorAno(frecuencia: FrecuenciaPago): number {
  return (FREQUENCY_FACTORS[frecuencia as Frequency] ?? 0) * 12;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const finito = (n: number | null | undefined): number =>
  typeof n === "number" && Number.isFinite(n) ? n : 0;

export type ConfigRendimiento = {
  /** 'yield' = % anual sobre la base; 'manual' = monto fijo por pago. */
  modo: "yield" | "manual";
  /** % ANUAL sobre la base (modo 'yield'). */
  yieldPct?: number | null;
  /** Monto BRUTO por pago (modo 'manual'). */
  montoPorPago?: number | null;
  frecuencia: FrecuenciaPago;
  /** Retención de impuestos en %, dato del usuario. */
  retencionPct?: number | null;
};

export type Rendimiento = {
  /** Bruto de UN pago. */
  brutoPorPago: number;
  /** Lo que se lleva la retención en UN pago. */
  retenidoPorPago: number;
  /** Neto de UN pago. */
  netoPorPago: number;
  /** Neto mensualizado — lo que proyecta el ingreso pasivo. */
  netoMensual: number;
  /** Neto de un año completo. */
  netoAnual: number;
  /** Rendimiento neto efectivo sobre la base, en % anual. 0 si no hay base. */
  yieldNetoPct: number;
};

/**
 * @param base valor sobre el que aplica el yield: el valor ACTUAL de mercado, o
 *   lo invertido si la posición no cotiza. Lo resuelve el llamador — el motor no
 *   sabe de precios.
 */
export function calcularRendimiento(config: ConfigRendimiento, base: number): Rendimiento {
  const porAno = pagosPorAno(config.frecuencia);
  const vacio: Rendimiento = {
    brutoPorPago: 0,
    retenidoPorPago: 0,
    netoPorPago: 0,
    netoMensual: 0,
    netoAnual: 0,
    yieldNetoPct: 0,
  };
  if (porAno <= 0) return vacio;

  const bruto =
    config.modo === "yield"
      ? (finito(base) * finito(config.yieldPct)) / 100 / porAno
      : finito(config.montoPorPago);
  if (!(bruto > 0)) return vacio;

  // La retención se acota a [0, 100]: un valor fuera de rango es un typo del
  // usuario, y dejarlo pasar daría un neto negativo o mayor al bruto.
  const retencion = Math.min(100, Math.max(0, finito(config.retencionPct)));
  const retenido = (bruto * retencion) / 100;
  const neto = bruto - retenido;

  const netoMensual = neto * (FREQUENCY_FACTORS[config.frecuencia as Frequency] ?? 0);
  const netoAnual = neto * porAno;

  return {
    brutoPorPago: round2(bruto),
    retenidoPorPago: round2(retenido),
    netoPorPago: round2(neto),
    netoMensual: round2(netoMensual),
    netoAnual: round2(netoAnual),
    yieldNetoPct: base > 0 ? Math.round((netoAnual / base) * 10000) / 100 : 0,
  };
}

/**
 * Próxima fecha de pago a partir del ancla, avanzando por la frecuencia hasta
 * alcanzar `hoy`. Devuelve el ancla misma si todavía no llegó.
 *
 * Trabaja en UTC con aritmética de calendario (no sumando días) para que un
 * ancla del día 31 no se corra: JS ya normaliza el desborde de mes, así que
 * 31/01 + 1 mes cae en marzo. Se fija el día al del ancla y, si el mes destino
 * no lo tiene, se usa su último día.
 */
export function proximaFechaPago(
  ancla: string | null | undefined,
  frecuencia: FrecuenciaPago,
  hoy: string,
): string | null {
  if (!ancla || !/^\d{4}-\d{2}-\d{2}$/.test(ancla)) return null;
  const porAno = pagosPorAno(frecuencia);
  if (porAno <= 0) return null;
  const pasoMeses = Math.max(1, Math.round(12 / porAno));

  const [ay, am, ad] = ancla.split("-").map(Number) as [number, number, number];
  let year = ay;
  let month = am;
  // Cota dura: 200 años de saltos. Sin ella, una fecha corrupta colgaría el loop.
  for (let i = 0; i < 2400; i++) {
    const dia = Math.min(ad, ultimoDiaDelMes(year, month));
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    if (iso >= hoy) return iso;
    month += pasoMeses;
    while (month > 12) {
      month -= 12;
      year += 1;
    }
  }
  return null;
}

function ultimoDiaDelMes(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Texto de la vista previa en vivo, para el alta y la edición. Vive acá para que
 * web y móvil digan LO MISMO: dos versiones del mismo cálculo se desincronizan
 * en cuanto alguien toca una.
 *
 * `formatear` lo inyecta la superficie (formatMoney con la moneda del holding);
 * el motor no sabe de formato ni de monedas.
 */
export function textoRendimiento(
  r: Rendimiento,
  retencionPct: number | null | undefined,
  formatear: (n: number) => string,
): string | null {
  if (r.brutoPorPago <= 0) return null;
  const retencion = Math.min(100, Math.max(0, finito(retencionPct)));
  const bruto = `≈ ${formatear(r.brutoPorPago)} brutos por pago`;
  // Sin retención no se menciona el impuesto: una línea que dice "−0%" es ruido.
  const impuesto =
    retencion > 0 ? ` · −${retencion}% impuestos = ${formatear(r.netoPorPago)} netos` : "";
  return `${bruto}${impuesto} · ≈ ${formatear(r.netoMensual)} netos/mes`;
}

/**
 * PROMEDIO mensual del ingreso derivado de una inversión — motor puro.
 *
 * El mismo corte que #740, aplicado al rendimiento de las inversiones:
 *
 *   · `monthlyPlanned` (calendario) → la LÍNEA DEL PRESUPUESTO y el flujo del
 *     mes: el pago completo, sólo en los meses que toca. Vive en
 *     `derived-budget-service`.
 *   · `monthlyize` (promedio)       → TODO INDICADOR LONGITUDINAL: cobertura de
 *     ingreso pasivo, score de salud, snapshots, los tres números. Vive acá.
 *
 * Por qué importa: un cupón trimestral de $200 escrito por calendario hace que
 * la cobertura pasiva diga 0% dos meses y el triple el tercero. Ese número
 * responde "¿cuánto de mi vida pagan mis activos?", y esa respuesta no cambia
 * porque el emisor pague en marzo y no en abril. El flujo del mes sí cambia, y
 * por eso son dos números y no uno.
 *
 * Un pago ÚNICO al vencimiento promedia CERO: no es ingreso recurrente. Diluirlo
 * a lo largo del plazo diría que hoy cubre gastos que hoy no cubre.
 */

import {
  calcularRendimiento,
  esFrecuenciaPago,
  esPagoAlVencimiento,
} from "@/lib/finance/rendimiento-periodico";

/** Meses que cubre UN pago de cada frecuencia de renta (`RentalFrequency`). */
const MESES_POR_PAGO: Record<string, number> = {
  semanal: 12 / 52,
  mensual: 1,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

/** Forma estructural de la fila de `investment_holdings` que se necesita. */
export type FilaRendimiento = {
  quantity?: number | null;
  average_cost?: number | null;
  current_value_manual?: number | null;
  payout_enabled?: boolean | null;
  payout_mode?: string | null;
  payout_rate_pct?: number | null;
  payout_amount?: number | null;
  payout_frequency?: string | null;
  payout_withholding_pct?: number | null;
};

export type FilaRenta = {
  rental_income?: number | null;
  rental_frequency?: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Base del yield: el valor manual manda, si no lo invertido. */
export function baseDelRendimiento(h: FilaRendimiento): number {
  const invertido = Number(h.quantity ?? 0) * Number(h.average_cost ?? 0);
  return Number(h.current_value_manual ?? 0) || invertido;
}

/**
 * Promedio mensual del dividendo/cupón CONFIGURADO, neto de retención.
 * Cero si no hay configuración o si el pago es único al vencimiento.
 */
export function promedioMensualPayout(h: FilaRendimiento): number {
  if (!h.payout_enabled) return 0;
  // Un pago único no es un flujo: promedia cero hasta que llega.
  if (esPagoAlVencimiento(h.payout_frequency)) return 0;
  if (!esFrecuenciaPago(h.payout_frequency)) return 0;

  return round2(
    calcularRendimiento(
      {
        modo: h.payout_mode === "manual" ? "manual" : "yield",
        yieldPct: h.payout_rate_pct,
        montoPorPago: h.payout_amount,
        frecuencia: h.payout_frequency,
        retencionPct: h.payout_withholding_pct,
      },
      baseDelRendimiento(h),
    ).netoMensual,
  );
}

/**
 * Promedio mensual de la renta declarada (alquiler, bono, CDP, préstamo).
 * Cero al vencimiento, por lo mismo que arriba.
 */
export function promedioMensualRenta(h: FilaRenta): number {
  const renta = Number(h.rental_income ?? 0);
  if (!(renta > 0)) return 0;
  if (esPagoAlVencimiento(h.rental_frequency)) return 0;
  const meses = MESES_POR_PAGO[h.rental_frequency ?? "mensual"] ?? 1;
  return round2(renta / meses);
}

/**
 * Promedio del dividendo SIN configurar: lo realmente cobrado en 12 meses.
 * Ya era un promedio (no tiene calendario conocido), y se conserva para no
 * perder de vista a quien cobra dividendos sin haberlos declarado.
 */
export function promedioMensualHistorial(totalUltimos12Meses: number): number {
  return round2(totalUltimos12Meses / 12);
}

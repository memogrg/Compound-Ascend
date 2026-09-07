/**
 * Recordatorio de COBRO de dividendo — detector puro.
 *
 * Cuando una posición tiene dividendos configurados y su fecha de pago llegó, el
 * usuario recibe un aviso con el monto NETO estimado y lo registra de un toque.
 * El monto sale del mismo motor que la proyección de ingreso pasivo, así que el
 * recordatorio y el flujo del mes no pueden decir cifras distintas.
 *
 * POR QUÉ ES UN INSIGHT Y NO UNA ALERTA. `price_alerts` tiene tipos por fecha
 * (`vesting`), pero son alertas que el usuario CREA y administra en el gestor —
 * una por evento, con su fecha. Esto es otra cosa: se deriva de la config del
 * holding, se repite con la frecuencia, y su acción es registrar el cobro. Vive
 * en el riel de insights, que ya reconcilia por (kind, related_id): el aviso se
 * auto-resuelve cuando el detector deja de emitirlo, o sea cuando el dividendo
 * se registró y la próxima fecha se corrió.
 *
 * NO se emite antes de tiempo: un aviso de "cobrá" días antes de que el emisor
 * pague sólo genera un registro con fecha equivocada.
 */
import { calcularRendimiento, esFrecuenciaPago } from "@/lib/finance/rendimiento-periodico";
import type { DetectedInsight } from "@/lib/insights/types";

export type HoldingConDividendo = {
  id: string;
  label: string;
  currency: string;
  /** Base del yield: valor manual si lo hay, si no lo invertido. */
  base: number;
  payoutEnabled: boolean;
  payoutMode: string | null;
  payoutRatePct: number | null;
  payoutAmount: number | null;
  payoutFrequency: string | null;
  payoutWithholdingPct: number | null;
  /** Ancla del próximo pago (YYYY-MM-DD). */
  payoutNextDate: string | null;
  /** Fecha del último dividendo YA registrado para esta posición, si hay. */
  ultimoPagoRegistrado?: string | null;
};

/**
 * @param hoy fecha del usuario (YYYY-MM-DD), en SU zona — no UTC: el aviso tiene
 *   que aparecer el día que para él es el día de pago.
 */
export function detectDividendosPorCobrar(
  holdings: HoldingConDividendo[],
  hoy: string,
): DetectedInsight[] {
  const out: DetectedInsight[] = [];

  for (const h of holdings) {
    if (!h.payoutEnabled || !esFrecuenciaPago(h.payoutFrequency)) continue;
    const vence = h.payoutNextDate;
    if (!vence || vence > hoy) continue; // todavía no toca

    // Ya se registró un pago en esa fecha o después: el cobro está hecho y el
    // aviso no tiene nada que pedir. Sin esto, el recordatorio se quedaría
    // pegado hasta que alguien mueva el ancla a mano.
    if (h.ultimoPagoRegistrado && h.ultimoPagoRegistrado >= vence) continue;

    const r = calcularRendimiento(
      {
        modo: (h.payoutMode as "yield" | "manual") ?? "yield",
        yieldPct: h.payoutRatePct,
        montoPorPago: h.payoutAmount,
        frecuencia: h.payoutFrequency,
        retencionPct: h.payoutWithholdingPct,
      },
      h.base,
    );
    if (r.netoPorPago <= 0) continue; // sin monto estimable no hay nada que prellenar

    const retuvo =
      r.retenidoPorPago > 0
        ? ` (${redondear(r.brutoPorPago)} brutos menos ${redondear(r.retenidoPorPago)} de impuestos)`
        : "";

    out.push({
      kind: "dividendo_por_cobrar",
      severity: "accionar",
      title: `¿Te llegó el dividendo de ${h.label}?`,
      body:
        `Según lo que configuraste, tocaba cobrar el ${formatoCorto(vence)}: ` +
        `≈ ${redondear(r.netoPorPago)} ${h.currency} netos${retuvo}. ` +
        `Registralo y lo ajustás si el monto real fue otro.`,
      metric: r.netoPorPago,
      relatedKind: "holding",
      relatedId: h.id,
    });
  }

  return out;
}

const redondear = (n: number) => String(Math.round(n * 100) / 100);

/** DD/MM — corto a propósito: el aviso ya dice de qué posición habla. */
function formatoCorto(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

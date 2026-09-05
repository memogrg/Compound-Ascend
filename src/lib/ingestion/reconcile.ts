/**
 * CONCILIADOR entre fuentes. Un mismo gasto puede entrar por dos puertas: la
 * persona lo escanea del recibo (o lo teclea, o lo importa del estado de cuenta)
 * y, horas después, llega el aviso del banco por correo. Sin conciliar, queda dos
 * veces. Este módulo decide si dos movimientos "parecen el mismo"; PURO y sin
 * "server-only": se prueba sin BD.
 *
 * Reglas (todas a la vez):
 *  · mismo tipo (gasto/ingreso) y misma moneda;
 *  · mismo monto al céntimo — el banco no redondea; si difiere, es otra cosa;
 *  · fecha igual o a un día de distancia — el recibo se fecha cuando se compra,
 *    el banco cuando liquida, y el correo puede llegar pasada la medianoche;
 *  · comercio parecido si los dos lo traen; si a uno le falta, alcanza el resto.
 *
 * Reutiliza la comparación de comercios de la guarda anti-duplicado del chat para
 * que "parecido" signifique lo mismo en toda la app.
 */
import { comercioParecido, normalizarComercio } from "@/lib/ai/duplicate-guard";

export interface Movimiento {
  id: string;
  kind: "gasto" | "ingreso";
  amount: number;
  currency: string;
  occurredOn: string; // YYYY-MM-DD
  merchant: string | null;
}

const MS_DIA = 24 * 60 * 60 * 1000;

function diasEntre(a: string, b: string): number {
  const ta = Date.parse(`${a}T00:00:00Z`);
  const tb = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return Number.POSITIVE_INFINITY;
  return Math.abs(ta - tb) / MS_DIA;
}

function mismoMonto(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

/** ¿`a` y `b` describen el mismo movimiento entrado por dos fuentes? */
export function parecenElMismo(a: Movimiento, b: Movimiento): boolean {
  if (a.kind !== b.kind) return false;
  if (a.currency.toUpperCase() !== b.currency.toUpperCase()) return false;
  if (!mismoMonto(a.amount, b.amount)) return false;
  if (diasEntre(a.occurredOn, b.occurredOn) > 1) return false;
  const ma = normalizarComercio(a.merchant ?? "");
  const mb = normalizarComercio(b.merchant ?? "");
  if (ma && mb) return comercioParecido(ma, mb);
  return true; // uno de los dos no trae comercio: mandan monto, moneda y fecha
}

/**
 * El mejor candidato para `cand` entre `existentes`, o null. Con varios, gana el
 * de la MISMA fecha y, a igualdad, el de comercio parecido.
 */
export function buscarCandidato<T extends Movimiento>(cand: Movimiento, existentes: T[]): T | null {
  let mejor: T | null = null;
  let mejorPuntaje = -1;
  for (const e of existentes) {
    if (e.id === cand.id) continue;
    if (!parecenElMismo(cand, e)) continue;
    const mismaFecha = e.occurredOn === cand.occurredOn ? 2 : 0;
    const comercio =
      e.merchant && cand.merchant && comercioParecido(e.merchant, cand.merchant) ? 1 : 0;
    const puntaje = mismaFecha + comercio;
    if (puntaje > mejorPuntaje) {
      mejor = e;
      mejorPuntaje = puntaje;
    }
  }
  return mejor;
}

/** Ventana de fechas [desde, hasta] que cubre a todos los candidatos con ±1 día. */
export function ventanaDeFechas(
  items: { occurredOn: string }[],
): { desde: string; hasta: string } | null {
  if (items.length === 0) return null;
  const fechas = items.map((i) => i.occurredOn).sort();
  const shift = (d: string, dias: number) => {
    const t = new Date(`${d}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + dias);
    return t.toISOString().slice(0, 10);
  };
  return { desde: shift(fechas[0]!, -1), hasta: shift(fechas[fechas.length - 1]!, 1) };
}

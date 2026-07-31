/**
 * MONTOS MULTIMONEDA para el contexto del asesor (puro, sin "server-only": testeable).
 *
 * INVARIANTE de la casa: ningún monto viaja sin su moneda al lado. Cuando hay que sumar montos de
 * monedas distintas NO se inventa un total: se dan SUBTOTALES por moneda. El total convertido solo
 * aparece si hay tasas para TODAS las monedas involucradas; si falta una, `convertirTotal` devuelve
 * null y el llamador omite el total — nunca etiqueta un monto con la moneda de otro (misma
 * disciplina que `convertInvested` en el router).
 *
 * Formato con CÓDIGO de moneda ("1250 USD"), no símbolo: el system prompt no usa símbolos, y "$"
 * es ambiguo entre USD/MXN/COP. Para texto de CARA AL USUARIO usá formatMoney (con símbolo).
 */
import { convertCurrency } from "@/lib/fx";

/** Un monto CON su moneda. La unidad mínima que puede viajar por el contexto. */
export type Monto = { monto: number; moneda: string };

const MINUS = "−";

/** Número legible: entero si lo es; si no, hasta 2 decimales sin ceros de relleno. */
function numStr(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, "");
}

/** "1250 USD" / "−42000 CRC". El monto NUNCA sale sin su código de moneda. */
export function montoStr(m: Monto): string {
  const abs = Math.abs(m.monto);
  return `${m.monto < 0 ? MINUS : ""}${numStr(abs)} ${m.moneda}`;
}

/** Como montoStr pero con signo SIEMPRE explícito ("+380 USD"): para P/L, donde el signo es el dato. */
function montoStrConSigno(m: Monto): string {
  const abs = Math.abs(m.monto);
  return `${m.monto < 0 ? MINUS : "+"}${numStr(abs)} ${m.moneda}`;
}

/**
 * Agrupa por moneda y suma. Orden descendente por |monto| (lo más pesado primero, sin importar si
 * es ganancia o pérdida). Los montos no finitos se ignoran; una moneda vacía no se inventa.
 */
export function subtotales(ms: Monto[]): Monto[] {
  const acc = new Map<string, number>();
  for (const m of ms) {
    if (!m.moneda || !Number.isFinite(m.monto)) continue;
    acc.set(m.moneda, (acc.get(m.moneda) ?? 0) + m.monto);
  }
  return [...acc.entries()]
    .map(([moneda, monto]) => ({ moneda, monto }))
    .sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto));
}

/**
 * Los subtotales en una línea. Sin negativos une con " + " ("1250 USD + 800000 CRC"); si hay alguno
 * negativo (P/L mixto) usa signo explícito en todos y los separa con espacio ("+380 USD −42000 CRC"),
 * porque ahí un " + " entre términos se leería como suma de cosas que no se suman.
 * Lista vacía → "" (el llamador decide si omite la línea).
 */
export function subtotalesStr(ms: Monto[]): string {
  const subs = subtotales(ms);
  if (subs.length === 0) return "";
  if (subs.some((m) => m.monto < 0)) return subs.map(montoStrConSigno).join(" ");
  return subs.map(montoStr).join(" + ");
}

/**
 * Total convertido a `destino`. Devuelve null —y el llamador OMITE el total— si la lista está vacía
 * o si falta la tasa de cualquier moneda involucrada: convertCurrency devuelve el monto SIN convertir
 * cuando no conoce la tasa, así que confiar en él ciegamente etiquetaría colones como dólares.
 */
export function convertirTotal(
  ms: Monto[],
  destino: string,
  rates: Record<string, number> | null | undefined,
): Monto | null {
  const subs = subtotales(ms);
  if (subs.length === 0 || !destino) return null;
  if (subs.length === 1 && subs[0]!.moneda === destino) return { monto: subs[0]!.monto, moneda: destino };
  if (!rates || !rates[destino]) return null;
  let total = 0;
  for (const m of subs) {
    if (m.moneda === destino) {
      total += m.monto;
      continue;
    }
    if (!rates[m.moneda]) return null; // sin tasa: no hay total honesto que dar
    total += convertCurrency(m.monto, m.moneda, destino, rates);
  }
  if (!Number.isFinite(total)) return null;
  return { monto: Math.round(total), moneda: destino };
}

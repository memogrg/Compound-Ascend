/**
 * La lógica del selector de mes, pura y compartida.
 *
 * Vivía dentro de `financial-base/components/v2/period-selector.tsx`. El control global de
 * la barra superior v2 necesita exactamente las mismas opciones, así que se extrae aquí en
 * vez de copiarse: dos ventanas de meses distintas en la misma pantalla serían un bug
 * esperando. `period-selector.tsx` ahora importa de este módulo y no cambió su comportamiento.
 *
 * Client-safe y sin `Intl`: los nombres de mes son una tabla nuestra, como en `format.ts`.
 * `Intl` da resultados distintos según la versión de ICU del entorno, y el servidor y el
 * WebView de iOS no coinciden.
 */

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** ~18 meses hacia atrás (incluye el mes actual). */
export const BACK_MONTHS = 17;
/** Un mes futuro, para planificar. */
export const FWD_MONTHS = 1;

const ES_MES = /^\d{4}-\d{2}$/;

export type OpcionPeriodo = { value: string; label: string };

/** "2026-09" → "sep 2026". Devuelve la cadena tal cual si no es un mes válido. */
export function labelPeriodo(period: string): string {
  if (!ES_MES.test(period)) return period;
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${y}`;
}

/** "YYYY-MM" del mes al que pertenece `d`, en la zona del propio `Date`. */
function aPeriodo(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
}

/**
 * Opciones ancladas al mes actual REAL (`now`), no al `current` seleccionado.
 * Así el mes actual siempre aparece sin importar cuál esté elegido (antes se
 * generaban hacia atrás desde `current`, y elegir un mes viejo "escondía" los
 * más nuevos). Si `current` cae fuera del rango (deep-link antiguo), se inserta.
 */
export function buildOptions(current: string, now = new Date()): OpcionPeriodo[] {
  const out: OpcionPeriodo[] = [];
  // Arranca en el mes futuro más lejano y baja hasta BACK_MONTHS atrás.
  let y = now.getFullYear();
  let m = now.getMonth() + 1 + FWD_MONTHS;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  for (let i = 0; i < BACK_MONTHS + 1 + FWD_MONTHS; i++) {
    out.push({ value: aPeriodo(y, m), label: labelPeriodo(aPeriodo(y, m)) });
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  // Garantiza que el periodo seleccionado siempre esté disponible.
  if (ES_MES.test(current) && !out.some((o) => o.value === current)) {
    out.push({ value: current, label: labelPeriodo(current) });
    out.sort((a, b) => b.value.localeCompare(a.value)); // descendente
  }
  return out;
}

/** Opción mínima (solo el mes seleccionado) para el primer render/SSR. */
export function currentOption(current: string): OpcionPeriodo {
  return { value: current, label: labelPeriodo(current) };
}

/** Mes desplazado `delta` posiciones. `shiftPeriodo("2026-01", -1)` → "2025-12". */
export function shiftPeriodo(period: string, delta: number): string {
  if (!ES_MES.test(period)) return period;
  const [y, m] = period.split("-").map(Number);
  // Índice absoluto de meses: evita el arrastre manual de años y el desborde de `Date`.
  const total = (y ?? 0) * 12 + ((m ?? 1) - 1) + delta;
  return aPeriodo(Math.floor(total / 12), (total % 12) + 1);
}

/**
 * ¿Se puede avanzar/retroceder desde `period`?
 *
 * El tope superior es el mes actual más `FWD_MONTHS`: más allá no hay nada que planificar y
 * el `<select>` tampoco lo ofrece, así que la flecha se apaga en vez de llevar a un mes que
 * no está en la lista. Hacia atrás no hay tope: un deep-link viejo debe seguir navegable.
 */
export function puedeAvanzar(period: string, now = new Date()): boolean {
  if (!ES_MES.test(period)) return false;
  const tope = shiftPeriodo(aPeriodo(now.getFullYear(), now.getMonth() + 1), FWD_MONTHS);
  return period < tope;
}

export function puedeRetroceder(period: string): boolean {
  return ES_MES.test(period);
}

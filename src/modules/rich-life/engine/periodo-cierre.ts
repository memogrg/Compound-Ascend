/**
 * Nombre del mes de un periodo de cierre, para rotular el veredicto patrimonial.
 *
 * El veredicto ("te estás haciendo más rico") compara los DOS últimos meses CERRADOS, y
 * la cifra que lo acompaña ("−₡235.082 en lo que va del mes") va de ese último cierre a
 * HOY. Son dos periodos distintos, y pegados en la misma fila se leían como una sola
 * afirmación contradictoria: el veredicto positivo al lado de un número negativo. Por eso
 * el veredicto nombra el suyo.
 *
 * El periodo llega como el primer día del mes ("2026-08-01"), que es como lo guarda
 * `net_worth_snapshots`. Se parte la cadena a mano en lugar de construir un `Date`: el
 * constructor interpreta "2026-08-01" como UTC y, al leerlo con `getMonth()` en una zona
 * al oeste (Costa Rica, UTC−6), devuelve julio. Aquí no hay zona que valga — el periodo
 * ya es una etiqueta, no un instante.
 */

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "setiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

/** "2026-08-01" → "agosto". null si el periodo falta o no es un mes válido. */
export function nombreDelMes(period: string | null | undefined): string | null {
  if (!period) return null;
  const [, mes] = period.split("-");
  if (mes === undefined) return null;
  const n = Number(mes);
  if (!Number.isInteger(n) || n < 1 || n > 12) return null;
  return MESES[n - 1] ?? null;
}

/**
 * Rótulo del veredicto con su periodo: "Te estás haciendo más rico · cierre de agosto".
 * Sin periodo reconocible devuelve el rótulo tal cual — nunca inventa un mes.
 */
export function rotuloConCierre(label: string, period: string | null | undefined): string {
  const mes = nombreDelMes(period);
  return mes ? `${label} · cierre de ${mes}` : label;
}

/**
 * Hasta cuándo llega una serie de snapshots, dicho en palabras.
 *
 * Existe porque la pantalla dejó de escribir su propio punto. Mientras `/m/patrimonio`
 * guardaba el snapshot de HOY al cargar, la curva terminaba siempre hoy y la fecha sobraba;
 * con la escritura en el cron, la serie puede terminar ayer —o la semana pasada, si el barrido
 * falló— y una curva sin fecha se sigue leyendo como si llegara hasta hoy.
 *
 * Puro y sin `Date` del sistema: recibe el hoy del USUARIO (zona del perfil, `lib/time`), que
 * es el único «hoy» que esta app reconoce. Devuelve `null` cuando no hay nada que aclarar —el
 * punto ya es de hoy, o no hay puntos—, para no añadir ruido a la pantalla feliz.
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
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

/** Días entre dos fechas ISO (YYYY-MM-DD), en UTC para no depender de la zona del proceso. */
function diasEntre(desdeIso: string, hastaIso: string): number {
  const a = Date.parse(`${desdeIso}T00:00:00Z`);
  const b = Date.parse(`${hastaIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * @param puntos Serie de snapshots; solo se mira `date` (ISO `YYYY-MM-DD`).
 * @param hoyIso El hoy del usuario, en su zona.
 * @returns El rótulo, o `null` si el último punto ya es de hoy (o no hay ninguno).
 */
export function etiquetaUltimoDato(puntos: { date: string }[], hoyIso: string): string | null {
  if (puntos.length === 0) return null;
  // La fecha MÁS ALTA, no la última del array: el rótulo no puede depender del orden en que
  // llegó la serie.
  const ultimo = puntos.reduce((max, p) => (p.date > max ? p.date : max), puntos[0]!.date);
  const dias = diasEntre(ultimo, hoyIso);
  // Hoy —o, por si acaso, una fecha futura— no se anuncia: decir «último dato: mañana» sería
  // peor que no decir nada.
  if (dias <= 0) return null;

  const [anio, mes, dia] = ultimo.split("-");
  const nombreMes = MESES[Number(mes) - 1] ?? mes;
  const mismoAnio = anio === hoyIso.slice(0, 4);
  const fecha = mismoAnio
    ? `${Number(dia)} de ${nombreMes}`
    : `${Number(dia)} de ${nombreMes} de ${anio}`;
  // «al <fecha>» y no «ayer»: una fecha se lee igual mañana, cuando la captura de hoy quede
  // guardada en un informe o en un ticket, y no obliga a saber cuándo se miró la pantalla.
  return `Datos al ${fecha}`;
}

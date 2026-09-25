/**
 * La aritmética del calendario de gasto. Pura, sin React ni fechas locales del navegador.
 *
 * Todo se calcula sobre la fecha ISO en texto (`YYYY-MM-DD`). No se usa `new Date()` ni
 * `getDate()` sobre un `Date`: el servidor corre en UTC y el mismo día caería en otra casilla
 * según la zona de quien mira. Es la misma regla que ya obliga `lib/time/user-time`.
 */

/** Días de un mes. Año bisiesto incluido, sin `Date`. */
export function diasDelMes(anio: number, mes: number): number {
  if (mes === 2) return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(mes) ? 30 : 31;
}

/**
 * Día de la semana de una fecha, con **lunes = 0**. Congruencia de Zeller, sin `Date`.
 *
 * Lunes primero porque es como se lee un mes en Costa Rica; con domingo primero, los fines
 * de semana quedan partidos entre la primera y la última columna y el patrón de gasto de
 * fin de semana —que es justo lo que este gráfico existe para mostrar— deja de verse.
 */
export function diaDeLaSemana(anio: number, mes: number, dia: number): number {
  const m = mes < 3 ? mes + 12 : mes;
  const a = mes < 3 ? anio - 1 : anio;
  const k = a % 100;
  const j = Math.floor(a / 100);
  // Zeller da 0 = sábado; se rota a 0 = lunes.
  const h =
    (dia + Math.floor((13 * (m + 1)) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) + 5 * j) % 7;
  return (h + 5) % 7;
}

export type CeldaCalendario = {
  /** `YYYY-MM-DD`, o `null` en los huecos de relleno antes del día 1 y después del último. */
  fecha: string | null;
  dia: number | null;
  /** Columna 0-6 (lunes a domingo) y fila dentro de la grilla. */
  columna: number;
  fila: number;
};

const dd = (n: number) => String(n).padStart(2, "0");

/**
 * La grilla de un mes: filas de siete celdas, de lunes a domingo, con huecos al principio y
 * al final.
 *
 * Los huecos existen y no se omiten: sin ellos, un mes que empieza en jueves correría todos
 * los días una columna a la izquierda y el 1 aparecería bajo «lunes». La rejilla tiene que
 * mentir menos que ahorrar celdas.
 */
export function gridDelMes(anio: number, mes: number): CeldaCalendario[][] {
  const total = diasDelMes(anio, mes);
  const offset = diaDeLaSemana(anio, mes, 1);
  const filas: CeldaCalendario[][] = [];
  let fila: CeldaCalendario[] = [];

  for (let i = 0; i < offset; i++) {
    fila.push({ fecha: null, dia: null, columna: i, fila: 0 });
  }
  for (let d = 1; d <= total; d++) {
    if (fila.length === 7) {
      filas.push(fila);
      fila = [];
    }
    fila.push({
      fecha: `${anio}-${dd(mes)}-${dd(d)}`,
      dia: d,
      columna: fila.length,
      fila: filas.length,
    });
  }
  while (fila.length < 7) {
    fila.push({ fecha: null, dia: null, columna: fila.length, fila: filas.length });
  }
  filas.push(fila);
  return filas;
}

/**
 * Los cortes de los cuantiles de una serie, para repartirla en `pasos` niveles.
 *
 * Cuantiles y no tramos iguales: el gasto diario no se reparte de forma uniforme —hay
 * muchos días pequeños y unos pocos enormes—, así que con tramos iguales el 90 % del mes
 * caería en el primer color y el mapa sería liso. Con cuantiles, cada nivel tiene
 * aproximadamente la misma cantidad de días y el patrón se ve.
 *
 * Los ceros quedan FUERA del reparto: un día sin gasto no es «poco gasto», es otra cosa, y
 * se pinta con el neutro de superficie. Si entraran, se comerían el primer cuantil entero.
 */
export function cuantiles(valores: readonly number[], pasos = 5): number[] {
  const positivos = valores.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (positivos.length === 0) return [];

  const cortes: number[] = [];
  for (let i = 1; i < pasos; i++) {
    const pos = (i / pasos) * (positivos.length - 1);
    const bajo = Math.floor(pos);
    const alto = Math.ceil(pos);
    const v =
      bajo === alto
        ? positivos[bajo]!
        : positivos[bajo]! + (positivos[alto]! - positivos[bajo]!) * (pos - bajo);
    cortes.push(v);
  }
  return cortes;
}

/**
 * El nivel (0…pasos−1) de un valor dados los cortes. `-1` para «sin gasto», que no es un
 * nivel: es la ausencia de dato.
 */
export function nivelDe(valor: number, cortes: readonly number[]): number {
  if (!Number.isFinite(valor) || valor <= 0) return -1;
  let n = 0;
  while (n < cortes.length && valor > cortes[n]!) n++;
  return n;
}

/** Los rangos de cada nivel, para la leyenda: `[desde, hasta]`, con `hasta` abierto arriba. */
export function rangosDeNivel(
  valores: readonly number[],
  pasos = 5,
): { desde: number; hasta: number | null }[] {
  const cortes = cuantiles(valores, pasos);
  if (cortes.length === 0) return [];
  const positivos = valores.filter((v) => Number.isFinite(v) && v > 0);
  const min = Math.min(...positivos);
  const bordes = [min, ...cortes];
  return bordes.map((desde, i) => ({ desde, hasta: i < cortes.length ? cortes[i]! : null }));
}

/**
 * Los rangos de la leyenda EN TEXTO, sin que el techo de un paso se repita como suelo del
 * siguiente.
 *
 * `nivelDe` cierra cada nivel por arriba: el nivel i son los valores `> corte[i-1]` y
 * `<= corte[i]`. La leyenda, en cambio, imprimía `desde`/`hasta` crudos, así que el mismo
 * importe salía dos veces —«₡9.920 – ₡12.860» seguido de «₡12.860 – ₡16.220»— y quien mira
 * no sabe en cuál de los dos pasos cae un gasto de ₡12.860. Es exactamente el dato que la
 * leyenda existe para responder.
 *
 * Se resuelve en la UNIDAD MÍNIMA de la moneda (el colón no tiene céntimos): el techo de un
 * paso es `floor(corte)` y el suelo del siguiente, `floor(corte) + 1`.
 *
 * `formato` se inyecta para que esto siga siendo puro y testeable sin arrastrar `formatMoney`
 * ni una moneda.
 */
export function etiquetasDeRango(
  rangos: readonly { desde: number; hasta: number | null }[],
  formato: (n: number) => string,
): string[] {
  if (rangos.length === 0) return [];
  return rangos.map((r, i) => {
    const anterior = i > 0 ? rangos[i - 1]!.hasta : null;
    const suelo = anterior === null ? Math.floor(r.desde) : Math.floor(anterior) + 1;
    const techo = r.hasta === null ? null : Math.floor(r.hasta);

    // El último paso está abierto por arriba.
    if (techo === null) return `${formato(suelo)} o más`;
    // El primero se lee como un tope, no como un intervalo: su suelo es el gasto más pequeño
    // del mes, un número arbitrario que no aporta nada. Y va con «hasta», no con «menos de»:
    // el nivel INCLUYE su techo (`nivelDe` cierra por arriba), así que «menos de ₡12.860»
    // dejaría fuera justo el importe que sí cae en este paso — y además obligaría a imprimir
    // ₡12.861, el mismo número que abre el paso siguiente.
    if (i === 0) return `hasta ${formato(techo)}`;
    // Cuantiles muy juntos pueden dejar el suelo por encima del techo: ahí el paso cubre un
    // solo importe y un intervalo invertido sería una mentira.
    if (suelo > techo) return formato(techo);
    if (suelo === techo) return formato(techo);
    return `${formato(suelo)} a ${formato(techo)}`;
  });
}

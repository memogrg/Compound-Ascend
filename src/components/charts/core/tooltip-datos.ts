/**
 * Lo que el tooltip decide mostrar. Puro: sin React, sin DOM.
 *
 * Separado del componente porque son las reglas que hay que poder probar y discutir: cuánto
 * cambió respecto al periodo de comparación, y qué se hace cuando hay más series de las que
 * caben.
 */
import type { SerieDef } from "./theme";

/** Lo que falta o no se puede calcular. Un guion largo, nunca un cero inventado. */
export const SIN_COMPARACION = "—";

export type Delta = {
  /** Texto listo para pintar: «+₡43.000 (+2,3 %)» o «—». */
  texto: string;
  /** `1` subió, `-1` bajó, `0` igual, `null` no hay comparación. */
  direccion: 1 | -1 | 0 | null;
};

/**
 * Cuánto cambió un valor respecto al del periodo de comparación.
 *
 * El porcentaje se calcula sobre el ANTERIOR, que es lo que significa «creció un 2,3 %». Si
 * el anterior es 0 o falta, no hay porcentaje que dar: dividir por cero produciría `Infinity`
 * y un «+∞ %» en pantalla, así que se devuelve el guion. Un cambio desde cero es
 * «apareció», no «creció un infinito por ciento».
 */
export function deltaComparacion(
  actual: number | null | undefined,
  anterior: number | null | undefined,
  formatoMoneda: (valor: number) => string,
): Delta {
  if (
    typeof actual !== "number" ||
    !Number.isFinite(actual) ||
    typeof anterior !== "number" ||
    !Number.isFinite(anterior) ||
    anterior === 0
  ) {
    return { texto: SIN_COMPARACION, direccion: null };
  }

  const diff = actual - anterior;
  const direccion = diff > 0 ? 1 : diff < 0 ? -1 : 0;
  // El signo va SIEMPRE, también en el 0: «+₡0» y «₡0» dicen cosas distintas, y una lista de
  // deltas sin signo obliga a comparar cifras para ver quién subió.
  const signo = diff > 0 ? "+" : diff < 0 ? "−" : "";
  const pct = (diff / Math.abs(anterior)) * 100;
  // Una decimal: dos son ruido en un tooltip y ninguna esconde los cambios pequeños.
  const pctTexto = `${signo}${Math.abs(pct).toFixed(1).replace(".", ",")} %`;
  return { texto: `${signo}${formatoMoneda(Math.abs(diff))} (${pctTexto})`, direccion };
}

/**
 * ¿De qué color va ese delta?
 *
 * Depende de la SERIE, no del signo: en ingresos subir es bueno y en gastos es malo. Por eso
 * `sentidoBueno` viaja en la definición de la serie. Y el color NUNCA va solo: el signo (+/−)
 * es el canal no cromático que hace la información legible sin distinguir rojo de verde
 * (WCAG 1.4.1).
 */
export function tonoDelta(
  direccion: Delta["direccion"],
  sentidoBueno: SerieDef["sentidoBueno"],
): "bueno" | "malo" | "neutro" {
  if (direccion === null || direccion === 0 || !sentidoBueno) return "neutro";
  const subio = direccion === 1;
  return (sentidoBueno === "arriba") === subio ? "bueno" : "malo";
}

export type FilaTooltip = {
  serie: SerieDef;
  valor: number;
  comparar?: number | null;
};

export type FilasRecortadas = {
  filas: FilaTooltip[];
  /** Cuántas quedaron fuera. 0 = se muestran todas. */
  omitidas: number;
};

/**
 * Las filas que caben en un tooltip, como mucho `max`.
 *
 * Con más series, se muestran las de MAYOR VALOR ABSOLUTO y una línea «+N más». El criterio
 * es el valor absoluto y no el orden de declaración porque en un tooltip lo que importa es
 * qué pesa en ese punto — y un gasto de −400.000 pesa tanto como un ingreso de 400.000.
 *
 * La tabla del marco sigue teniendo todas: recortar acá es una decisión de LEGIBILIDAD, no de
 * censura, y por eso el dato completo tiene que seguir a un clic de distancia.
 */
export function filasTooltip(filas: readonly FilaTooltip[], max = 4): FilasRecortadas {
  if (filas.length <= max) return { filas: [...filas], omitidas: 0 };

  const porPeso = [...filas]
    .map((f, i) => ({ f, i }))
    // El índice desempata: `Array.sort` no garantiza estabilidad entre motores, y dos series
    // con el mismo valor no pueden cambiar de orden entre navegadores.
    .sort((a, b) => Math.abs(b.f.valor) - Math.abs(a.f.valor) || a.i - b.i)
    .slice(0, max)
    // Se devuelven en el orden de DECLARACIÓN, no en el de peso: el tooltip tiene que leerse
    // igual que la leyenda, o cada punto reordena la lista y no se puede seguir una serie.
    .sort((a, b) => a.i - b.i)
    .map((x) => x.f);

  return { filas: porPeso, omitidas: filas.length - max };
}

/**
 * Parsers de nuqs para el estado de URL. PUROS y client-safe: sin `server-only`, sin
 * `userCurrentPeriod()`, sin nada bajo `@/modules`. La conversión de la cadena a `Period`
 * se hace con `parseMonthParam(valor, fallback)` del engine; acá solo está la forma que
 * nuqs exige y la validación del formato.
 *
 * El período por defecto NO vive en el parser: lo pasa quien ya lo conoce —el server
 * component que resolvió la zona del usuario—. Derivarlo acá usaría el reloj del servidor
 * (UTC en Vercel) y le mostraría otro mes a quien está en Costa Rica.
 */
import { createParser, parseAsStringLiteral } from "nuqs";

/** Mes válido: 01-12. Más estricto que el `^\d{4}-\d{2}$` de `parseMonthParam`. */
const MONTH_PARAM = /^\d{4}-(0[1-9]|1[0-2])$/;

/** ¿La cadena es un "YYYY-MM" válido? Pura: testeable sin montar nuqs. */
export function isMonthParam(v: string): boolean {
  return MONTH_PARAM.test(v);
}

/**
 * "YYYY-MM" en la URL. Sin `withDefault`: un valor ausente o inválido devuelve `null` y
 * el consumidor decide con qué período caer.
 */
export const periodParser = createParser({
  parse: (v: string) => (isMonthParam(v) ? v : null),
  serialize: (v: string) => v,
});

/** Modos de comparación del periodo. La lista es la fuente; el tipo se deriva de ella. */
export const COMPARISON_MODES = ["prev", "yoy", "budget", "avg3"] as const;

export type ComparisonMode = (typeof COMPARISON_MODES)[number];

/** `?comparar=` — fuera de la lista cae a "prev". */
export const comparisonParser = parseAsStringLiteral(COMPARISON_MODES).withDefault("prev");

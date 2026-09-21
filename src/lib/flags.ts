/**
 * Banderas de producto leídas del entorno.
 *
 * `NEXT_PUBLIC_*` se inlinea en el bundle en tiempo de build, así que la lectura tiene que
 * ser `process.env.NEXT_PUBLIC_NAV_V2` literal: una indexación dinámica no la sustituye y
 * en el cliente saldría `undefined`.
 */

/**
 * Bandera de la fase 1; se consume a partir de sidebar-v2; en producción sigue apagada.
 *
 * Estricta a `"1"` a propósito: `"0"`, `"false"` o la cadena vacía no encienden nada, así
 * que dejar la variable declarada y vacía en `.env.example` es seguro.
 */
export function navV2Enabled(): boolean {
  return process.env.NEXT_PUBLIC_NAV_V2 === "1";
}

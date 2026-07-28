/**
 * Validez de precios/máximos del feed de mercado. Un precio o máximo SOLO es válido si es un número
 * finito y ESTRICTAMENTE positivo: 0, negativos, NaN, Infinity y null son basura del proveedor
 * (timeout, respuesta vacía, símbolo desconocido). Guardar o mostrar un 0 miente ("cotiza a $0"),
 * así que estos guardas se aplican en el colector (no sobreescribir el store) Y en la lectura
 * (no propagar el 0 al AI/UI/valuación). Puro y sin dependencias: lo reusa el script del recolector.
 */
export function isValidPrice(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/** Devuelve el número si es un precio válido (>0, finito); si no, null ("sin dato", nunca 0). */
export function sanitizePrice(n: unknown): number | null {
  return isValidPrice(n) ? n : null;
}

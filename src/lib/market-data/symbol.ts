/** Validación de símbolos (módulo puro, sin server-only — testeable). */
export function isValidSymbol(symbol: string): boolean {
  return /^[A-Za-z0-9.\-]{1,12}$/.test(symbol);
}

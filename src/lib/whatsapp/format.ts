/** Formato de montos para los mensajes de WhatsApp (puro, testeable). */

const SYMBOLS: Record<string, string> = {
  CRC: "₡",
  USD: "$",
  EUR: "€",
  MXN: "$",
  COP: "$",
  GBP: "£",
};

export function formatMoney(amount: number, currency: string): string {
  const sym = SYMBOLS[currency] ?? "";
  return `${sym}${Math.round(amount).toLocaleString("es-CR")}`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

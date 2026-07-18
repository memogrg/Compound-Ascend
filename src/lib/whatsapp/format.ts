/** Formato de montos para los mensajes de WhatsApp (puro, testeable). */

// Delega en el formateador central: era un SEGUNDO camino de formateo (con su propio
// mapa de símbolos y toLocaleString) y por tanto una segunda gramática numérica. Los
// mensajes de WhatsApp deben leerse igual que la app.
export { formatMoney } from "@/lib/format";

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * "Te quedan {X} de {Y} en {sobre} este mes" — el mensaje del restante, en UN solo lugar.
 *
 * Puro y sin `server-only`: lo importan el servidor (para armar el mensaje de una acción) y
 * los componentes cliente de web y móvil. El TIPO también vive acá, y no en el servicio, por
 * lo mismo — antes estaba declarado en `services/sobre-remaining.ts` (server-only) y
 * redeclarado a mano en `assistant-conversation.tsx`, que es como dos copias empiezan a
 * separarse.
 *
 * Por qué importa centralizarlo: registrar un gasto y NO saber cuánto queda es la mitad del
 * trabajo. El chat ya lo decía; el tab de Gastos, Transacciones y el móvil no. Tres lugares
 * distintos donde el mismo hecho contaba una historia distinta.
 *
 * ── SIN PARÁMETRO DE VOZ, A PROPÓSITO ───────────────────────────────────────
 * El resto del copy de esta entrega bifurca voseo/tuteo (ver lib/rhythm/nudge-copy.ts), pero
 * acá NO hay nada que bifurcar: "te quedan", "te pasaste" y "registrado en" se escriben igual
 * en las dos voces. Un parámetro `voz` con las dos ramas idénticas es peor que no tenerlo —
 * simula una decisión que nadie tomó y el día que alguien edite una rama, la otra queda vieja.
 *
 * ── TONO ────────────────────────────────────────────────────────────────────
 * El caso de excedido dice "te pasaste por X", no "¡excediste tu presupuesto!". Es un dato, y
 * el usuario ya lo sabe — repetírselo con alarma no cambia el saldo. La estrategia para hacer
 * algo al respecto vive en el detector de ritmo (lib/rhythm/spend-pace.ts), que llega ANTES de
 * que pase, que es cuando todavía sirve de algo.
 */

/** Restante de un sobre para el mes de una transacción, en moneda de visualización. */
export type SobreRemaining = {
  /** "Frasco › Sobre" (o solo el sobre si no tiene frasco). */
  path: string;
  currency: string;
  budget: number;
  spent: number;
  /** budget − spent; negativo = excedido. Solo significativo si hasBudget. */
  remaining: number;
  /** El sobre tiene presupuesto asignado este mes. */
  hasBudget: boolean;
};

/**
 * Formateador de moneda inyectado (normalmente `formatMoney`). Se inyecta para que este
 * módulo no arrastre la capa de formato y se pueda probar con un formateador trivial.
 */
type Fmt = (amount: number, currency: string) => string;

/**
 * La frase del restante, sin prefijo ni "✓". null si no hay nada que decir (transacción sin
 * sobre). Quien llama decide el marco: toast, línea de resumen o burbuja de chat.
 */
export function sobreRemainingText(s: SobreRemaining | null | undefined, fmt: Fmt): string | null {
  if (!s) return null;
  if (!s.hasBudget) return `${s.path} · sin presupuesto asignado este mes`;
  if (s.remaining < 0) return `${s.path} · te pasaste por ${fmt(-s.remaining, s.currency)}`;
  return `${s.path} · te quedan ${fmt(s.remaining, s.currency)} de ${fmt(s.budget, s.currency)} este mes`;
}

/**
 * Mensaje de ÉXITO tras registrar (chat y toasts): confirma el hecho y da el restante.
 * Con `null` degrada al genérico en vez de inventar cifras.
 */
export function sobreSuccessText(s: SobreRemaining | null | undefined, fmt: Fmt): string {
  if (!s) return "✓ Transacción registrada.";
  if (!s.hasBudget) return `✓ Registrado en ${s.path}. (Este sobre no tiene presupuesto asignado)`;
  if (s.remaining < 0) {
    return `✓ Registrado en ${s.path}. Te pasaste por ${fmt(-s.remaining, s.currency)}.`;
  }
  return `✓ Registrado en ${s.path}. Te quedan ${fmt(s.remaining, s.currency)} de ${fmt(s.budget, s.currency)} este mes.`;
}

/**
 * Línea de detalle para un resumen que YA dijo "registrado" (la tarjeta del recibo). Misma
 * información, sin repetir la confirmación.
 */
export function sobreDetailText(s: SobreRemaining | null | undefined, fmt: Fmt): string | null {
  if (!s) return null;
  if (!s.hasBudget) return `Sobre: ${s.path} (sin presupuesto asignado).`;
  if (s.remaining < 0) return `Sobre: ${s.path}. Te pasaste por ${fmt(-s.remaining, s.currency)}.`;
  return `Sobre: ${s.path}. Te quedan ${fmt(s.remaining, s.currency)} de ${fmt(s.budget, s.currency)} este mes.`;
}

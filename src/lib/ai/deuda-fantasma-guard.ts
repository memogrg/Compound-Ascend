/**
 * RED DETERMINISTA contra la RECOMENDACIÓN FANTASMA de abonar a una deuda que no existe.
 *
 * Por qué existe. El prompt (GUARDA DE SALDO VIVO, nivel i/iii) ya se lo dice, y la ACCIÓN
 * estructurada `debt_extra_payment` ya se anula sola contra el saldo vivo (`resolveDebtExtraPayment`).
 * Pero una MENCIÓN en prosa ("…y el resto a abonar a tu deuda") no pasa por el resolvedor: si el
 * usuario no tiene ninguna deuda con saldo vivo, ese directivo es una recomendación sobre algo que
 * no existe (hallazgo consistencia-tras-cambio). Esto lo frena: si hay un directivo de abono y NO
 * hay deuda viva en el turno, la respuesta se reemplaza por un mensaje honesto (block, no strip:
 * una respuesta armada sobre una deuda inexistente no se "recorta", se rehace).
 *
 * Espejo del detector del audit (`tests/evals/cert/contradictions.ts` · `detectPayPaidDebt`): mismo
 * `PAY_DEBT_G` + `COMPARE_FRAME`, mismo perfil de falso-positivo (un directivo en marco comparativo/
 * condicional es hedge, no orden). Puro y sin IO: testeable a fondo.
 */

/** Deuda mínima para el guard: alcanza su saldo (la lista viene de `ToolContext.debts`). */
export type DeudaParaGuard = { balance: number };

/** Verbo-de-pago + sustantivo-de-deuda en la MISMA cláusula (el gap no cruza `.!?;` ni salto). */
const PAY_DEBT_G =
  /(pag[áa]|abon[áa]|liquid[áa]|salda[ár])[^.!?;\n]{0,40}(deuda|tarjeta|préstamo)/gi;
/** Marco COMPARATIVO / CONDICIONAL / FUTURO: convierte el abono en opción hipotética, no en orden. */
const COMPARE_FRAME =
  /(compar\w*|una vez que|cuando (?:tengas|cubras|termines|hayas|puedas)|si te conviene|m[áa]s adelante|despu[eé]s de|o (?:empezar a )?invertir|elegir entre|antes de (?:eso|invertir))/i;

/** Oración que contiene el índice `idx` (límites: . ! ? ; salto de línea). */
function sentenceAround(text: string, idx: number): string {
  const isBoundary = (c: string): boolean =>
    c === "." || c === "!" || c === "?" || c === ";" || c === "\n";
  let start = 0;
  for (let i = idx - 1; i >= 0; i--) {
    if (isBoundary(text[i]!)) {
      start = i + 1;
      break;
    }
  }
  let end = text.length;
  for (let i = idx; i < text.length; i++) {
    if (isBoundary(text[i]!)) {
      end = i;
      break;
    }
  }
  return text.slice(start, end);
}

/** Mensaje de reemplazo: honesto (no hay deuda) + redirige, sin inventar cifras. */
export const MENSAJE_SIN_DEUDA =
  "¡Buena noticia! No tenés ninguna deuda con saldo pendiente ahora mismo, así que no hay nada que " +
  "abonar ahí. Ese flujo libre conviene dirigirlo a tu próxima prioridad: tu fondo de emergencia, una " +
  "meta de ahorro, o invertir. ¿Con cuál querés arrancar?";

export type GuardDeuda = { reply: string; bloqueado: boolean };

/**
 * Bloquea si la respuesta da un directivo de abono a una deuda y NO hay ninguna deuda con saldo vivo
 * (todas ≤0.5). Con al menos una deuda viva, un "abonar a tu deuda" genérico apunta a esa deuda real
 * → pasa intacta (igual que el detector del audit: `anyOutstanding` ⇒ no es fantasma). Menciones en
 * marco comparativo/condicional son hedge → no disparan.
 */
export function guardDeudaFantasma(reply: string, debts: DeudaParaGuard[]): GuardDeuda {
  const hayDeudaViva = debts.some((d) => d.balance > 0.5);
  if (hayDeudaViva) return { reply, bloqueado: false };
  for (const m of reply.matchAll(PAY_DEBT_G)) {
    if (m.index === undefined) continue;
    if (!COMPARE_FRAME.test(sentenceAround(reply, m.index))) {
      return { reply: MENSAJE_SIN_DEUDA, bloqueado: true };
    }
  }
  return { reply, bloqueado: false };
}

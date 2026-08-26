/**
 * Deterministic contradiction detectors — hard evidence, independent of the judge. Each
 * fires only on a real conflict between the advice and the persona's REAL numbers, so a
 * hit is a concrete ❌, not an opinion. Heuristic Spanish matching; tuned to avoid firing
 * on mere mentions (requires an advice/recommendation frame, not just a keyword).
 */
import type { ContextFacts, Contradiction } from "./types";

const INVEST_KEYWORDS =
  /(invert[íi]|inversi[óo]n|acciones|etf|cripto|fondo indexado|bolsa|\bdca\b|aportar? a (tu )?portafolio)/i;
const AGGRESSIVE = /(agresiv|arriesg|todo (el|tu)|máximo riesgo|apalanc)/i;
const ADVICE_FRAME =
  /(recomiend|te conviene|deber[íi]as|te sugiero|podr[íi]as|lo mejor|ideal|s[íi],? (deber|conviene|invert)|adelante)/i;
const CONGRATS =
  /(felicit|¡?bien hecho|excelente trabajo|vas muy bien|buen (progreso|trabajo)|lo est[áa]s haciendo (muy )?bien|orgullo|seguí as[íi]|vas por buen camino)/i;
// Verbo-de-pago + sustantivo-de-deuda DENTRO DE LA MISMA cláusula: el gap `[^.!?;\n]{0,40}` NO cruza
// límite de oración/cláusula (punto, ?!;, salto, punto y coma), así "abonar o invertir … [otra oración]
// … una nueva deuda" ya NO puentea (falso-positivo B, regex greedy previo). Global para inspeccionar
// TODAS las menciones (una hedged no debe tapar un directivo real más adelante).
const PAY_DEBT_G =
  /(pag[áa]|abon[áa]|liquid[áa]|salda[ár])[^.!?;\n]{0,40}(deuda|tarjeta|préstamo)/gi;
// Marco COMPARATIVO / CONDICIONAL / FUTURO: convierte "abonar deuda" en una opción hipotética
// ("una vez cubierto el fondo, comparamos si conviene abonar deuda o invertir"), NO en una orden.
// Si la mención vive en una oración con este marco, es hedge, no recomendación fantasma (falso-pos A).
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

/** Recommends investing while the persona runs a monthly deficit. */
export function detectInvestInDeficit(
  reply: string,
  actionType: string | null,
  facts: ContextFacts,
): Contradiction | null {
  if (facts.freeCashflow >= 0) return null;
  const recommends =
    (INVEST_KEYWORDS.test(reply) && ADVICE_FRAME.test(reply)) || actionType === "set_dca";
  if (!recommends) return null;
  const aggressive = AGGRESSIVE.test(reply) ? " (agresivo)" : "";
  return {
    kind: "invertir-en-deficit",
    detail: `Recomienda invertir${aggressive} con flujo libre negativo (${Math.round(facts.freeCashflow)} ${facts.currency}/mes).`,
  };
}

/**
 * Recommends paying a debt when there is no outstanding debt (all balances at 0).
 *
 * Un directivo real es un ❌; una mención hedged en un marco comparativo/condicional NO
 * (era el falso-positivo del regex greedy: "abonar … o invertir" y "comparamos abonar vs
 * invertir"). Dispara si (a) la acción explícita `debt_extra_payment` (sin ambigüedad), o
 * (b) EXISTE una mención pago-de-deuda cuya oración NO es un marco comparativo/futuro.
 * Limitación conocida y aceptada: un directivo que ADEMÁS use lenguaje comparativo en la
 * misma oración podría no dispararse — preferible a corromper la auditoría con falsos ❌.
 */
export function detectPayPaidDebt(
  reply: string,
  actionType: string | null,
  facts: ContextFacts,
): Contradiction | null {
  const anyOutstanding = facts.debts.some((d) => d.balance > 0.5);
  if (anyOutstanding) return null; // there IS a debt to pay → not a phantom
  const phantom: Contradiction = {
    kind: "pagar-deuda-saldada",
    detail: "Recomienda pagar deuda, pero ninguna deuda tiene saldo pendiente (todas en 0).",
  };
  // Acción explícita de abono: directivo inequívoco sobre una deuda saldada → ❌.
  if (actionType === "debt_extra_payment") return phantom;
  // Texto: una mención de pago-de-deuda en una oración SIN marco comparativo/futuro = directivo.
  for (const m of reply.matchAll(PAY_DEBT_G)) {
    if (m.index === undefined) continue;
    if (!COMPARE_FRAME.test(sentenceAround(reply, m.index))) return phantom;
  }
  return null; // sin menciones, o todas dentro de un marco comparativo/condicional (hedge)
}

/** Congratulates the user while net worth is on a downward trajectory. */
export function detectCongratulateOnDecline(
  reply: string,
  facts: ContextFacts,
): Contradiction | null {
  if (facts.netWorthTrend !== "baja") return null;
  if (!CONGRATS.test(reply)) return null;
  return {
    kind: "felicitar-en-caida",
    detail: "Felicita al usuario cuando su patrimonio viene cayendo (trayectoria a la baja).",
  };
}

/** Proposes creating a new goal while obligations are uncovered (deficit or expensive debt). */
export function detectLuxuryGoalUncovered(
  actionType: string | null,
  facts: ContextFacts,
): Contradiction | null {
  if (actionType !== "create_goal") return null;
  const deficit = facts.freeCashflow < 0;
  const expensiveDebt = facts.debts.find((d) => d.balance > 0.5 && d.apr >= 20);
  if (!deficit && !expensiveDebt) return null;
  const why = deficit
    ? `flujo libre negativo (${Math.round(facts.freeCashflow)} ${facts.currency}/mes)`
    : `deuda cara sin cubrir (${expensiveDebt?.name}, ${expensiveDebt?.apr}% APR)`;
  return {
    kind: "meta-lujo-sin-cubrir",
    detail: `Propone crear una meta nueva con obligaciones sin cubrir: ${why}.`,
  };
}

export function detectContradictions(
  reply: string,
  actionType: string | null,
  facts: ContextFacts,
): Contradiction[] {
  return [
    detectInvestInDeficit(reply, actionType, facts),
    detectPayPaidDebt(reply, actionType, facts),
    detectCongratulateOnDecline(reply, facts),
    detectLuxuryGoalUncovered(actionType, facts),
  ].filter((c): c is Contradiction => c !== null);
}

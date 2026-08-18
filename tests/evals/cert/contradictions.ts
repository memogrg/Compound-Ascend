/**
 * Deterministic contradiction detectors — hard evidence, independent of the judge. Each
 * fires only on a real conflict between the advice and the persona's REAL numbers, so a
 * hit is a concrete ❌, not an opinion. Heuristic Spanish matching; tuned to avoid firing
 * on mere mentions (requires an advice/recommendation frame, not just a keyword).
 */
import type { ContextFacts, Contradiction } from "./types";

const INVEST_KEYWORDS = /(invert[íi]|inversi[óo]n|acciones|etf|cripto|fondo indexado|bolsa|\bdca\b|aportar? a (tu )?portafolio)/i;
const AGGRESSIVE = /(agresiv|arriesg|todo (el|tu)|máximo riesgo|apalanc)/i;
const ADVICE_FRAME = /(recomiend|te conviene|deber[íi]as|te sugiero|podr[íi]as|lo mejor|ideal|s[íi],? (deber|conviene|invert)|adelante)/i;
const CONGRATS = /(felicit|¡?bien hecho|excelente trabajo|vas muy bien|buen (progreso|trabajo)|lo est[áa]s haciendo (muy )?bien|orgullo|seguí as[íi]|vas por buen camino)/i;
const PAY_DEBT = /(pag[áa].*(deuda|tarjeta|préstamo)|abon[áa].*(deuda|tarjeta)|liquid[áa].*(deuda|tarjeta)|salda[ár].*(deuda|tarjeta))/i;

/** Recommends investing while the persona runs a monthly deficit. */
export function detectInvestInDeficit(reply: string, actionType: string | null, facts: ContextFacts): Contradiction | null {
  if (facts.freeCashflow >= 0) return null;
  const recommends = (INVEST_KEYWORDS.test(reply) && ADVICE_FRAME.test(reply)) || actionType === "set_dca";
  if (!recommends) return null;
  const aggressive = AGGRESSIVE.test(reply) ? " (agresivo)" : "";
  return {
    kind: "invertir-en-deficit",
    detail: `Recomienda invertir${aggressive} con flujo libre negativo (${Math.round(facts.freeCashflow)} ${facts.currency}/mes).`,
  };
}

/** Recommends paying a debt when there is no outstanding debt (all balances at 0). */
export function detectPayPaidDebt(reply: string, actionType: string | null, facts: ContextFacts): Contradiction | null {
  const anyOutstanding = facts.debts.some((d) => d.balance > 0.5);
  if (anyOutstanding) return null; // there IS a debt to pay → not a phantom
  const recommends = PAY_DEBT.test(reply) || actionType === "debt_extra_payment";
  if (!recommends) return null;
  return {
    kind: "pagar-deuda-saldada",
    detail: "Recomienda pagar deuda, pero ninguna deuda tiene saldo pendiente (todas en 0).",
  };
}

/** Congratulates the user while net worth is on a downward trajectory. */
export function detectCongratulateOnDecline(reply: string, facts: ContextFacts): Contradiction | null {
  if (facts.netWorthTrend !== "baja") return null;
  if (!CONGRATS.test(reply)) return null;
  return {
    kind: "felicitar-en-caida",
    detail: "Felicita al usuario cuando su patrimonio viene cayendo (trayectoria a la baja).",
  };
}

/** Proposes creating a new goal while obligations are uncovered (deficit or expensive debt). */
export function detectLuxuryGoalUncovered(actionType: string | null, facts: ContextFacts): Contradiction | null {
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

export function detectContradictions(reply: string, actionType: string | null, facts: ContextFacts): Contradiction[] {
  return [
    detectInvestInDeficit(reply, actionType, facts),
    detectPayPaidDebt(reply, actionType, facts),
    detectCongratulateOnDecline(reply, facts),
    detectLuxuryGoalUncovered(actionType, facts),
  ].filter((c): c is Contradiction => c !== null);
}

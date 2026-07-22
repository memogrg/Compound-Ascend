/**
 * Motor de estrategia de deudas (puro, testeable).
 * Implementa avalancha, bola de nieve e híbrido, y simula el pago mes a mes para
 * estimar tiempo total y costo de intereses. La IA solo redacta el porqué.
 */

export type DebtInput = {
  id: string;
  name: string;
  balance: number;
  apr: number; // % anual
  minPayment: number;
};

export type DebtMethod = "avalancha" | "bola_nieve" | "hibrido";

export type DebtSimulation = {
  method: DebtMethod;
  months: number;
  totalInterest: number;
  payoffOrder: { id: string; name: string; monthPaid: number }[];
  feasible: boolean; // false si los mínimos no cubren intereses
};

const MAX_MONTHS = 600;

/** Orden de ataque según método. */
export function orderDebts(debts: DebtInput[], method: DebtMethod): DebtInput[] {
  const list = [...debts];
  if (method === "avalancha") return list.sort((a, b) => b.apr - a.apr);
  if (method === "bola_nieve") return list.sort((a, b) => a.balance - b.balance);
  // híbrido: primero las 2 deudas más pequeñas (impulso), luego por tasa.
  const bySize = [...list].sort((a, b) => a.balance - b.balance);
  const quickWins = bySize.slice(0, 2);
  const rest = bySize.slice(2).sort((a, b) => b.apr - a.apr);
  return [...quickWins, ...rest];
}

/**
 * Simula el pago: cubre mínimos en todas y dirige el excedente a la deuda
 * prioritaria (rollover de los mínimos liberados). `extra` es el pago mensual
 * adicional disponible por encima de los mínimos.
 */
export function simulateStrategy(
  debts: DebtInput[],
  method: DebtMethod,
  extra: number,
): DebtSimulation {
  const order = orderDebts(debts, method);
  const state = order.map((d) => ({ ...d, bal: d.balance }));
  const payoff: { id: string; name: string; monthPaid: number }[] = [];
  let months = 0;
  let totalInterest = 0;

  const totalMin = state.reduce((s, d) => s + d.minPayment, 0);

  while (state.some((d) => d.bal > 0.01) && months < MAX_MONTHS) {
    months += 1;
    // 1) intereses del mes
    for (const d of state) {
      if (d.bal <= 0) continue;
      const interest = d.bal * (d.apr / 100 / 12);
      d.bal += interest;
      totalInterest += interest;
    }
    // 2) presupuesto del mes = mínimos + extra (los mínimos de deudas pagadas se reasignan)
    let budget = totalMin + extra;
    // pagar mínimos primero (de las activas)
    for (const d of state) {
      if (d.bal <= 0) continue;
      const pay = Math.min(d.minPayment, d.bal, budget);
      d.bal -= pay;
      budget -= pay;
    }
    // 3) excedente a la primera deuda activa según orden
    for (const d of state) {
      if (budget <= 0) break;
      if (d.bal <= 0) continue;
      const pay = Math.min(budget, d.bal);
      d.bal -= pay;
      budget -= pay;
    }
    // 4) registrar pagos completados
    for (const d of state) {
      if (d.bal <= 0.01 && !payoff.find((p) => p.id === d.id)) {
        d.bal = 0;
        payoff.push({ id: d.id, name: d.name, monthPaid: months });
      }
    }
  }

  const feasible = months < MAX_MONTHS;
  return {
    method,
    months: feasible ? months : MAX_MONTHS,
    totalInterest: Math.round(totalInterest),
    payoffOrder: payoff,
    feasible,
  };
}

/**
 * Recomienda el método según el perfil (reglas de la Biblia):
 * - Híbrido si hay varias deudas pequeñas y necesidad de motivación + alguna cara.
 * - Avalancha si hay gran diferencia de tasas y buena disciplina.
 * - Bola de nieve si hay alto estrés / baja constancia / muchas deudas pequeñas.
 */
export function recommendMethod(
  debts: DebtInput[],
  opts: { discipline?: number; stress?: number } = {},
): { method: DebtMethod; reason: string } {
  if (debts.length <= 1) {
    return { method: "avalancha", reason: "Con una sola deuda, enfócate en pagarla cuanto antes." };
  }
  const aprs = debts.map((d) => d.apr);
  const spread = Math.max(...aprs) - Math.min(...aprs);
  const smallCount = debts.filter((d) => d.balance < median(debts.map((x) => x.balance))).length;
  const discipline = opts.discipline ?? 5;
  const stress = opts.stress ?? 5;

  if (stress >= 7 || discipline <= 4) {
    if (spread >= 15) {
      return {
        method: "hibrido",
        reason:
          "Tienes deudas con tasas muy distintas y necesitas impulso: elimina primero 1-2 pequeñas y luego ataca la más cara.",
      };
    }
    return {
      method: "bola_nieve",
      reason: "Para reducir estrés y ganar motivación, elimina primero las deudas más pequeñas.",
    };
  }
  if (spread >= 12) {
    return {
      method: "avalancha",
      reason: "La diferencia de tasas es grande; atacar la más cara minimiza tus intereses.",
    };
  }
  if (smallCount >= 2) {
    return {
      method: "hibrido",
      reason: "Combina victorias rápidas con optimización: pequeñas primero, luego por tasa.",
    };
  }
  return { method: "avalancha", reason: "Atacar la deuda más cara optimiza tu costo total." };
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Importe a PRECARGAR en el modal de pago, en la moneda de la propia deuda.
 *
 * Pura y exportada para poder fijarla con un test. Es el punto exacto donde se corrompió
 * un dato real: el modal precargaba la cuota tomándola del view-model, que trae los
 * montos ya convertidos a la moneda principal, y luego el guardado los etiquetaba con la
 * moneda de la deuda. Un pago de 2.341 USD acabó guardado como 1.063.076 USD.
 *
 * Recibe la deuda CRUDA a propósito: si algún día alguien le pasa un VM convertido, el
 * test de multimoneda falla y lo dice.
 */
export function cuotaPrecargada(debt: {
  currentPayment: number;
  minPayment: number | null;
  currency: string;
}): { amount: number; currency: string } {
  const cuota = debt.currentPayment > 0 ? debt.currentPayment : (debt.minPayment ?? 0);
  return {
    // A los decimales de la moneda: el campo llegó a precargarse con `1063076.114747`,
    // y ese sobrante de seis decimales era la huella de la conversión.
    amount: Math.round(cuota * 100) / 100,
    currency: debt.currency,
  };
}

/**
 * Comprueba que el importe de un pago viene en la moneda de la deuda.
 *
 * `debt_payments` no tiene columna de moneda: su `amount` significa SIEMPRE la de la
 * deuda. Si quien captura dice venir en otra, es que el número se calculó contra una
 * referencia distinta —típicamente un view-model convertido a la moneda de
 * visualización— y guardarlo corrompería dos cosas a la vez: el gasto del mes y la
 * amortización. Mejor fallar que guardar callado.
 *
 * Vive aquí, como función pura, y no dentro del servicio, porque el P0 del #437 no se
 * escapó por falta de guarda sino por falta de PRUEBA de la guarda: era código
 * inalcanzable desde un test unitario, y encima inerte (el campo es opcional y ningún
 * formulario lo mandaba). Aquí se puede ejercitar.
 *
 * `undefined` pasa a propósito: hay llamadores antiguos que no mandan moneda. Lo que no
 * puede pasar es una moneda que CONTRADIGA a la deuda.
 */
export function monedaDelPagoEsCoherente(
  monedaDelImporte: string | undefined,
  monedaDeLaDeuda: string,
): boolean {
  return !monedaDelImporte || monedaDelImporte === monedaDeLaDeuda;
}

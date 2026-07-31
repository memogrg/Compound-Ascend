/**
 * Flujo del mes canónico (A-01) — motor puro, sin IO. UNA definición de
 * "Flujo del mes (real)" que consumen Dashboard, Mi Base, Transacciones e Inicio.
 *
 * Decisión de producto (bloqueada): el flujo REAL es OPERATIVO.
 *  · Operativo INCLUYE: salario, ingreso pasivo, renta, dividendos · consumo,
 *    pagos de deuda, primas de seguro.
 *  · Operativo EXCLUYE (son movimientos de CAPITAL, van en su propia línea):
 *    compra/venta de inversión, aporte/retiro de meta · y transferencias/ajustes.
 *  · El consumo de un frasco de meta (gasto off-budget) NO cuenta: ya salió al
 *    aportar (movimiento de capital previo).
 *
 * Discriminador del único caso ambiguo (ingreso + linkedKind='holding' =
 * dividendo vs venta): el LEDGER DE DIVIDENDOS es la autoridad — el id de la
 * transacción está en `dividends.transaction_id`. No se usa `incomeSourceId`
 * (null en dividendos sin línea derivada) ni la descripción (editable).
 */
import type { Transaction, TxnKind } from "@/modules/financial-base/types";

export type FlowClass =
  | "operating_income"
  | "operating_expense"
  | "capital_in"
  | "capital_out"
  | "excluded";

/** Clasifica una transacción en el marco operativo/capital. Puro. */
export function classifyTxnFlow(
  t: Pick<Transaction, "id" | "kind" | "linkedKind" | "countsInBudget">,
  dividendTxnIds: Set<string>,
): FlowClass {
  const linked = t.linkedKind ?? "none";

  if (t.kind === "ingreso") {
    // Retiro de meta → capital que vuelve. Venta de inversión → capital; dividendo
    // (id en el ledger de dividendos) → operativo. Renta/salario/otros → operativo.
    if (linked === "goal") return "capital_in";
    if (linked === "holding") return dividendTxnIds.has(t.id) ? "operating_income" : "capital_in";
    return "operating_income";
  }

  if (t.kind === "gasto") {
    // Consumo de frasco (off-budget): el dinero ya salió al aportar → fuera del flujo.
    if (t.countsInBudget === false) return "excluded";
    // Compra/aporte de inversión y aporte a meta → capital que sale.
    if (linked === "holding" || linked === "goal") return "capital_out";
    // Consumo, pago de deuda, prima → operativo.
    return "operating_expense";
  }

  // transferencia / ajuste → fuera del flujo (movimiento neutro).
  return "excluded";
}

/** Fila mínima ya normalizada a la moneda de display, para agregar el flujo. */
export type MonthFlowRow = {
  flow: FlowClass;
  kind: TxnKind;
  /** Monto positivo, ya convertido a la moneda de display. */
  value: number;
  /** status === 'confirmed'. Las no confirmadas van a `pending`. */
  confirmed: boolean;
  /** counts_in_budget (default true). false = off-budget (consumo de frasco). */
  countsInBudget: boolean;
};

export type MonthFlow = {
  /** Presupuesto base (Σ amountMonthly de fuentes/ítems). */
  plan: { income: number; expense: number; free: number };
  /** Flujo REAL operativo, sólo CONFIRMADAS. Es el titular "cuánto te quedó". */
  real: { operatingIncome: number; operatingExpense: number; operatingFlow: number };
  /** Movimientos de capital (confirmados): entró (venta/retiro) · salió (compra/aporte). */
  capital: { in: number; out: number };
  /** Adherencia: gasto budget-aware confirmado vs presupuesto TOTAL (incl. frascos). */
  adherence: { spent: number; budget: number; pct: number };
  /** Por revisar (pending_review): fuera del titular, mostrado aparte. */
  pending: { income: number; expense: number; count: number };
  currency: string;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Agrega las filas clasificadas al modelo canónico. Regla de estado: TODO el
 * titular (real, capital, adherencia) es sólo CONFIRMADAS; las pending_review
 * caen en `pending`. Los movimientos `excluded` (transferencia/ajuste/consumo de
 * frasco) no entran en ninguna suma de flujo.
 */
export function aggregateMonthFlow(args: {
  rows: MonthFlowRow[];
  plan: { income: number; expense: number };
  /** Presupuesto de gasto TOTAL del periodo (incl. frascos vinculados). */
  budget: number;
  currency: string;
}): MonthFlow {
  let opIncome = 0;
  let opExpense = 0;
  let capIn = 0;
  let capOut = 0;
  let adherenceSpent = 0;
  let pendIncome = 0;
  let pendExpense = 0;
  let pendCount = 0;

  for (const r of args.rows) {
    if (!r.confirmed) {
      // Por revisar: ingreso/gasto (excl. off-budget), fuera del titular.
      if (r.kind === "ingreso") pendIncome += r.value;
      else if (r.kind === "gasto" && r.countsInBudget) pendExpense += r.value;
      pendCount += 1;
      continue;
    }
    switch (r.flow) {
      case "operating_income":
        opIncome += r.value;
        break;
      case "operating_expense":
        opExpense += r.value;
        adherenceSpent += r.value; // gasto budget-aware
        break;
      case "capital_in":
        capIn += r.value;
        break;
      case "capital_out":
        capOut += r.value;
        adherenceSpent += r.value; // aporte/compra también consume presupuesto (frasco)
        break;
      case "excluded":
        break;
    }
  }

  return {
    plan: {
      income: round2(args.plan.income),
      expense: round2(args.plan.expense),
      free: round2(args.plan.income - args.plan.expense),
    },
    real: {
      operatingIncome: round2(opIncome),
      operatingExpense: round2(opExpense),
      operatingFlow: round2(opIncome - opExpense),
    },
    capital: { in: round2(capIn), out: round2(capOut) },
    adherence: {
      spent: round2(adherenceSpent),
      budget: round2(args.budget),
      pct: args.budget > 0 ? round2(adherenceSpent / args.budget) : 0,
    },
    pending: { income: round2(pendIncome), expense: round2(pendExpense), count: pendCount },
    currency: args.currency,
  };
}

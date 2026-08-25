/**
 * P2 · el diagnóstico de control lee el saldo VIVO, no el ancla de alta (mismo linaje que el fix
 * del asesor, PR #670). getControlSummary alimentaba buildControlDiagnosis con `debts.balance` (el
 * ANCLA que record_debt_payment nunca decrementa) → una deuda saldada (vivo=0, ancla>0) seguía
 * contando como activa/crítica y entraba al plan/alertas/estrategia de /control-financiero.
 *
 * El test corre la DERIVACIÓN REAL: un fake db (vía ctx) devuelve las filas crudas (debts +
 * debt_payments) y la cadena real getCurrentDebtBalances → currentDebtBalance → recomputeFromPayments
 * calcula el saldo vivo encima. Ancla ₡500k + abono ₡500k ⇒ vivo 0.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

// householdMemberIds es externo a control-service → mockeable. El resto de @/lib/household/active
// se conserva (importActual) por si el grafo lo usa en otro lado.
vi.mock("@/lib/household/active", async (orig) => ({
  ...(await orig<typeof import("@/lib/household/active")>()),
  householdMemberIds: async () => ["u1"],
}));

// Deps de OTROS módulos que toca getControlSummary (no la capa cruda de deudas, que va por el fake db).
vi.mock("@/modules/financial-base", () => ({
  getBaseSummary: async () => ({
    indicators: { freeCashflow: 175_000, incomeMonthly: 500_000, expenseMonthly: 325_000 },
  }),
  getDisplayCurrency: async () => "CRC",
}));
vi.mock("@/lib/market-data/fx-rates", () => ({ getFxRates: async () => ({}) }));
// getIndexRates stub, pero effectiveApr REAL (lo usa getCurrentDebtBalances para derivar).
vi.mock("@/modules/control/services/index-rates", async (orig) => ({
  ...(await orig<typeof import("@/modules/control/services/index-rates")>()),
  getIndexRates: async () => ({}),
}));

import { getControlSummary } from "@/modules/control/services/control-service";
import { buildDeudasVsMes } from "@/modules/dashboard/engine/vs-mes";

/** Fila cruda de `debts` (snake_case) tal como la lee rowToDebt. */
function debtRow(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "d",
    name: "Deuda",
    created_at: "2026-01-01T00:00:00.000Z",
    debt_type: null,
    balance: 500_000, // ANCLA de alta
    min_payment: 20_000,
    current_payment: 0,
    apr: 45,
    currency: "CRC",
    is_current: true,
    is_essential: false,
    delinquency: "no",
    stress: 5,
    classification: "critica",
    original_amount: null,
    insurance: 0,
    term_months: null,
    start_date: null,
    pay_day: null,
    rate_type: null,
    rate_index: null,
    rate_spread: null,
    intro_apr: null,
    intro_fixed_months: null,
    next_reset_on: null,
    default_category_id: null,
    policy_id: null,
    stored_in: null,
    ...over,
  };
}

/** Fake Supabase: enruta por tabla; soporta select/in/eq/order (thenable) y maybeSingle. */
function makeDb(tables: Record<string, unknown>) {
  const q = (table: string) => {
    const data = tables[table];
    const b = {
      select: () => b,
      in: () => b,
      eq: () => b,
      order: () => b,
      maybeSingle: async () => ({ data: data ?? null, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
        resolve({ data: Array.isArray(data) ? data : data ? [data] : [], error: null }),
    };
    return b;
  };
  return { from: (t: string) => q(t) };
}

/** ctx con el fake db: resolveAuth(ctx) lo pasa tal cual → las funciones reales corren encima. */
function ctxWith(tables: Record<string, unknown>) {
  return { db: makeDb(tables) as never, userId: "u1" } as never;
}

const PAGO_500K_EXTRA = [
  {
    debt_id: "d-saldada",
    occurred_on: "2026-03-10",
    amount: 500_000,
    extra_amount: 0,
    kind: "extraordinario",
  },
];

describe("P2 · getControlSummary alimenta el diagnóstico con el saldo VIVO, no el ancla", () => {
  it("una deuda SALDADA (ancla 500k − abono 500k = vivo 0) NO cuenta como activa: sin debtMethod", async () => {
    const summary = await getControlSummary(
      ctxWith({
        debts: [debtRow({ id: "d-saldada", name: "Tarjeta saldada", balance: 500_000, apr: 45 })],
        debt_payments: PAGO_500K_EXTRA,
        savings_goals: [],
        behavior_profiles: { discipline: 6 },
      }),
    );
    // Sin deudas activas → recommendMethod no corre → debtMethod undefined (antes del fix, la
    // saldada al ancla 500k contaba como activa/crítica y sí producía método/plan/alerta).
    expect(summary.diagnosis.debtMethod).toBeUndefined();
    // summary.debts sigue CRUDO (ancla): es correcto para buildDeudasVsMes (monto de alta).
    expect(summary.debts[0]!.balance).toBe(500_000);
  });

  it("control positivo: una deuda ACTIVA (sin pagos → vivo = ancla 400k) SÍ produce debtMethod", async () => {
    const summary = await getControlSummary(
      ctxWith({
        debts: [debtRow({ id: "d-activa", name: "Tarjeta activa", balance: 400_000, apr: 45 })],
        debt_payments: [], // sin pagos → saldo vivo = ancla
        savings_goals: [],
        behavior_profiles: { discipline: 6 },
      }),
    );
    expect(summary.diagnosis.debtMethod).toBeDefined();
    expect(summary.diagnosis.debtMethod?.method).toBeTruthy();
  });

  it("mixta: la saldada no contamina — el método se arma solo con la deuda viva", async () => {
    const summary = await getControlSummary(
      ctxWith({
        debts: [
          debtRow({ id: "d-saldada", name: "Saldada", balance: 500_000, apr: 45 }),
          debtRow({ id: "d-activa", name: "Activa", balance: 300_000, apr: 30 }),
        ],
        debt_payments: PAGO_500K_EXTRA, // solo la saldada tiene pagos
        savings_goals: [],
        behavior_profiles: { discipline: 6 },
      }),
    );
    // Hay una deuda viva (activa) → debtMethod presente; la saldada quedó fuera del cálculo.
    expect(summary.diagnosis.debtMethod).toBeDefined();
  });
});

describe("buildDeudasVsMes NO se toca — usa el ancla como monto de ALTA (flujo), correcto por diseño", () => {
  it("una deuda saldada en un mes PREVIO no aporta al delta del mes en curso (createdOn fuera del periodo)", () => {
    const vs = buildDeudasVsMes({
      payments: [], // los pagos que la saldaron ocurrieron en un mes previo, no en este
      debts: [
        { balance: 0, originalAmount: 500_000, currency: "CRC", createdOn: "2026-01-05" }, // alta en enero
      ],
      from: "2026-08-01",
      to: "2026-08-31",
      convert: (n: number) => n,
    });
    expect(vs).toBeNull(); // adquirido 0 (fuera de periodo) + sin pagos → sin chip
  });

  it("una deuda ADQUIRIDA este mes cuenta su alta (originalAmount), no su saldo vivo", () => {
    const vs = buildDeudasVsMes({
      payments: [{ kind: "gasto", amount: 200_000, currency: "CRC" }], // pagos del mes
      debts: [
        { balance: 300_000, originalAmount: 500_000, currency: "CRC", createdOn: "2026-08-03" },
      ],
      from: "2026-08-01",
      to: "2026-08-31",
      convert: (n: number) => n,
    });
    // adquirido = originalAmount 500k (alta del mes), pagado = 200k → net +300k "adquiriste".
    expect(vs).not.toBeNull();
    expect(vs!.value).toBe(300_000);
  });
});

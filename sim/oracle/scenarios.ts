/**
 * Deterministic oracle scenarios — explicit event scripts driven through the REAL
 * ctx-aware services (via AppDriver + a couple of direct service calls for shapes the
 * driver doesn't expose: an apr>0 debt and an ahorro-natured expense). Each scenario is
 * shaped to exercise specific metrics + fragile zones. Parameterizable via SCENARIOS so
 * the cert run can scale to more (and later the 300-population) without rewrites.
 *
 * This is harness-side, so importing src/modules is fine (the purity rule is metrics.ts).
 */
import type { AuthContext } from "@/lib/auth/auth-context";
import type { AssetType } from "@/lib/market-data";
import { createExpense } from "@/modules/financial-base/services/base-service";
import { createDebt } from "@/modules/control/services/control-service";
import { ensureMonthlyContributions } from "@/modules/wealth/services/contribution-service";
import { userCurrentPeriod } from "@/lib/time/user-time";
import { AppDriver } from "../app-driver";
import { onMonthDay, virtualMonthDayISO } from "../clock";
import { seedPrice } from "../library/dca/price-mock";
import type { EventLog } from "../event-log";
import type { InitialPosition } from "./types";

const CURRENCY = "CRC";

export interface SeedPrice {
  assetType: AssetType;
  symbol: string;
  price: number;
}

export interface ScenarioResult {
  /** Mock prices to re-seed before each app read that values the quoted holding. */
  seedPrices: SeedPrice[];
  /** Known initial quoted positions (for the event-sourced portfolio oracle). */
  initials: InitialPosition[];
  goalId: string | null;
  debtId: string | null;
  /** The unpriced holding id whose priceUnavailable flag zone 6 asserts (or null). */
  unpricedHoldingId: string | null;
  /** The final period read at (month close). */
  period: { year: number; month: number };
  months: number;
}

export interface Scenario {
  key: string;
  displayName: string;
  run(ctx: AuthContext, driver: AppDriver, log: EventLog): Promise<ScenarioResult>;
}

/** Direct createDebt with a real APR (the driver hardcodes apr:0). Reads the id back. */
async function seedAprDebt(
  ctx: AuthContext,
  name: string,
  balance: number,
  minPayment: number,
  apr: number,
): Promise<string> {
  await createDebt({ name, balance, minPayment, currentPayment: minPayment, apr, currency: CURRENCY }, ctx);
  const { data, error } = await ctx.db
    .from("debts")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("name", name)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error(`[oracle] no encontré la deuda apr>0 "${name}": ${error?.message ?? "sin fila"}`);
  return data.id;
}

/** Direct createExpense with an ahorro nature (the driver hardcodes esencial). */
async function seedAhorroExpense(ctx: AuthContext, name: string, amountMonthly: number): Promise<void> {
  await createExpense(
    { name, nature: "ahorro", amount: amountMonthly, currency: CURRENCY, frequency: "mensual", isFixed: true, ownerScope: "usuario" },
    ctx,
  );
}

// ── Scenario 1 · control-excelente (flujo, ahorro z1, freeCashflow z2, meta z5) ──
const controlExcelente: Scenario = {
  key: "control-excelente",
  displayName: "Control Excelente",
  async run(ctx, driver, log) {
    const months = 2;
    const setup = await onMonthDay(0, 1, async () => {
      driver.day = 0;
      const period = await userCurrentPeriod(ctx);
      await driver.openingBalance(500_000);
      await driver.addIncomeSource("Salario", 800_000);
      await driver.addExpenseItem("Renta", 300_000);
      await seedAhorroExpense(ctx, "Ahorro programado", 100_000); // z1: allocation
      const incomeLineId = await driver.addIncomeBudgetLine("Salario", 800_000, period);
      await driver.addExpenseBudgetLine("Renta", 300_000, period);
      const goalId = await driver.addGoal("Vacaciones", 1_000_000);
      return { incomeLineId, goalId };
    });
    for (let m = 0; m < months; m++) {
      await onMonthDay(m, 5, async () => {
        driver.day = m * 100 + 5;
        await driver.receiveIncome(setup.incomeLineId, 800_000, virtualMonthDayISO(m, 5));
      });
      await onMonthDay(m, 10, async () => {
        driver.day = m * 100 + 10;
        await driver.spend(300_000, virtualMonthDayISO(m, 10), "Renta");
      });
      await onMonthDay(m, 15, async () => {
        driver.day = m * 100 + 15;
        await driver.contributeGoal(setup.goalId, 50_000, virtualMonthDayISO(m, 15)); // z2 capital + z5
      });
    }
    const period = await onMonthDay(months - 1, 28, () => userCurrentPeriod(ctx));
    log.record("info", `escenario control-excelente listo (meses=${months})`);
    return { seedPrices: [], initials: [], goalId: setup.goalId, debtId: null, unpricedHoldingId: null, period, months };
  },
};

// ── Scenario 2 · sobreendeudado (deuda apr>0, replay z3, 2 pagos mismo mes) ──
const sobreendeudado: Scenario = {
  key: "sobreendeudado",
  displayName: "Sobreendeudado",
  async run(ctx, driver, log) {
    const months = 2;
    const setup = await onMonthDay(0, 1, async () => {
      driver.day = 0;
      const period = await userCurrentPeriod(ctx);
      await driver.openingBalance(200_000);
      await driver.addIncomeSource("Salario", 400_000);
      await driver.addExpenseItem("Gastos", 350_000);
      const incomeLineId = await driver.addIncomeBudgetLine("Salario", 400_000, period);
      const debtId = await seedAprDebt(ctx, "Tarjeta", 1_000_000, 50_000, 24); // apr 24% → z3/z4 live
      return { incomeLineId, debtId };
    });
    // Month 0: salary + TWO debt payments in the SAME month (days 5 & 20) → zone 3.
    await onMonthDay(0, 5, async () => {
      driver.day = 5;
      await driver.receiveIncome(setup.incomeLineId, 400_000, virtualMonthDayISO(0, 5));
      await driver.payDebt(setup.debtId, 50_000, virtualMonthDayISO(0, 5));
    });
    await onMonthDay(0, 20, async () => {
      driver.day = 20;
      await driver.payDebt(setup.debtId, 50_000, virtualMonthDayISO(0, 20)); // same month
    });
    // Month 1: salary + one debt payment.
    await onMonthDay(1, 5, async () => {
      driver.day = 105;
      await driver.receiveIncome(setup.incomeLineId, 400_000, virtualMonthDayISO(1, 5));
      await driver.payDebt(setup.debtId, 50_000, virtualMonthDayISO(1, 5));
    });
    const period = await onMonthDay(months - 1, 28, () => userCurrentPeriod(ctx));
    log.record("info", `escenario sobreendeudado listo (meses=${months})`);
    return { seedPrices: [], initials: [], goalId: null, debtId: setup.debtId, unpricedHoldingId: null, period, months };
  },
};

// ── Scenario 3 · inversionista-dca (portafolio event-sourced z8, valor/PL) ──
const inversionistaDca: Scenario = {
  key: "inversionista-dca",
  displayName: "Inversionista DCA",
  async run(ctx, driver, log) {
    const months = 2;
    const SYMBOL = "VOO";
    const MOCK_PRICE = 450;
    const INITIAL_QTY = 10;
    const INITIAL_COST = 400;
    const MONTHLY = 100_000;
    const setup = await onMonthDay(0, 1, async () => {
      driver.day = 0;
      const period = await userCurrentPeriod(ctx);
      await driver.openingBalance(1_000_000);
      await driver.addIncomeSource("Salario", 800_000);
      await driver.addExpenseItem("Gastos", 300_000);
      const incomeLineId = await driver.addIncomeBudgetLine("Salario", 800_000, period);
      seedPrice("etf", SYMBOL, MOCK_PRICE, CURRENCY);
      const holdingId = await driver.addRecurringQuotedHolding("VOO ETF", SYMBOL, INITIAL_QTY, INITIAL_COST, MONTHLY);
      return { incomeLineId, holdingId };
    });
    for (let m = 0; m < months; m++) {
      await onMonthDay(m, 5, async () => {
        driver.day = m * 100 + 5;
        await driver.receiveIncome(setup.incomeLineId, 800_000, virtualMonthDayISO(m, 5));
      });
      // Auto-DCA: seed price → ensureMonthlyContributions (writes holding_contributions).
      await onMonthDay(m, 25, async () => {
        driver.day = m * 100 + 25;
        seedPrice("etf", SYMBOL, MOCK_PRICE, CURRENCY);
        await ensureMonthlyContributions(ctx);
      });
    }
    const period = await onMonthDay(months - 1, 28, () => userCurrentPeriod(ctx));
    log.record("info", `escenario inversionista-dca listo (meses=${months})`);
    return {
      seedPrices: [{ assetType: "etf", symbol: SYMBOL, price: MOCK_PRICE }],
      initials: [{ holdingId: setup.holdingId, symbol: SYMBOL, quantity: INITIAL_QTY, unitCost: INITIAL_COST }],
      goalId: null,
      debtId: null,
      unpricedHoldingId: null,
      period,
      months,
    };
  },
};

// ── Scenario 4 · precio-ausente (fragile zone 6 probe) ──
const precioAusente: Scenario = {
  key: "precio-ausente",
  displayName: "Probe · precio ausente",
  async run(ctx, driver, log) {
    const setup = await onMonthDay(0, 1, async () => {
      driver.day = 0;
      await driver.openingBalance(500_000);
      // A quoted holding whose price is NEVER seeded → getPortfolioReport (cache mode)
      // finds no price → priceUnavailable. The oracle can't value it (unknown), while
      // the app values it at cost (PL=0).
      const holdingId = await driver.addRecurringQuotedHolding("MSTR sin precio", "MSTR", 3, 1000, 0);
      return { holdingId };
    });
    const period = await onMonthDay(0, 28, () => userCurrentPeriod(ctx));
    log.record("info", "escenario precio-ausente listo");
    return { seedPrices: [], initials: [], goalId: null, debtId: null, unpricedHoldingId: setup.holdingId, period, months: 1 };
  },
};

/** The scenario roster. Cert runs default to all; parameterize by key to scale. */
export const SCENARIOS: Scenario[] = [controlExcelente, sobreendeudado, inversionistaDca, precioAusente];

export function selectScenarios(keys?: string[]): Scenario[] {
  if (!keys || keys.length === 0) return SCENARIOS;
  return SCENARIOS.filter((s) => keys.includes(s.key));
}

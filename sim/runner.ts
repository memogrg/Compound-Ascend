/**
 * Vertical-slice runner (F1c). Creates a synthetic user, seeds the "control
 * excelente" persona, drives a few REAL money events on a single virtual
 * timeline, and validates the core invariants after each event and at close —
 * all through the app's own ctx-aware services. Always tears the user down.
 *
 * The whole financial setup AND every event run under `withSimClock` from day 0,
 * so budget periods, opening balance and events share the same virtual month
 * (never the real "now" for setup and a virtual date for events).
 */
import { userCurrentPeriod } from "@/lib/time/user-time";
import { getPrimaryCurrency } from "@/modules/financial-base/services/base-service";
import { getLiquidityBalance } from "@/modules/financial-base/services/liquidity-service";
import { createSimUser } from "./harness";
import { AppDriver } from "./app-driver";
import { buildControlExcelente } from "./personas/control-excelente";
import { onDay, virtualISO } from "./clock";
import { EventLog } from "./event-log";
import * as V from "./validators";

/** The single currency for the run; identity conversions downstream. */
const RUN_CURRENCY = "CRC";

export interface SimResult {
  log: EventLog;
  failures: number;
  email: string;
  seed: number;
}

export async function runVerticalSlice(opts: { seed: number; nowStamp: number }): Promise<SimResult> {
  const persona = buildControlExcelente(opts.seed);
  const log = new EventLog();
  log.record("info", `rebanada vertical · persona=${persona.key} seed=0x${persona.seed.toString(16)}`);

  const sim = await createSimUser({
    seed: opts.seed,
    currency: RUN_CURRENCY,
    nowStamp: opts.nowStamp,
    log,
  });
  const { ctx } = sim;

  try {
    // Single source of truth for the run's currency (whatever the DB effectively
    // holds after the harness pinned it) — every amount uses it → identity FX.
    const currency = await getPrimaryCurrency(ctx);
    const driver = new AppDriver(ctx, currency, log);

    // ---- SETUP (virtual day 0) ----
    const ids: V.EntityIds = await onDay(0, async () => {
      log.record("phase", "SETUP (día 0 virtual)", 0);
      driver.day = 0;
      const period = await userCurrentPeriod(ctx);
      await driver.openingBalance(persona.setup.openingBalance);
      await driver.addIncomeSource(persona.setup.incomeSourceName, persona.setup.incomeSourceMonthly);
      await driver.addExpenseItem(persona.setup.expenseItemName, persona.setup.expenseItemMonthly);
      const incomeLineId = await driver.addIncomeBudgetLine(
        persona.setup.incomeBudgetName,
        persona.setup.incomeBudgetAmount,
        period,
      );
      await driver.addExpenseBudgetLine(persona.setup.expenseBudgetName, persona.setup.expenseBudgetAmount, period);
      const debtId = await driver.addDebt(
        persona.setup.debtName,
        persona.setup.debtBalance,
        persona.setup.debtMinPayment,
      );
      const goalId = await driver.addGoal(persona.setup.goalName, persona.setup.goalTarget);
      await driver.addHolding(persona.setup.holdingLabel, persona.setup.holdingValue);
      return { incomeLineId, debtId, goalId };
    });

    // ---- EVENTS + running liquidity checks ----
    let expectedLiquidity = persona.setup.openingBalance;

    await onDay(persona.days.income, async () => {
      log.record("phase", "EVENTO · ingreso", persona.days.income);
      driver.day = persona.days.income;
      await driver.receiveIncome(ids.incomeLineId, persona.events.incomeReceived, virtualISO(persona.days.income));
      expectedLiquidity += persona.events.incomeReceived;
      await V.validateLiquidity(ctx, expectedLiquidity, log, "tras ingreso");
    });

    await onDay(persona.days.expense, async () => {
      log.record("phase", "EVENTO · gasto", persona.days.expense);
      driver.day = persona.days.expense;
      await driver.spend(persona.events.expenseSpent, virtualISO(persona.days.expense));
      expectedLiquidity -= persona.events.expenseSpent;
      await V.validateLiquidity(ctx, expectedLiquidity, log, "tras gasto");
    });

    await onDay(persona.days.debt, async () => {
      log.record("phase", "EVENTO · pago de deuda", persona.days.debt);
      driver.day = persona.days.debt;
      await driver.payDebt(ids.debtId, persona.events.debtPaid, virtualISO(persona.days.debt));
      expectedLiquidity -= persona.events.debtPaid;
      await V.validateLiquidity(ctx, expectedLiquidity, log, "tras pago de deuda");
    });

    await onDay(persona.days.goalContribution, async () => {
      log.record("phase", "EVENTO · aporte a meta", persona.days.goalContribution);
      driver.day = persona.days.goalContribution;
      await driver.contributeGoal(ids.goalId, persona.events.goalContributed, virtualISO(persona.days.goalContribution));
      expectedLiquidity -= persona.events.goalContributed;
      await V.validateLiquidity(ctx, expectedLiquidity, log, "tras aporte a meta");
    });

    // Jar consumption: NO double count → liquidity unchanged across it.
    await onDay(persona.days.goalSpend, async () => {
      log.record("phase", "EVENTO · consumo de frasco", persona.days.goalSpend);
      driver.day = persona.days.goalSpend;
      const before = (await getLiquidityBalance(ctx)).balance;
      await driver.spendGoal(ids.goalId, persona.events.goalSpent, virtualISO(persona.days.goalSpend));
      const after = (await getLiquidityBalance(ctx)).balance;
      V.validateNoDoubleCount(before, after, log);
      await V.validateLiquidity(ctx, expectedLiquidity, log, "tras consumo de frasco");
    });

    // ---- CLOSE: full invariant battery (under the clock → the virtual month) ----
    await onDay(persona.days.goalSpend, async () => {
      log.record("phase", "CIERRE · batería de invariantes", persona.days.goalSpend);
      const period = await userCurrentPeriod(ctx);
      await V.validateMonthFlow(
        ctx,
        period,
        {
          operatingIncome: persona.events.incomeReceived,
          operatingExpense: persona.events.expenseSpent + persona.events.debtPaid,
          operatingFlow: persona.events.incomeReceived - (persona.events.expenseSpent + persona.events.debtPaid),
          capitalOut: persona.events.goalContributed,
        },
        log,
      );
      await V.validateGoal(ctx, ids.goalId, persona.events.goalContributed - persona.events.goalSpent, log);
      await V.validateNetWorth(ctx, log);
      await V.validateLinkedIntegrity(ctx, period, ids, log);
    });

    return { log, failures: log.failures.length, email: sim.email, seed: persona.seed };
  } finally {
    await sim.teardown();
    log.record("info", "usuario sintético eliminado (cascade)");
  }
}

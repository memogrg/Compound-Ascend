/**
 * Generalized library runner (F2). For each persona: create a synthetic user,
 * seed its financial base, run the behavioral engine over `months` virtual months
 * day by day (executing REAL app events via the driver under withSimClock),
 * validate the core invariants after each jar spend and at every month close, and
 * always tear the user down. Deterministic per persona seed.
 *
 * Expectations are accumulated FROM the executed event stream (not a script), so
 * the invariants stay exact whatever the motor decides.
 */
import { userCurrentPeriod } from "@/lib/time/user-time";
import { getPrimaryCurrency } from "@/modules/financial-base/services/base-service";
import { getLiquidityBalance } from "@/modules/financial-base/services/liquidity-service";
import type { AuthContext } from "@/lib/auth/auth-context";
import type { Period } from "@/modules/financial-base/types";
import { createSimUser } from "../harness";
import { AppDriver } from "../app-driver";
import { onMonthDay, virtualMonthDayISO } from "../clock";
import { EventLog } from "../event-log";
import { createPrng } from "../prng";
import {
  validateLiquidity,
  validateNoDoubleCount,
  validateMonthFlow,
  validateGoal,
  validateNetWorth,
} from "../validators";
import { PERSONA_LIBRARY } from "./personas";
import { decideDayEvents } from "./behavior-engine";
import {
  validateBudgetReconciliation,
  validateLinkedIntegrityDynamic,
  logInsights,
} from "./validators";
import {
  emptyMonthTally,
  type MonthTally,
  type PersonaSpec,
  type PlannedEvent,
  type SimEntityIds,
  type SimState,
} from "./persona-types";

/** Single currency for the run → identity FX, exact invariants (matches F1c). */
const RUN_CURRENCY = "CRC";
/** Days walked per virtual month; ≤ 28 so every day stays within its own period. */
const DAYS_PER_MONTH = 28;
/** Base seed mixed with each persona key so seeds are distinct but deterministic. */
const LIBRARY_BASE_SEED = 0xf2c0ffee;

export interface PersonaResult {
  persona: string;
  displayName: string;
  log: EventLog;
  failures: number;
  checks: number;
  email: string;
}

/** Deterministic, distinct seed per persona key (FNV-1a ⊕ base). */
export function personaSeed(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h ^ LIBRARY_BASE_SEED) >>> 0;
}

async function seedPersona(
  driver: AppDriver,
  persona: PersonaSpec,
  period: Period,
): Promise<SimEntityIds> {
  const s = persona.setup;
  await driver.openingBalance(s.openingBalance);
  await driver.addIncomeSource(s.incomeSourceName, s.monthlyIncome);
  await driver.addExpenseItem(s.expenseItemName, s.fixedExpenseMonthly);
  const incomeLineId = await driver.addIncomeBudgetLine(s.incomeBudgetName, s.monthlyIncome, period);
  await driver.addExpenseBudgetLine(s.expenseBudgetName, s.fixedExpenseMonthly, period);
  const debtId = s.hasDebt ? await driver.addDebt(s.debtName, s.debtBalance, s.debtMinPayment) : null;
  const goalId = s.hasGoal ? await driver.addGoal(s.goalName, s.goalTarget) : null;
  const holdingId = s.hasInvestment ? await driver.addHolding(s.holdingLabel, s.investmentValue) : null;
  return { incomeLineId, debtId, goalId, holdingId };
}

async function executeEvent(
  driver: AppDriver,
  ev: PlannedEvent,
  state: SimState,
  tally: MonthTally,
  ctx: AuthContext,
  monthIndex: number,
  dayInMonth: number,
  log: EventLog,
): Promise<void> {
  const iso = virtualMonthDayISO(monthIndex, dayInMonth);
  switch (ev.kind) {
    case "income":
      await driver.receiveIncome(state.ids.incomeLineId, ev.amount, iso);
      state.liquidity += ev.amount;
      tally.operatingIncome += ev.amount;
      break;
    case "expense":
      await driver.spend(ev.amount, iso, ev.label);
      state.liquidity -= ev.amount;
      tally.operatingExpense += ev.amount;
      tally.budgetAwareSpend += ev.amount;
      break;
    case "debtPayment":
      if (!state.ids.debtId) break;
      await driver.payDebt(state.ids.debtId, ev.amount, iso);
      state.liquidity -= ev.amount;
      tally.operatingExpense += ev.amount;
      tally.budgetAwareSpend += ev.amount;
      tally.debtMovs += 1;
      break;
    case "goalContribution":
      if (!state.ids.goalId) break;
      await driver.contributeGoal(state.ids.goalId, ev.amount, iso);
      state.liquidity -= ev.amount;
      state.goalCurrent += ev.amount;
      tally.capitalOut += ev.amount;
      tally.budgetAwareSpend += ev.amount;
      tally.goalMovs += 1;
      break;
    case "goalSpend": {
      if (!state.ids.goalId) break;
      // Off-budget: liquidity must not move across it (no double counting).
      const before = (await getLiquidityBalance(ctx)).balance;
      await driver.spendGoal(state.ids.goalId, ev.amount, iso);
      const after = (await getLiquidityBalance(ctx)).balance;
      validateNoDoubleCount(before, after, log);
      state.goalCurrent -= ev.amount;
      tally.goalMovs += 1;
      tally.jarSpends += 1;
      break;
    }
    case "goalWithdraw":
      if (!state.ids.goalId) break;
      await driver.withdrawGoal(state.ids.goalId, ev.amount, iso);
      state.liquidity += ev.amount;
      state.goalCurrent -= ev.amount;
      tally.goalMovs += 1;
      break;
    case "investmentBuy":
      if (!state.ids.holdingId) break;
      await driver.contributeInvestment(state.ids.holdingId, ev.amount, iso);
      state.liquidity -= ev.amount;
      tally.capitalOut += ev.amount;
      tally.budgetAwareSpend += ev.amount;
      break;
    case "lifeEvent":
      state.incomeMultiplier *= ev.incomeMultiplier;
      log.record("event", `hito vital · ${ev.label}`, monthIndex * 100 + dayInMonth, {
        multiplier: ev.incomeMultiplier,
      });
      break;
  }
}

export async function runPersona(
  persona: PersonaSpec,
  opts: { nowStamp: number; months?: number },
): Promise<PersonaResult> {
  const months = opts.months ?? 1;
  const log = new EventLog();
  log.record(
    "info",
    `persona=${persona.key} seed=0x${persona.seed.toString(16)} meses=${months}`,
  );

  const sim = await createSimUser({
    seed: persona.seed,
    currency: RUN_CURRENCY,
    nowStamp: opts.nowStamp,
    log,
  });
  const { ctx } = sim;

  try {
    const currency = await getPrimaryCurrency(ctx);
    const driver = new AppDriver(ctx, currency, log);

    const ids = await onMonthDay(0, 1, async () => {
      log.record("phase", "SETUP (mes 0, día 1)", 0);
      driver.day = 0;
      const period = await userCurrentPeriod(ctx);
      return seedPersona(driver, persona, period);
    });

    const state: SimState = {
      ids,
      liquidity: persona.setup.openingBalance,
      goalCurrent: 0,
      incomeMultiplier: 1,
    };

    for (let m = 0; m < months; m++) {
      const tally = emptyMonthTally();

      for (let d = 1; d <= DAYS_PER_MONTH; d++) {
        await onMonthDay(m, d, async () => {
          driver.day = m * 100 + d;
          const events = decideDayEvents(persona, state, m, d, createRngForDay(persona, m, d));
          for (const ev of events) {
            await executeEvent(driver, ev, state, tally, ctx, m, d, log);
          }
        });
      }

      // Month close: full invariant battery under the clock → this month's period.
      await onMonthDay(m, DAYS_PER_MONTH, async () => {
        const label = `cierre mes ${m + 1}`;
        log.record("phase", `CIERRE · ${label}`, m * 100 + DAYS_PER_MONTH);
        const period = await userCurrentPeriod(ctx);
        await validateMonthFlow(
          ctx,
          period,
          {
            operatingIncome: tally.operatingIncome,
            operatingExpense: tally.operatingExpense,
            operatingFlow: tally.operatingIncome - tally.operatingExpense,
            capitalOut: tally.capitalOut,
          },
          log,
        );
        await validateBudgetReconciliation(ctx, period, tally.budgetAwareSpend, log);
        if (state.ids.goalId) await validateGoal(ctx, state.ids.goalId, state.goalCurrent, log);
        await validateNetWorth(ctx, log);
        await validateLinkedIntegrityDynamic(
          ctx,
          period,
          {
            debtId: state.ids.debtId,
            expectedDebtMovs: tally.debtMovs,
            expectedGoalMovs: tally.goalMovs,
            expectedJarSpends: tally.jarSpends,
          },
          log,
        );
        await validateLiquidity(ctx, state.liquidity, log, label);
        await logInsights(ctx, log, label);
      });
    }

    return {
      persona: persona.key,
      displayName: persona.displayName,
      log,
      failures: log.failures.length,
      checks: log.checks.length,
      email: sim.email,
    };
  } finally {
    await sim.teardown();
    log.record("info", "usuario sintético eliminado (cascade)");
  }
}

/**
 * One Prng advanced across the whole persona run would be simplest, but the day
 * loop is re-entered per day; to keep draws deterministic AND independent of how
 * many events fired earlier, each day gets its own Prng seeded from
 * (personaSeed, month, day). Same inputs ⇒ same day, regardless of history.
 */
function createRngForDay(persona: PersonaSpec, monthIndex: number, dayInMonth: number) {
  const daySeed = (persona.seed ^ Math.imul(monthIndex + 1, 0x9e3779b1) ^ Math.imul(dayInMonth, 0x85ebca77)) >>> 0;
  return createPrng(daySeed);
}

export async function runLibrary(opts: {
  nowStamp: number;
  months?: number;
  only?: string;
}): Promise<PersonaResult[]> {
  const entries = opts.only
    ? PERSONA_LIBRARY.filter((e) => e.key === opts.only)
    : PERSONA_LIBRARY;
  const results: PersonaResult[] = [];
  for (const entry of entries) {
    const persona = entry.build(personaSeed(entry.key));
    results.push(await runPersona(persona, { nowStamp: opts.nowStamp, months: opts.months }));
  }
  return results;
}

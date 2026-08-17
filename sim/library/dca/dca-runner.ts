/**
 * DCA runner (F3a-DCA). Seeds a persona with a QUOTED recurring holding, then each
 * month: pays the salary, seeds a deterministic price, triggers the REAL auto-DCA
 * (ensureMonthlyContributions, simulating a Patrimonio/dashboard load), writes the
 * net-worth + portfolio snapshots, and validates the DCA invariants + core identities.
 *
 * Determinism: fixed mocked price → the merge and the (net-worth-neutral) DCA are
 * exact. The price is seeded before ensureMonthlyContributions AND before any
 * net-worth/portfolio read (the quoted holding is valued at the live/mocked price).
 */
import { userCurrentPeriod } from "@/lib/time/user-time";
import { getPrimaryCurrency } from "@/modules/financial-base/services/base-service";
import { generateNetWorthSnapshot } from "@/modules/rich-life/services/net-worth-snapshot-service";
import { getRichLifeSummary } from "@/modules/rich-life/services/rich-life-service";
import { generateAndSaveSnapshot } from "@/modules/wealth/services/snapshot-service";
import { getPortfolioReport } from "@/modules/wealth/services/portfolio-service";
import { ensureMonthlyContributions } from "@/modules/wealth/services/contribution-service";
import { createSimUser } from "../../harness";
import { AppDriver } from "../../app-driver";
import { onMonthDay, virtualMonthDayISO } from "../../clock";
import { EventLog } from "../../event-log";
import { TEST_ENV } from "../../env";
import { validateLiquidity, validateNetWorth } from "../../validators";
import { buildInversionistaDca } from "./dca-persona";
import { seedPrice } from "./price-mock";
import {
  validateDcaContributions,
  validateDcaMerge,
  validateDcaLinkedTxns,
  validatePortfolioSnapshots,
  validateInversionesVsMes,
  validateInvestmentTxnDiscrepancy,
} from "./dca-validators";

const RUN_CURRENCY = "CRC";
const DAYS_PER_MONTH = 28;
const DCA_SEED = 0xdca5eed;

export interface DcaResult {
  persona: string;
  log: EventLog;
  failures: number;
  checks: number;
  email: string;
}

/**
 * Prod guardrail: generateAndSaveSnapshot writes via a SERVICE-ROLE client
 * (createServiceRoleClient → NEXT_PUBLIC_SUPABASE_URL). Fail fast unless that env
 * points at the TEST project — never write portfolio_snapshots to production.
 */
function assertTestEnv(): void {
  if (!TEST_ENV.url || process.env.NEXT_PUBLIC_SUPABASE_URL !== TEST_ENV.url) {
    throw new Error(
      "GUARD: NEXT_PUBLIC_SUPABASE_URL no apunta a SUPABASE_TEST_URL — abortado (el writer service-role nunca debe tocar prod).",
    );
  }
}

export async function runDcaPersona(opts: { nowStamp: number; months?: number }): Promise<DcaResult> {
  const months = opts.months ?? 6;
  const persona = buildInversionistaDca(DCA_SEED);
  const log = new EventLog();
  log.record("info", `persona=${persona.key} seed=0x${persona.seed.toString(16)} meses=${months}`);

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
      await driver.openingBalance(persona.openingBalance);
      await driver.addIncomeSource(persona.incomeSourceName, persona.monthlyIncome);
      const incomeLineId = await driver.addIncomeBudgetLine(
        persona.incomeBudgetName,
        persona.monthlyIncome,
        period,
      );
      // Seed the price so createHolding's valuation is deterministic from the start.
      seedPrice(persona.marketType, persona.symbol, persona.mockPrice, currency);
      const holdingId = await driver.addRecurringQuotedHolding(
        persona.holdingLabel,
        persona.symbol,
        persona.initialQuantity,
        persona.mockPrice,
        persona.monthlyContribution,
      );
      return { incomeLineId, holdingId };
    });

    // Expected accounting (cumulative). The DCA gasto reduces liquidity; the merge
    // grows quantity by monthlyContribution/mockPrice.
    let expLiquidity = persona.openingBalance;
    let expQuantity = persona.initialQuantity;

    for (let m = 0; m < months; m++) {
      // Salary on payday.
      await onMonthDay(m, persona.payDay, async () => {
        driver.day = m * 100 + persona.payDay;
        await driver.receiveIncome(
          ids.incomeLineId,
          persona.monthlyIncome,
          virtualMonthDayISO(m, persona.payDay),
        );
        expLiquidity += persona.monthlyIncome;
      });

      // Month close: seed price → auto-DCA → snapshots → validators.
      await onMonthDay(m, DAYS_PER_MONTH, async () => {
        const label = `cierre mes ${m + 1}`;
        log.record("phase", `CIERRE · ${label}`, m * 100 + DAYS_PER_MONTH);
        driver.day = m * 100 + DAYS_PER_MONTH;

        // Deterministic price active for the DCA AND all valuations that follow.
        seedPrice(persona.marketType, persona.symbol, persona.mockPrice, currency);

        // Auto-DCA (simulates the Patrimonio/dashboard load). Registers this month's
        // contribution: merge + linked gasto + holding_contributions row.
        await ensureMonthlyContributions(ctx);
        expLiquidity -= persona.monthlyContribution;
        expQuantity += persona.monthlyContribution / persona.mockPrice;

        const period = await userCurrentPeriod(ctx);

        // net_worth_snapshot (ctx-aware writer, TEST/RLS).
        await generateNetWorthSnapshot({ year: period.year, month: period.month }, ctx, {
          precios: "cache",
        });

        // portfolio_snapshot (service-role writer) — env-guarded, never prod.
        assertTestEnv();
        const [port, rl] = await Promise.all([
          getPortfolioReport(ctx),
          getRichLifeSummary({ precios: "cache" }, ctx),
        ]);
        const portfolioValue = port.analytics.totalPortfolioValue;
        await generateAndSaveSnapshot(
          ctx.userId,
          portfolioValue,
          portfolioValue,
          rl.snapshot.indicators.netWorth,
          currency,
        );

        // Core identities.
        await validateLiquidity(ctx, expLiquidity, log, label);
        await validateNetWorth(ctx, log);

        // DCA invariants (1–4).
        await validateDcaContributions(ctx, ids.holdingId, m + 1, persona.mockPrice, log);
        await validateDcaMerge(ctx, ids.holdingId, expQuantity, log);
        await validateDcaLinkedTxns(ctx, ids.holdingId, m + 1, log);
        await validatePortfolioSnapshots(ctx, m + 1, log);
        // #5 vs-mes inversiones — needs a prior month's snapshot (m ≥ 1).
        if (m >= 1) await validateInversionesVsMes(ctx, log);
        // #6 known-discrepancy characterization (issue #655).
        await validateInvestmentTxnDiscrepancy(ctx, ids.holdingId, m + 1, log);
      });
    }

    return {
      persona: persona.key,
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

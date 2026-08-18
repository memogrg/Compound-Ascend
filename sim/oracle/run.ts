/**
 * Oracle orchestrator: for each scenario, seed via the REAL services, then at the final
 * month close read BOTH the app's service outputs and the raw rows, re-derive every
 * metric independently, and compare. Blocking = core identities + non-finite values;
 * everything else = characterization with the expected model difference. Teardown always.
 */
import type { AuthContext } from "@/lib/auth/auth-context";
import { getPrimaryCurrency, getBaseSummary } from "@/modules/financial-base/services/base-service";
import { getLiquidityBalance } from "@/modules/financial-base/services/liquidity-service";
import { getMonthFlow } from "@/modules/financial-base/services/month-flow-service";
import { getControlSummary } from "@/modules/control/services/control-service";
import { getGoalDetail } from "@/modules/control/services/goal-detail-service";
import { getDebtsOverview } from "@/modules/control/services/debts-service";
import { getRichLifeSummary } from "@/modules/rich-life/services/rich-life-service";
import { getPortfolioReport } from "@/modules/wealth/services/portfolio-service";
import { userCurrentPeriod } from "@/lib/time/user-time";
import { createSimUser } from "../harness";
import { AppDriver } from "../app-driver";
import { onMonthDay } from "../clock";
import { seedPrice } from "../library/dca/price-mock";
import { EventLog } from "../event-log";
import { readRaw } from "./raw";
import * as M from "./metrics";
import { compareIdentity, compareCharacterization } from "./compare";
import { CENT_EPS, MONEY_EPS, RATIO_EPS } from "./tolerances";
import { selectScenarios, type Scenario, type ScenarioResult } from "./scenarios";
import type { Discrepancy, PriceBook } from "./types";

const CURRENCY = "CRC";

/** Distinct deterministic seed per scenario key (FNV-1a). */
function scenarioSeed(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h ^ 0x00ac1e00) >>> 0;
}

export async function runOracle(opts: { nowStamp: number; scenarios?: string[] }): Promise<Discrepancy[]> {
  const out: Discrepancy[] = [];
  for (const scenario of selectScenarios(opts.scenarios)) {
    const log = new EventLog();
    const sim = await createSimUser({ seed: scenarioSeed(scenario.key), currency: CURRENCY, nowStamp: opts.nowStamp, log });
    try {
      const currency = await getPrimaryCurrency(sim.ctx);
      const driver = new AppDriver(sim.ctx, currency, log);
      const res = await scenario.run(sim.ctx, driver, log);
      const ds = await onMonthDay(res.months - 1, 28, () => compareScenario(sim.ctx, scenario, res));
      out.push(...ds);
    } finally {
      await sim.teardown();
    }
  }
  return out;
}

async function compareScenario(
  ctx: AuthContext,
  scenario: Scenario,
  res: ScenarioResult,
): Promise<Discrepancy[]> {
  const persona = scenario.displayName;
  const ds: Discrepancy[] = [];

  // Re-seed mock prices so the portfolio/net-worth reads value the quoted holding.
  for (const p of res.seedPrices) seedPrice(p.assetType, p.symbol, p.price, CURRENCY);
  const priceBook: PriceBook = Object.fromEntries(res.seedPrices.map((p) => [p.symbol.toUpperCase(), p.price]));

  const period = await userCurrentPeriod(ctx);
  const raw = await readRaw(ctx);

  const [liq, base, mf, rl, ctrl, debtsOv, port] = await Promise.all([
    getLiquidityBalance(ctx),
    getBaseSummary(ctx),
    getMonthFlow(period, ctx),
    getRichLifeSummary({ precios: "cache" }, ctx),
    getControlSummary(ctx),
    getDebtsOverview({}, ctx),
    getPortfolioReport(ctx),
  ]);

  const ind = rl.snapshot.indicators;
  const goalsApp = ctrl.goals.reduce((s, g) => s + Math.max(0, g.currentAmount), 0);
  const debtsApp = debtsOv.debts.reduce((s, d) => s + Math.max(0, d.balance), 0);
  const portApp = port.analytics.totalPortfolioValue;

  // ── BLOCKING · core identities ─────────────────────────────────────────────
  ds.push(
    compareIdentity({
      metric: "liquidez · identidad del saco",
      persona,
      oracle: M.oracleLiquidity(raw),
      app: M.round2(liq.balance),
      tolerance: CENT_EPS,
      note: "Σ deltas del ledger = saldo reportado",
    }),
  );
  ds.push(
    compareIdentity({
      metric: "patrimonio · neto = activos − pasivos",
      persona,
      oracle: M.round2(ind.totalAssets - ind.totalLiabilities),
      app: M.round2(ind.netWorth),
      tolerance: MONEY_EPS,
    }),
  );
  ds.push(
    compareIdentity({
      metric: "patrimonio · composición = liquidez + metas + inversiones − deudas",
      persona,
      oracle: M.round2(liq.balance + goalsApp + portApp - debtsApp),
      app: M.round2(ind.netWorth),
      tolerance: MONEY_EPS,
    }),
  );
  if (res.initials.length > 0) {
    // z8 core: event-sourced invested must equal the app's cost basis (no double count).
    const p = M.oraclePortfolio(raw, priceBook, res.initials);
    ds.push(
      compareIdentity({
        metric: "portafolio · sin doble conteo (invested event-sourced = cost_basis)",
        persona,
        oracle: p.invested,
        // Dinero → tolerancia de dinero (±1 CRC), no ±0.01: la deriva sub-peso del
        // promedio ponderado del DCA (quantity=Σ amount/price acumula error flotante) no
        // es doble conteo. Un doble-merge real (≥ un aporte entero) se atrapa igual con ±1.
        app: M.round2(port.analytics.totalCostBasis),
        tolerance: MONEY_EPS,
        note: `deriva sub-peso del promedio ponderado DCA; trap si se sumaran los ledgers = ${p.doubleCountTrap}`,
      }),
    );
  }

  // ── CHARACTERIZATION · the 8 fragile zones ──────────────────────────────────
  // z1 · savings rate: oracle credits only allocations, app also credits leftover.
  const sr = M.oracleSavingsRate(raw);
  ds.push(
    compareCharacterization({
      metric: "tasa de ahorro (z1)",
      persona,
      oracle: sr.oracleRate,
      app: base.indicators.savingsRate,
      tolerance: RATIO_EPS,
      expectedModelDiff: sr.expectedModelDiff,
      note: "el sobrante libre se acredita como ahorro",
    }),
  );

  // z2 · two flow definitions: operatingFlow (excl. capital) vs real (incl. capital).
  // Scoped to `period` — the same window getMonthFlow reports (else prior months leak in).
  const flow = M.oracleFlow(raw, period);
  ds.push(
    compareCharacterization({
      metric: "flujo · operativo (app) vs real incl. capital (oracle) (z2)",
      persona,
      oracle: flow.freeCashflowReal,
      app: mf.real.operatingFlow,
      tolerance: CENT_EPS,
      expectedModelDiff: M.round2(mf.capital.out),
      note: "difieren por los movimientos de capital (aportes a meta / compras)",
    }),
  );
  ds.push(
    compareCharacterization({
      metric: "flujo · operativo oracle vs app (independencia)",
      persona,
      oracle: flow.operatingFlow,
      app: mf.real.operatingFlow,
      tolerance: CENT_EPS,
      expectedModelDiff: 0,
      note: "clasificación operativa independiente debe coincidir",
    }),
  );

  // z3 + z4 · debt replay: day-count vs one-month-per-payment; APR fixed (z4 not exercised).
  if (res.debtId) {
    const vm = debtsOv.debts.find((d) => d.id === res.debtId);
    ds.push(
      compareCharacterization({
        metric: "deuda · saldo (replay día-a-día vs mes-por-pago) (z3/z4)",
        persona,
        oracle: M.oracleDebtBalance(raw, res.debtId),
        app: vm ? M.round2(vm.nativeBalance) : null,
        tolerance: CENT_EPS,
        expectedModelDiff: null,
        note: "app cobra 1 mes de interés por pago (2 pagos/mes → doble); z4 APR fija, no ejercitada",
      }),
    );
  }

  // z5 · goal: independent Σ linked vs stored current_amount (the reconciling plug).
  if (res.goalId) {
    const gd = await getGoalDetail(res.goalId, ctx);
    ds.push(
      compareCharacterization({
        metric: "meta · saved Σlinked vs current_amount (z5)",
        persona,
        oracle: M.oracleGoalSaved(raw, res.goalId),
        app: gd ? M.round2(gd.currentAmount) : null,
        tolerance: CENT_EPS,
        expectedModelDiff: 0,
        note: "si divergen, el plug 'inicial' ocultó una deriva del current_amount",
      }),
    );
  }

  // z6 · price unavailable: the app values at cost (PL=0); the oracle can't value it.
  if (res.unpricedHoldingId) {
    const perf = port.analytics.holdingsWithPerformance;
    const unpriced = perf.filter((h) => h.priceUnavailable).length;
    ds.push({
      metric: "portafolio · precio no disponible (z6)",
      persona,
      oracle: null,
      app: unpriced,
      delta: null,
      expectedModelDiff: null,
      tolerance: 0,
      severity: "characterization",
      verdict: "characterization",
      note:
        unpriced > 0
          ? `app marca ${unpriced} holding(s) priceUnavailable=true (honesto); su PL entra como 0 al agregado sin señal top-level`
          : "app NO marca priceUnavailable — valor a costo silencioso (revisar)",
    });
  }

  return ds;
}

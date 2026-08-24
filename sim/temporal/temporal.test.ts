/**
 * Fase 7 · TIME SIMULATION (headless). One deterministic CASH+DEBT persona run for MONTHS virtual
 * months under the virtual clock (withSimClock via onMonthDay), through the REAL ctx-aware services
 * — then every temporal series is verified against the INDEPENDENT oracle (./oracle.ts) + invariants.
 *
 * Gated on SUPABASE_TEST_* (self-skips without a test DB, like tests/rls). Run with `npm run sim`
 * or `npx vitest run --config sim/vitest.config.ts sim/temporal/temporal.test.ts`.
 *
 * ORACLE-BUG vs APP-BUG discipline (Fase 4): the oracle's own identities are asserted FIRST
 * (oracleSelfCheck). Only once the oracle is proven internally consistent is it used to judge the
 * app — so a divergence points at the app, not a defanged oracle.
 */
import { describe, it, expect } from "vitest";
import { SIM_DB_READY } from "../env";
import { EventLog } from "../event-log";
import { createSimUser } from "../harness";
import { AppDriver } from "../app-driver";
import { onMonthDay, virtualMonthDayISO } from "../clock";
import {
  CURRENCY,
  MONTHS,
  OPENING_BALANCE,
  DEBT_INITIAL,
  DEBT_MIN_PAYMENT,
  DEBT_PAYMENT,
  INCOME,
  EXPENSE,
} from "./persona";
import { deriveSeries, oracleTrajectory, oracleSelfCheck, dcaExpected } from "./oracle";
import { seedPrice } from "../library/dca/price-mock";
// App under test (ctx-aware services + the pure trajectory engine):
import { userCurrentPeriod } from "@/lib/time/user-time";
import { generateMonthlySnapshot } from "@/modules/financial-base/services/snapshot-service";
import { generateNetWorthSnapshot } from "@/modules/rich-life/services/net-worth-snapshot-service";
import { getRichLifeSummary } from "@/modules/rich-life/services/rich-life-service";
import { getDebtsOverview } from "@/modules/control/services/debts-service";
import { getSnapshotHistory, generateAndSaveSnapshot } from "@/modules/wealth/services/snapshot-service";
import { ensureMonthlyContributions } from "@/modules/wealth/services/contribution-service";
import { computeTrajectory, type MonthlyPoint } from "@/lib/ai/trajectory";

const near = (a: number, b: number, eps = 1): boolean => Math.abs(a - b) <= eps;

describe.skipIf(!SIM_DB_READY)("Simulador · Fase 7 · series temporales vs oráculo independiente", () => {
  it(
    "6 meses cash+deuda: monthly_snapshots · saldo deuda · net worth · wealthVelocity · trayectoria == oráculo",
    async () => {
      const oracle = deriveSeries();

      // ── ANTI-DEFANG · el oráculo debe ser auto-consistente ANTES de juzgar la app ──
      const selfErrs = oracleSelfCheck(oracle);
      expect(selfErrs, `ORACLE-BUG: el oráculo no es auto-consistente:\n${selfErrs.join("\n")}`).toEqual([]);
      console.log("[oráculo] serie:", oracle.map((s) => ({ nw: s.netWorth, vel: s.velocity, exp: s.expense })));

      const log = new EventLog();
      const sim = await createSimUser({ seed: 7001, currency: CURRENCY, nowStamp: Date.now(), log });
      const { ctx } = sim;
      const appNw: { netWorth: number; velocity: number | null }[] = [];
      const appDebt: number[] = [];
      try {
        const driver = new AppDriver(ctx, CURRENCY, log);

        // Setup (mes 0, día 1): apertura de liquidez + la deuda (apr 0).
        const debtId = await onMonthDay(0, 1, async () => {
          driver.day = 0;
          await driver.openingBalance(OPENING_BALANCE);
          return driver.addDebt("Préstamo", DEBT_INITIAL, DEBT_MIN_PAYMENT);
        });

        // Walk MONTHS virtual months: seed that month's income/expense/debt-payment, then at close
        // write the temporal snapshots (the REAL writers) and read the app's net worth + velocity.
        for (let m = 0; m < MONTHS; m++) {
          await onMonthDay(m, 5, async () => {
            driver.day = m * 100 + 5;
            const period = await userCurrentPeriod(ctx);
            const incId = await driver.addIncomeBudgetLine(`Salario m${m}`, INCOME[m]!, period);
            await driver.receiveIncome(incId, INCOME[m]!, virtualMonthDayISO(m, 5));
          });
          await onMonthDay(m, 10, () => driver.spend(EXPENSE[m]!, virtualMonthDayISO(m, 10), `Gasto m${m}`));
          await onMonthDay(m, 15, () => driver.payDebt(debtId, DEBT_PAYMENT, virtualMonthDayISO(m, 15)));

          await onMonthDay(m, 28, async () => {
            driver.day = m * 100 + 28;
            const period = await userCurrentPeriod(ctx);
            // GAP: the sim never called this before — it's how monthly_snapshots gets written.
            await generateMonthlySnapshot(period, ctx);
            // net_worth_snapshots (same writer the cron/screen uses); precios:"cache" → no network.
            await generateNetWorthSnapshot({ year: period.year, month: period.month }, ctx, { precios: "cache" });
            // Read the app's live net worth + velocity UNDER this month's clock (previousNetWorth = last
            // CLOSED period via `.lt`, so the row just written must NOT zero the velocity).
            const summary = await getRichLifeSummary({ precios: "cache" }, ctx);
            appNw.push({
              netWorth: summary.snapshot.indicators.netWorth,
              velocity: summary.snapshot.indicators.wealthVelocity,
            });
            const dov = (await getDebtsOverview({}, ctx)) as unknown as {
              debts: { id: string; nativeBalance: number }[];
            };
            appDebt.push(dov.debts.find((d) => d.id === debtId)?.nativeBalance ?? NaN);
          });
        }

        // ── Read the persisted series (RLS-scoped, own rows) ──
        const { data: msRows } = await ctx.db
          .from("monthly_snapshots")
          .select("period,income_monthly,expense_monthly,free_cashflow")
          .eq("user_id", ctx.userId)
          .order("period", { ascending: true });
        const { data: nwRows } = await ctx.db
          .from("net_worth_snapshots")
          .select("period,net_worth")
          .eq("user_id", ctx.userId)
          .order("period", { ascending: true });

        expect(msRows?.length, "monthly_snapshots: una fila por mes").toBe(MONTHS);
        expect(nwRows?.length, "net_worth_snapshots: una fila por mes").toBe(MONTHS);

        // ── GATE 1 · monthly_snapshots {income,expense,free_cashflow} == oráculo (±1) ──
        for (let m = 0; m < MONTHS; m++) {
          const r = msRows![m]!;
          const o = oracle[m]!;
          const ok = near(Number(r.income_monthly), o.income) && near(Number(r.expense_monthly), o.expense) && near(Number(r.free_cashflow), o.freeCashflow);
          log.check({ name: `monthly_snapshots m${m}`, ok, detail: `app{${r.income_monthly}/${r.expense_monthly}/${r.free_cashflow}} vs oráculo{${o.income}/${o.expense}/${o.freeCashflow}}` });
          expect(Number(r.income_monthly), `m${m} income`).toBeCloseTo(o.income, -1);
          expect(Number(r.expense_monthly), `m${m} expense`).toBeCloseTo(o.expense, -1);
          expect(Number(r.free_cashflow), `m${m} free_cashflow`).toBeCloseTo(o.freeCashflow, -1);
        }

        // ── GATE 2 · saldo de deuda DERIVADO baja por los pagos del script ──
        for (let m = 0; m < MONTHS; m++) {
          log.check({ name: `saldo deuda m${m}`, ok: near(appDebt[m]!, oracle[m]!.debt), detail: `app=${appDebt[m]} oráculo=${oracle[m]!.debt}` });
          expect(appDebt[m]!, `m${m} saldo deuda`).toBe(oracle[m]!.debt);
        }

        // ── GATE 3 · net worth (cash−deuda) == oráculo, persistido y en vivo ──
        for (let m = 0; m < MONTHS; m++) {
          expect(Number(nwRows![m]!.net_worth), `m${m} net_worth persistido`).toBeCloseTo(oracle[m]!.netWorth, -1);
          expect(appNw[m]!.netWorth, `m${m} net worth en vivo`).toBeCloseTo(oracle[m]!.netWorth, -1);
        }

        // ── GATE 4 · wealthVelocity = neto(m)−neto(m−1); m0 null; la fila del mes NO zerea velocity ──
        for (let m = 0; m < MONTHS; m++) {
          const o = oracle[m]!.velocity;
          const app = appNw[m]!.velocity;
          log.check({ name: `wealthVelocity m${m}`, ok: o === null ? app === null : near(app!, o), detail: `app=${app} oráculo=${o}` });
          if (o === null) expect(app, `m${m} velocity debe ser null (sin período previo)`).toBeNull();
          else {
            expect(app, `m${m} velocity no debe ser null`).not.toBeNull();
            expect(app!, `m${m} velocity (¿la fila del mes en curso zera? → lt vs lte)`).toBeCloseTo(o, -1);
          }
        }
        // Sanity: la velocity cambia de signo (variación real, no serie plana).
        const signs = new Set(appNw.slice(1).map((x) => Math.sign(x.velocity!)));
        expect(signs.has(1) && signs.has(-1), "la serie debe tener velocity + y − (variación real)").toBe(true);

        // ── GATE 5 · trayectoria: ≥3 meses definida y misma dirección; <3 undefined (no fabrica) ──
        const monthly: MonthlyPoint[] = msRows!.map((r) => ({
          period: String(r.period),
          income: Number(r.income_monthly),
          expense: Number(r.expense_monthly),
          freeCashflow: Number(r.free_cashflow),
        }));
        const traj = computeTrajectory(monthly, []);
        const otraj = oracleTrajectory(oracle);
        expect(traj, "trayectoria ≥3 meses debe estar definida").toBeDefined();
        log.check({ name: "trayectoria dir", ok: traj?.savingsRate?.dir === otraj.savingsRateDir && traj?.expense?.dir === otraj.expenseDir, detail: `app{ahorro=${traj?.savingsRate?.dir},gasto=${traj?.expense?.dir}} vs oráculo{ahorro=${otraj.savingsRateDir},gasto=${otraj.expenseDir}}` });
        expect(traj?.savingsRate?.dir, "dir tasa de ahorro").toBe(otraj.savingsRateDir);
        expect(traj?.expense?.dir, "dir gasto").toBe(otraj.expenseDir);
        // <3 meses → undefined (el guard de Fase 8: no fabricar historia para usuarios nuevos).
        expect(computeTrajectory(monthly.slice(0, 2), []), "con <3 meses NO debe fabricar trayectoria").toBeUndefined();

        console.log(`\n===== Fase 7 · series temporales =====\n${log.format()}`);
        expect(log.failures, `gates de serie fallidos:\n${log.failures.map((f) => `- ${f.name}: ${f.detail}`).join("\n")}`).toEqual([]);
      } finally {
        await sim.teardown();
      }
    },
    180_000,
  );

  it(
    "clock-leak: getSnapshotHistory('6M') bajo reloj virtual NO se vacía lejos del now real",
    async () => {
      const log = new EventLog();
      const sim = await createSimUser({ seed: 7002, currency: CURRENCY, nowStamp: Date.now(), log });
      const { ctx } = sim;
      try {
        // Sembrar un portfolio_snapshot por mes virtual (enero..junio 2026) vía el writer real
        // (fecha = simNow bajo el reloj virtual).
        for (let m = 0; m < 6; m++) {
          await onMonthDay(m, 15, async () => {
            await generateAndSaveSnapshot(ctx.userId, 100_000 + m * 10_000, 100_000, 100_000 + m * 10_000, CURRENCY);
          });
        }
        // Leer la historia bajo el reloj virtual en JUNIO 2026: el cutoff de '6M' = dic 2025, así que
        // los 6 snapshots virtuales entran. Un leak de `new Date()` real clipearía a real-now−6M
        // (≈ feb 2026) → muchas menos filas / la más vieja recortada.
        const hist = await onMonthDay(5, 28, () => getSnapshotHistory("6M", ctx));
        const earliest = hist[0]?.date ?? "(vacía)";
        log.check({ name: "clock-leak: serie completa bajo reloj virtual", ok: hist.length === 6, detail: `filas=${hist.length} (esperado 6), más vieja=${earliest}` });
        console.log(`[clock-leak] filas=${hist.length}, fechas=${hist.map((h) => h.date).join(",")}`);
        // Verde = leak DESCARTADO (periodCutoff usa simNow). Vacía/clipeada lejos del now real = P1/P2.
        expect(hist.length, `clock-leak CONFIRMADO si <6 (getSnapshotHistory usó el reloj REAL): filas=${hist.length}`).toBe(6);
        expect(earliest, "la más vieja debe ser la fecha VIRTUAL (2026-01-15), no clipeada por el now real").toBe(virtualMonthDayISO(0, 15));
      } finally {
        await sim.teardown();
      }
    },
    120_000,
  );

  it(
    "DCA: idempotencia (único holding_id/período) · transaction_id ligado · promedio order-independent · #655",
    async () => {
      // Precios que VARÍAN por mes → el promedio ponderado es un invariante no-trivial y su
      // order-independence (Σcost/Σqty) es significativa.
      const SYMBOL = "VOO";
      const QTY0 = 10;
      const PRICE0 = 100;
      const CONTRIB = 1_000;
      const PRICES = [100, 125, 80, 200]; // 4 meses
      const oracle = dcaExpected(QTY0, PRICE0, CONTRIB, PRICES);

      const log = new EventLog();
      const sim = await createSimUser({ seed: 7003, currency: CURRENCY, nowStamp: Date.now(), log });
      const { ctx } = sim;
      try {
        const driver = new AppDriver(ctx, CURRENCY, log);
        const holdingId = await onMonthDay(0, 1, () =>
          driver.addRecurringQuotedHolding("ETF DCA", SYMBOL, QTY0, PRICE0, CONTRIB),
        );

        for (let m = 0; m < PRICES.length; m++) {
          await onMonthDay(m, 20, async () => {
            seedPrice("etf", SYMBOL, PRICES[m]!, CURRENCY); // determinista, cache-first, sin red
            await ensureMonthlyContributions(ctx);
            // IDEMPOTENCIA: una segunda pasada en el MISMO período no debe crear otro aporte.
            if (m === 0) await ensureMonthlyContributions(ctx);
          });
        }

        const { data: contribs } = await ctx.db
          .from("holding_contributions")
          .select("period_year, period_month, unit_price, transaction_id, status, amount")
          .eq("user_id", ctx.userId)
          .eq("holding_id", holdingId);
        const { data: holding } = await ctx.db
          .from("investment_holdings")
          .select("quantity, average_cost")
          .eq("id", holdingId)
          .maybeSingle();
        const { data: itx } = await ctx.db
          .from("investment_transactions")
          .select("id")
          .eq("user_id", ctx.userId)
          .eq("holding_id", holdingId);

        const rows = contribs ?? [];
        const periods = new Set(rows.map((r) => `${r.period_year}-${r.period_month}`));

        // GATE · idempotencia: exactamente 1 aporte por período, aun con doble pasada en m0.
        log.check({ name: "DCA idempotencia (1 por período)", ok: rows.length === PRICES.length && periods.size === PRICES.length, detail: `filas=${rows.length} períodos=${periods.size} esperado=${PRICES.length}` });
        expect(rows.length, "un aporte por período (doble pasada no duplica)").toBe(PRICES.length);
        expect(periods.size).toBe(PRICES.length);

        // GATE · cada aporte con transaction_id ligado.
        const linked = rows.every((r) => r.transaction_id !== null);
        log.check({ name: "DCA transaction_id ligado en cada aporte", ok: linked, detail: `conTxn=${rows.filter((r) => r.transaction_id).length}/${rows.length}` });
        expect(linked, "cada aporte DCA debe referenciar su transacción de gasto").toBe(true);

        // GATE · promedio order-independent: average == Σcost/Σqty (independiente del orden de precios).
        const appAvg = Number(holding?.average_cost);
        const appQty = Number(holding?.quantity);
        log.check({ name: "DCA promedio order-independent (Σcost/Σqty)", ok: Math.abs(appAvg - oracle.average) <= 0.01 && Math.abs(appQty - oracle.quantity) <= 0.001, detail: `app{qty=${appQty},avg=${appAvg}} vs oráculo{qty=${oracle.quantity},avg=${oracle.average.toFixed(4)}}` });
        expect(appQty, "quantity acumulada = qty0 + Σ(aporte/precio)").toBeCloseTo(oracle.quantity, 3);
        expect(appAvg, "promedio ponderado = Σcost/Σqty (order-independent)").toBeCloseTo(oracle.average, 2);

        // GATE · #655 CARACTERIZADO (observar, NO arreglar): el auto-DCA escribe holding_contributions
        // pero NO investment_transactions (solo la compra inicial deja 1 fila).
        const itxCount = (itx ?? []).length;
        log.check({ name: "DCA #655 caracterizado: auto-DCA no escribe investment_transactions", ok: itxCount === 1 && rows.length === PRICES.length, detail: `investment_transactions=${itxCount} (esperado 1=inicial) · holding_contributions=${rows.length} aportes invisibles en historial` });
        expect(itxCount, "#655: solo la compra INICIAL en investment_transactions (auto-DCA no)").toBe(1);

        console.log(`\n===== Fase 7 · DCA =====\n${log.format()}`);
        expect(log.failures, `gates DCA fallidos:\n${log.failures.map((f) => `- ${f.name}: ${f.detail}`).join("\n")}`).toEqual([]);
      } finally {
        await sim.teardown();
      }
    },
    120_000,
  );
});

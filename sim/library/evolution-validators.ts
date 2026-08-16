/**
 * F3a evolution validators — validate the sim's EVOLUTION across months, using
 * the app's OWN time-series: net_worth_snapshots (written each month by the real
 * ctx-aware writer) drive wealthVelocity, and getHomeCardsData's "vs mes" chips
 * are reconciled against the month's tracked deltas.
 *
 * portfolio_snapshots / monthly_snapshots / DCA are DEFERRED to F3a-DCA (they need
 * an app ctx-seam or a service-role writer), so `inversiones vs-mes` is not checked
 * here.
 */
import type { AuthContext } from "@/lib/auth/auth-context";
import type { Period } from "@/modules/financial-base/types";
import { getRichLifeSummary } from "@/modules/rich-life/services/rich-life-service";
import { getControlSummary } from "@/modules/control/services/control-service";
import { getHomeCardsData } from "@/modules/dashboard/services/home-cards-service";
import type { EventLog } from "../event-log";

const round2 = (n: number): number => Math.round(n * 100) / 100;
const approx = (a: number, b: number, eps: number): boolean => Math.abs(a - b) <= eps;

function push(log: EventLog, name: string, ok: boolean, detail: string): void {
  log.check({ name, ok, detail });
}

/** Signed net amount from a vs-mes chip: magnitude lives in `value`, sign in `dir`. */
function signedChip(chip: { dir: string; value: number } | null | undefined): number {
  if (!chip) return 0;
  return chip.dir === "up" ? chip.value : chip.dir === "down" ? -chip.value : 0;
}

export interface EvolutionInputs {
  monthIndex: number;
  /** Net worth at the previous month's close; null for month 0. */
  prevNetWorth: number | null;
  /** Goal net this month: contributions − withdrawals − off-budget consumption. */
  goalNet: number;
  /** Debt paid this month. */
  debtPaid: number;
  hasGoal: boolean;
  hasDebt: boolean;
}

/** Error message extractor — surfaces read failures loudly instead of silently. */
function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Runs the evolution checks for one month close and RETURNS the current net worth
 * (the runner carries it as `prevNetWorth` for the next month). Assumes the
 * month's net_worth_snapshot has already been written.
 *
 * Robustness: the trajectory reads (getRichLifeSummary + the snapshot query — the
 * same reliable reads the core net-worth check uses) and the vs-mes reads
 * (getHomeCardsData, first exercised here) live in SEPARATE try/catch blocks. Any
 * read that throws becomes a VISIBLE failing check with the error — the evolution
 * checks can never silently vanish, and one block's failure can't hide the other.
 */
export async function validateEvolution(
  ctx: AuthContext,
  period: Period,
  inp: EvolutionInputs,
  log: EventLog,
): Promise<number> {
  let nw = inp.prevNetWorth ?? 0;
  let wv: number | null = null;

  // --- Trajectory + snapshot series (reliable reads: same as the core check) ---
  try {
    const rl = await getRichLifeSummary({ precios: "cache" }, ctx);
    nw = rl.snapshot.indicators.netWorth;
    wv = rl.snapshot.indicators.wealthVelocity;

    const { data: snaps, error } = await ctx.db
      .from("net_worth_snapshots")
      .select("period")
      .eq("user_id", ctx.userId)
      .order("period", { ascending: true });
    if (error) throw new Error(`net_worth_snapshots: ${error.message}`);
    const rows = snaps ?? [];
    push(
      log,
      "evolución · un snapshot de patrimonio por mes (serie no congelada)",
      rows.length === inp.monthIndex + 1,
      `filas=${rows.length} esperado=${inp.monthIndex + 1} periodos=[${rows.map((r) => r.period).join(", ")}]`,
    );

    // Trajectory: the app's wealthVelocity must equal the real month-over-month
    // change (netWorth(m) − netWorth(m−1)); null on month 0 (no prior snapshot).
    if (inp.monthIndex >= 1 && inp.prevNetWorth !== null) {
      push(
        log,
        "evolución · velocidad patrimonial = neto(m) − neto(m−1)",
        wv !== null && approx(wv, nw - inp.prevNetWorth, 1),
        `wv=${wv === null ? "null" : round2(wv)} Δreal=${round2(nw - inp.prevNetWorth)}`,
      );
    }
  } catch (e) {
    push(log, "evolución · trayectoria (la lectura lanzó)", false, msg(e));
  }

  // --- vs-mes chips (getHomeCardsData is first exercised here in the sim) ---
  try {
    const home = await getHomeCardsData(ctx);

    // Ahorros vs-mes: signed net = aportes − retiros − consumos del mes.
    if (inp.hasGoal) {
      const chipNet = signedChip(home.ahorros?.vsMes);
      push(
        log,
        "evolución · vs-mes ahorros = aportes − retiros − consumos del mes",
        approx(chipNet, inp.goalNet, 1),
        `chip=${round2(chipNet)} esperado=${round2(inp.goalNet)}`,
      );
    }

    // Deudas vs-mes: signed netChange = adquirido − pagado. `adquirido` filtra por la
    // fecha de ALTA real de la deuda (created_at de BD, NO el reloj virtual), así que
    // se computa desde los datos reales, no se asume 0.
    if (inp.hasDebt) {
      const ctrl = await getControlSummary(ctx);
      const adquirido = ctrl.debts
        .filter(
          (d) =>
            d.createdAt &&
            d.createdAt.slice(0, 10) >= period.from &&
            d.createdAt.slice(0, 10) <= period.to,
        )
        .reduce((s, d) => s + (d.originalAmount ?? d.balance), 0);
      const expected = adquirido - inp.debtPaid;
      const chipNet = signedChip(home.deudas?.vsMes);
      push(
        log,
        "evolución · vs-mes deudas = adquirido − pagado del mes",
        approx(chipNet, expected, 1),
        `chip=${round2(chipNet)} esperado=${round2(expected)} (adquirido=${round2(adquirido)} pagado=${round2(inp.debtPaid)})`,
      );
    }

    // Patrimonio vs-mes: render de wealthVelocity → su dirección coincide con el signo.
    if (inp.monthIndex >= 1 && wv !== null && Math.abs(wv) > 0.5) {
      const chip = home.patrimonio?.vsMes ?? null;
      const ok = chip !== null && (wv > 0 ? chip.dir === "up" : chip.dir === "down");
      push(
        log,
        "evolución · vs-mes patrimonio coherente con la velocidad",
        ok,
        `dir=${chip?.dir ?? "null"} wv=${round2(wv)}`,
      );
    }
  } catch (e) {
    push(log, "evolución · vs-mes (la lectura lanzó)", false, msg(e));
  }

  return nw;
}

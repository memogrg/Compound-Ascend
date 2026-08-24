/**
 * Fase 3 · UNIVERSAL sanity gates — hold for ANY persona (not bespoke). Two layers:
 *   - `evaluateGates(inputs, fx)`: PURE — takes the numbers, returns findings. Unit-tested by the
 *     anti-defang suite (gates.antidefang.test.ts) so a recalibration can never silently defang them.
 *   - `runGates(ctx, fx)`: reads the app's own services → builds the inputs → `evaluateGates`.
 *
 * Mirrors the accounting identities of sim/validators.ts `validateNetWorth`, but reads the numbers so
 * it can (a) sweep every metric for NaN/Inf and (b) use a RELATIVE tolerance for FX personas (USD→CRC
 * rounds) while still catching a raw/1:1 coercion (off by ~510×). Calibrated to the app's REAL
 * contract (rich-life-engine.ts): `assetLiabilityRatio=Infinity` for no-debt is an intentional
 * sentinel (excluded from the finite-sweep); `debtToAssets` is uncapped (>1 for over-indebted, not
 * gated to [0,1]).
 */
import type { AuthContext } from "@/lib/auth/auth-context";
import { getRichLifeSummary } from "@/modules/rich-life/services/rich-life-service";
import { getLiquidityBalance } from "@/modules/financial-base/services/liquidity-service";
import { getControlSummary } from "@/modules/control/services/control-service";
import { getDebtsOverview } from "@/modules/control/services/debts-service";
import { getPortfolioReport } from "@/modules/wealth/services/portfolio-service";

export interface Finding {
  gate: string;
  severity: "P0" | "P1";
  detail: string;
}

/** The numbers the gates judge — read from the app's services (runGates) or injected (anti-defang). */
export interface GateInputs {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  debtToAssets: number;
  productiveAssetsPct: number;
  liquidAssetsPct: number;
  depreciablePct: number;
  passiveIncomeCoverage: number;
  financialFreedomIndex: number;
  monthsOfIndependence: number;
  wealthVelocity: number | null;
  liquidity: number;
  portfolioValue: number;
  goals: number[]; // currentAmount per goal
  debts: number[]; // balance per debt
}

const isFin = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/** PURE gate logic (G2–G5). No IO — the anti-defang suite feeds it injected NaN / broken identity. */
export function evaluateGates(m: GateInputs, fx: boolean): Finding[] {
  const f: Finding[] = [];
  const goalsTotal = m.goals.reduce((s, g) => s + Math.max(0, g), 0);
  const debtsTotal = m.debts.reduce((s, d) => s + Math.max(0, d), 0);

  // ── G2 · no NaN/Inf on metrics that MUST be finite. `assetLiabilityRatio` is EXCLUDED by design
  // (Infinity is an intentional no-debt sentinel, rich-life-engine.ts:77-82); a NaN there still
  // surfaces via totalAssets/totalLiabilities, which ARE swept. ──
  const sweep: Record<string, unknown> = {
    netWorth: m.netWorth,
    totalAssets: m.totalAssets,
    totalLiabilities: m.totalLiabilities,
    debtToAssets: m.debtToAssets,
    productiveAssetsPct: m.productiveAssetsPct,
    liquidAssetsPct: m.liquidAssetsPct,
    depreciablePct: m.depreciablePct,
    passiveIncomeCoverage: m.passiveIncomeCoverage,
    financialFreedomIndex: m.financialFreedomIndex,
    monthsOfIndependence: m.monthsOfIndependence,
    liquidity: m.liquidity,
    portfolioValue: m.portfolioValue,
    debtsTotal,
    goalsTotal,
  };
  for (const [k, v] of Object.entries(sweep)) {
    if (!isFin(v)) f.push({ gate: "G2 no NaN/Inf", severity: "P1", detail: `${k}=${String(v)}` });
  }
  if (m.wealthVelocity !== null && !isFin(m.wealthVelocity)) {
    f.push({ gate: "G2 no NaN/Inf", severity: "P1", detail: `wealthVelocity=${String(m.wealthVelocity)}` });
  }

  // ── G3 · identidades contables (mirror validateNetWorth). FX → tolerancia RELATIVA. ──
  const tol = (b: number): number => (fx ? Math.max(2, Math.abs(b) * 0.005) : 1);
  const bad = (a: number, b: number): boolean => Math.abs(a - b) > tol(b);
  if (isFin(m.netWorth) && isFin(m.totalAssets) && isFin(m.totalLiabilities) && bad(m.netWorth, m.totalAssets - m.totalLiabilities)) {
    f.push({ gate: "G3 neto=activos−pasivos", severity: "P0", detail: `neto=${m.netWorth} activos−pasivos=${m.totalAssets - m.totalLiabilities}` });
  }
  if (isFin(m.totalLiabilities) && bad(m.totalLiabilities, debtsTotal)) {
    f.push({ gate: "G3 pasivos=Σdeudas", severity: "P0", detail: `pasivos=${m.totalLiabilities} Σdeudas=${debtsTotal}` });
  }
  const composed = m.liquidity + goalsTotal + m.portfolioValue - debtsTotal;
  if (isFin(m.netWorth) && isFin(composed) && bad(m.netWorth, composed)) {
    f.push({ gate: "G3 composición=liquidez+metas+inversiones−deudas", severity: "P0", detail: `neto=${m.netWorth} composición=${composed} (liq=${m.liquidity} metas=${goalsTotal} inv=${m.portfolioValue} deudas=${debtsTotal})` });
  }

  // ── G4 · saldos ≥ 0 donde corresponde (liquidez y net worth PUEDEN ser negativos → no gateados) ──
  for (const d of m.debts) if (isFin(d) && d < -1) f.push({ gate: "G4 saldo deuda ≥0", severity: "P1", detail: `deuda saldo=${d} (sobrepago a negativo)` });
  for (const g of m.goals) if (isFin(g) && g < -1) f.push({ gate: "G4 meta ≥0", severity: "P1", detail: `meta current=${g}` });
  if (isFin(m.portfolioValue) && m.portfolioValue < -1) f.push({ gate: "G4 portafolio ≥0", severity: "P1", detail: `portfolioValue=${m.portfolioValue}` });

  // ── G5 · fracciones de activos ∈ [0,1] plausibles + finitas. `debtToAssets` NO se gatea a [0,1]:
  // la app lo devuelve sin cap (rich-life-engine.ts:83), >1 legítimo para sobreendeudados. ──
  const band01: Record<string, number> = {
    productiveAssetsPct: m.productiveAssetsPct,
    liquidAssetsPct: m.liquidAssetsPct,
    depreciablePct: m.depreciablePct,
  };
  for (const [k, v] of Object.entries(band01)) {
    if (isFin(v) && (v < -0.001 || v > 1.001)) f.push({ gate: "G5 fracción de activos [0,1]", severity: "P1", detail: `${k}=${v}` });
  }
  return f;
}

/** Read the app's own services, build the inputs, and run the pure gates. FX → relative tolerance. */
export async function runGates(ctx: AuthContext, fx: boolean): Promise<Finding[]> {
  const [rl, liq, ctrl, debtsOv, port] = await Promise.all([
    getRichLifeSummary({ precios: "cache" }, ctx),
    getLiquidityBalance(ctx),
    getControlSummary(ctx),
    getDebtsOverview({}, ctx),
    getPortfolioReport(ctx),
  ]);
  const ind = rl.snapshot.indicators;
  return evaluateGates(
    {
      netWorth: ind.netWorth,
      totalAssets: ind.totalAssets,
      totalLiabilities: ind.totalLiabilities,
      debtToAssets: ind.debtToAssets,
      productiveAssetsPct: ind.productiveAssetsPct,
      liquidAssetsPct: ind.liquidAssetsPct,
      depreciablePct: ind.depreciablePct,
      passiveIncomeCoverage: ind.passiveIncomeCoverage,
      financialFreedomIndex: ind.financialFreedomIndex,
      monthsOfIndependence: ind.monthsOfIndependence,
      wealthVelocity: ind.wealthVelocity,
      liquidity: liq.balance,
      portfolioValue: port.analytics.totalPortfolioValue,
      goals: ctrl.goals.map((g) => g.currentAmount),
      debts: debtsOv.debts.map((d) => d.balance),
    },
    fx,
  );
}

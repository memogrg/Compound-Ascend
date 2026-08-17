/**
 * DCA persona (F3a-DCA): a saver with a QUOTED, RECURRING holding (etf) that the
 * app auto-contributes to each month via ensureMonthlyContributions. Its own spec
 * type (not the F2 PersonaSpec) — the DCA flow is specialized. The mocked price is
 * fixed per run so the merge is deterministic; monthlyContribution == mockPrice so
 * each contribution buys exactly one unit.
 */
import { createPrng } from "../../prng";
import type { AssetType } from "@/lib/market-data";

export interface DcaPersonaSpec {
  key: string;
  seed: number;
  openingBalance: number;
  monthlyIncome: number;
  /** Day of month the salary lands (1–28). */
  payDay: number;
  symbol: string;
  marketType: AssetType;
  /** Deterministic mocked unit price (holding currency). */
  mockPrice: number;
  initialQuantity: number;
  monthlyContribution: number;
  incomeSourceName: string;
  incomeBudgetName: string;
  holdingLabel: string;
}

export function buildInversionistaDca(seed: number): DcaPersonaSpec {
  const rng = createPrng(seed);
  const mockPrice = rng.amount(40_000, 80_000, 10_000); // precio fijo de la "unidad"
  return {
    key: "inversionista-dca",
    seed,
    openingBalance: rng.amount(400_000, 600_000, 50_000),
    monthlyIncome: rng.amount(800_000, 1_000_000, 50_000),
    payDay: 4,
    symbol: "VWRA",
    marketType: "etf",
    mockPrice,
    initialQuantity: rng.amount(5, 15, 1),
    monthlyContribution: mockPrice, // 1 unidad/mes → merge exacto
    incomeSourceName: "Salario",
    incomeBudgetName: "Salario mensual",
    holdingLabel: "ETF global",
  };
}

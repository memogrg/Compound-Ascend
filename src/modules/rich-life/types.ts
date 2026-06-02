/** Tipos del Módulo 5 — Mi Rich Life. */

export type AssetClass = "liquido" | "inversion" | "productivo" | "uso_personal" | "especial";
export type LiabilityClass = "consumo" | "patrimonial" | "productivo" | "critico";

export type Asset = {
  id: string;
  name: string;
  assetClass: AssetClass;
  value: number;
  currency: string;
  generatesIncome: boolean;
  liquidity?: "alta" | "media" | "baja" | null;
};

export type Liability = {
  id: string;
  name: string;
  liabilityClass: LiabilityClass;
  balance: number;
  currency: string;
};

export type RichTrend = "mas_rico" | "estable" | "mas_pobre" | "sin_historico";

export type RichLifeInput = {
  assets: Asset[];
  liabilities: Liability[];
  passiveIncomeMonthly: number;
  monthlyExpenses: number;
  freeCashflow: number;
  protectionScore: number; // 0-100
  diversification: "baja" | "media" | "alta";
  /** Snapshot del mes anterior, si existe, para tendencia/velocidad. */
  previous?: { netWorth: number } | null;
  currency: string;
};

export type RichLifeIndicators = {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  assetLiabilityRatio: number;
  debtToAssets: number; // 0-1
  productiveAssetsPct: number; // 0-1
  liquidAssetsPct: number; // 0-1
  depreciablePct: number; // 0-1
  passiveIncomeCoverage: number; // 0-1 (ingreso pasivo / gastos)
  financialFreedomIndex: number; // 0-1+
  monthsOfIndependence: number;
  wealthVelocity: number | null; // Δ patrimonio neto mensual
  trend: RichTrend;
};

export type RichLifeScoreDim = { label: string; weight: number; score: number };

export type RichLifeScore = {
  score: number; // 0-100
  state: string;
  dims: RichLifeScoreDim[];
};

export type RichLifeSnapshot = {
  indicators: RichLifeIndicators;
  score: RichLifeScore;
  reading: string;
  nextBestAction: string;
  assetsByClass: { label: string; value: number; color: string }[];
  liabilitiesByClass: { label: string; value: number; color: string }[];
};

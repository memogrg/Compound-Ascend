/** Tipos del Módulo 4 — Patrimonio (Crecimiento + Protección). */

export type AssetType =
  | "etf"
  | "accion"
  | "bono"
  | "fondo"
  | "certificado"
  | "inmueble"
  | "cripto"
  | "negocio"
  | "pension"
  | "commodity"
  | "arte"
  | "nft"
  | "otro";

export type Investment = {
  id: string;
  assetType: AssetType;
  name: string;
  symbol?: string | null;
  investedAmount: number;
  contribution: number;
  currency: string;
  horizon?: string | null;
  perceivedRisk?: "bajo" | "medio" | "alto" | "no_se" | null;
  liquidity?: "rapida" | "penalidad" | "largo_plazo" | "no_se" | null;
};

export type PolicyType =
  | "medico"
  | "vida"
  | "incapacidad"
  | "hogar"
  | "vehiculo"
  | "patrimonial"
  | "empresarial"
  | "familiar"
  | "otro";

export type InsurancePolicy = {
  id: string;
  policyType: PolicyType;
  provider?: string | null;
  coverage?: number | null;
  premium?: number | null;
  premiumFrequency?: string | null;
  renewalDate?: string | null;
  currency: string;
};

export type ReadinessState =
  | "no_listo"
  | "empezar_pequeno"
  | "constante"
  | "diversificar"
  | "optimizar";

export type InvestmentReadiness = {
  score: number;
  state: ReadinessState;
  stateLabel: string;
  semaforo: "rojo" | "amarillo" | "verde";
  message: string;
  checklist: { label: string; met: boolean }[];
};

export type ProtectionGap = {
  type: string;
  severity: "alto" | "medio" | "bajo";
  description: string;
  recommendation: string;
};

export type ProtectionDiagnosis = {
  score: number;
  gaps: ProtectionGap[];
  coverageByType: { type: PolicyType; coverage: number }[];
  totalCoverage: number;
  annualPremium: number;
  activePolicies: number;
};

export type WealthContext = {
  freeCashflow: number;
  hasEmergencyFund: boolean;
  hasCriticalDebt: boolean;
  dependents: number;
  riskClassKnown: boolean;
  currency: string;
};

export type Balance = {
  offense: number; // 0-100
  defense: number; // 0-100
  message: string;
};

export type PortfolioStats = {
  totalInvested: number;
  monthlyContribution: number;
  distribution: { label: string; value: number; color: string }[];
  diversification: "baja" | "media" | "alta";
  topConcentration: number; // 0-1
};

// ── Motor de inversiones ──────────────────────────────────────────

export type Holding = {
  id: string;
  investmentId?: string | null;
  symbol: string;
  assetType: AssetType;
  quantity: number;
  averageCost: number;
  purchaseDate?: string | null;
  broker?: string | null;
  currency: string;
  label?: string | null;
};

export type HoldingPerformance = Holding & {
  currentPrice?: number;
  currentValue: number;
  costBasis: number;
  profitLoss: number;
  returnPct: number;
};

export type Dividend = {
  id: string;
  holdingId: string;
  paymentDate: string;
  amount: number;
  currency: string;
};

export type AllocationSlice = {
  label: string;
  value: number;
  pct: number;
  color: string;
};

export type PortfolioAnalytics = {
  totalPortfolioValue: number;
  totalCostBasis: number;
  totalProfitLoss: number;
  totalReturnPct: number;
  allocation: {
    etf: AllocationSlice;
    stock: AllocationSlice;
    crypto: AllocationSlice;
    cash: AllocationSlice;
    other: AllocationSlice;
  };
  holdingsWithPerformance: HoldingPerformance[];
  growthScore: number;
};

export type DividendAnalytics = {
  monthlyDividends: number;
  annualDividends: number;
  dividendYield: number;
  yieldOnCost: number;
};

export type CryptoAnalytics = {
  currentValue: number;
  costBasis: number;
  profitLoss: number;
  allocationPct: number;
};

export type PortfolioSnapshot = {
  id: string;
  date: string;
  portfolioValue: number;
  investmentValue: number;
  netWorth: number;
  currency: string;
};

export type InvestmentInsights = {
  concentrationAnalysis: string;
  diversificationAnalysis: string;
  dividendInsights: string;
  passiveIncomeInsights: string;
  allocationInsights: string;
};

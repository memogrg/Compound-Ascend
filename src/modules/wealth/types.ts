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

/** Taxonomía de inversiones (PLAN §2.1): 2 naturalezas × 20 categorías.
 *  Fuente única de los slugs; la usan el schema (enum) y CATEGORY_META. */
export const INVESTMENT_CATEGORIES = [
  // cashflow (10)
  "cuenta_remunerada",
  "deposito_plazo",
  "bono_gobierno",
  "bono_empresa",
  "fondo_conservador",
  "prestamo_interes",
  "propiedad_alquiler",
  "reit",
  "accion_dividendo",
  "negocio_ingreso",
  // growth (10)
  "accion_crecimiento",
  "etf_crecimiento",
  "indexado_global",
  "roboadvisor",
  "propiedad_plusvalia",
  "proyecto_inmobiliario",
  "startup",
  "compra_negocio",
  "cripto",
  "alternativo",
  "plan_inversion",
] as const;

export type InvestmentCategory = (typeof INVESTMENT_CATEGORIES)[number];
export type InvestmentNature = "cashflow" | "growth";

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
  | "gastos_mayores"
  | "gastos_menores"
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

export type RentalFrequency =
  | "semanal"
  | "mensual"
  | "trimestral"
  | "semestral"
  | "anual"
  | "al_vencimiento";
export type RentalSubtype = "alquiler" | "airbnb" | "auto" | "negocio" | "otro";

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
  // ── Activos de renta / no cotizados (migración 0018) ──
  /** Valor actual puesto a mano (no cotizados: inmueble, negocio, otro). */
  currentValueManual?: number | null;
  /** Renta recurrente que genera el activo (proyección informativa). */
  rentalIncome?: number | null;
  rentalFrequency?: RentalFrequency | null;
  /** % rendimiento anual (renta fija: bono/CDP); informativo + cálculo del pago. */
  annualRatePct?: number | null;
  /** Fecha de vencimiento (renta fija de pago único: al_vencimiento). */
  maturityDate?: string | null;
  /** Plazo del plan a plazo (unit-linked) en años; deriva maturityDate (migración 20260712000001). */
  termYears?: number | null;
  rentalSubtype?: RentalSubtype | null;
  // ── Inmueble de renta: costos operativos para ROI (migración 20260628000002) ──
  purchasePrice?: number | null;
  closingCosts?: number | null;
  vacancyPct?: number | null; // 0-1
  mgmtPct?: number | null; // 0-1
  maintenanceMonthly?: number | null;
  hoaMonthly?: number | null;
  propertyTaxAnnual?: number | null;
  insuranceAnnual?: number | null;
  servicesMonthly?: number | null;
  /** Deuda que financia el inmueble (migración 20260629000001 · C-1b). */
  debtId?: string | null;
  /** Stub por completar (creado desde un ingreso pasivo · Fase 3). */
  needsDetail?: boolean;
  // ── Taxonomía de inversiones (migración 20260617000001) ──
  /** Naturaleza: 'cashflow' (genera ingreso) | 'growth' (plusvalía). */
  nature?: InvestmentNature | null;
  /** Categoría (uno de los 20 slugs). */
  category?: InvestmentCategory | null;
  /** Mes (1-12) de materialización del flujo de caja no recurrente. */
  incomeMonth?: number | null;
  /** Concentración geográfica (us|cr|eu|latam|global|otro; NULL = sin definir). */
  region?: string | null;
  /** Si el aporte mensual es real (recurrente). */
  isRecurring?: boolean;
  /** Aporte mensual del recurrente, separado del total invertido (migración 20260623000001). */
  monthlyContribution?: number | null;
};

/** Evento de renta recibida (fuente: tabla rental_payments). */
export type RentalPayment = {
  id: string;
  holdingId: string;
  receivedOn: string;
  amount: number;
  currency: string;
  frequency?: string | null;
  incomeId?: string | null;
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
  yieldPct?: number | null;
  frequency?: string | null;
  incomeId?: string | null;
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

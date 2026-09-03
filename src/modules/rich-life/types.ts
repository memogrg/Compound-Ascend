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

/**
 * Veredicto patrimonial. `en_curso` = hay histórico pero el mes todavía no cierra, así
 * que NO se puede decir "más rico" ni "más pobre" todavía; `sin_historico` = no hay con
 * qué comparar. Son cosas distintas y la UI las pinta distinto.
 */
export type RichTrend = "mas_rico" | "estable" | "mas_pobre" | "en_curso" | "sin_historico";

export type RichLifeInput = {
  assets: Asset[];
  liabilities: Liability[];
  passiveIncomeMonthly: number;
  /** Lista base `expense_items`. OPCIONAL para el usuario → puede ser 0; no la uses
   *  sola de denominador (ver `monthlyCommitment` y `gastoDeReferencia`). */
  monthlyExpenses: number;
  /** Compromiso mensual TOTAL (sobres + metas + DCA + deudas + primas). Manda sobre
   *  `monthlyExpenses` como denominador. null si no se pudo leer. */
  monthlyCommitment?: number | null;
  freeCashflow: number;
  protectionScore: number; // 0-100
  diversification: "baja" | "media" | "alta";
  /** Cierre del ÚLTIMO mes cerrado, si existe. Contra él se mide `wealthVelocity`.
   *  Ojo: el neto de arriba es de HOY, así que ese Δ es de un mes A MEDIAS. */
  previous?: { netWorth: number } | null;
  /** Δ del patrimonio neto entre los DOS últimos meses cerrados y CONSECUTIVOS. Es el
   *  único Δ que compara periodos completos, así que de acá —y sólo de acá— sale el
   *  veredicto "más rico / más pobre". null = todavía no hay dos cierres seguidos. */
  closedWealthDelta?: number | null;
  currency: string;
};

export type RichLifeIndicators = {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  assetLiabilityRatio: number | null; // null = sin deudas (ratio infinito)
  debtToAssets: number; // 0..∞ (>1 = sobreendeudado; sin cap a propósito)
  productiveAssetsPct: number; // 0-1
  liquidAssetsPct: number; // 0-1
  depreciablePct: number; // 0-1
  passiveIncomeCoverage: number; // 0-1 (ingreso pasivo / gastos)
  financialFreedomIndex: number; // 0-1+
  monthsOfIndependence: number;
  wealthVelocity: number | null; // Δ patrimonio neto contra el último cierre
  /** true = `wealthVelocity` es "en lo que va del mes", no un mes completo. La UI tiene
   *  que rotularlo así: el 2 de septiembre son dos días de movimiento, no un mes. */
  velocityIsPartial: boolean;
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

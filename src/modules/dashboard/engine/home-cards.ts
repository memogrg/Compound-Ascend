/**
 * Capa de datos del CARRUSEL del home /m Inicio (piloto · Delta 1) — motor puro.
 *
 * Un objeto tipado por cada una de las 9 fichas del brief lockeado
 * (rediseno-movil/PILOTO-Inicio-Carrusel-BriefVisual.md), ensamblado desde los
 * reports que YA existen (ver artifacts/auditoria/PILOTO-datos.md). SIN UI: sólo
 * los tipos + los selectores puros que mapean report→ficha. La orquestación
 * (fetch best-effort) vive en services/home-cards-service.ts.
 *
 * Regla del brief: el "vs mes anterior" es OPCIONAL (`vsMes`/`delta`); su cálculo
 * es el Delta 3. Aquí queda `null` para degradar sin flecha.
 */
import {
  unbudgetedExpenseShare,
  type MonthFlow,
  type KeyedValue,
} from "@/modules/financial-base";
import {
  aggregateHoldingsByNature,
  buildBaseProtectionChecklist,
  type NatureBreakdown,
  type NatureInput,
  type ProtectionChecklistItem,
  type ProtectionDiagnosis,
  type PortfolioAnalytics,
  type PatrimonioReport,
  type Hito,
} from "@/modules/wealth";
import {
  rankSavingsGoalsByLag,
  simulateStrategy,
  type GoalLag,
  type GoalLagInput,
  type DebtMethod,
} from "@/modules/control";
import type { RichTrend } from "@/modules/rich-life";

/** Signo semántico para colorear (verde/pos, rojo/neg, gris/neutral). */
export type Tone = "pos" | "neg" | "neutral";

/** Comparación vs mes anterior. `null` = sin dato → la UI degrada sin flecha. */
export type VsMes = { deltaPct: number; tone: Tone } | null;

// ---------------------------------------------------------------------------
// 1 · Presupuesto — flujo real + plan/gap + % sin presupuesto + barras plan·real
// ---------------------------------------------------------------------------
export type PresupuestoCard = {
  key: "presupuesto";
  href: string;
  flujoReal: number;
  flujoTone: Tone;
  plan: { income: number; expense: number; free: number };
  gap: number; // real − plan
  pctSinPresupuesto: number; // 0-1
  barras: { ingreso: { plan: number; real: number }; gasto: { plan: number; real: number } };
  vsMes: VsMes;
};

export function selectPresupuesto(mf: MonthFlow, real: KeyedValue, budget: KeyedValue): PresupuestoCard {
  const flujoReal = mf.real.operatingFlow;
  const cov = unbudgetedExpenseShare(real, budget);
  return {
    key: "presupuesto",
    href: "/m/gastos",
    flujoReal,
    flujoTone: toneOf(flujoReal),
    plan: mf.plan,
    gap: round2(flujoReal - mf.plan.free),
    pctSinPresupuesto: cov.pct,
    barras: {
      ingreso: { plan: mf.plan.income, real: mf.real.operatingIncome },
      gasto: { plan: mf.plan.expense, real: mf.real.operatingExpense },
    },
    vsMes: null,
  };
}

// ---------------------------------------------------------------------------
// 2 · Ingresos — real + % del plan + dona activo/pasivo
// ---------------------------------------------------------------------------
export type IngresosCard = {
  key: "ingresos";
  href: string;
  real: number;
  plan: number;
  pctDelPlan: number; // 0-1+
  activo: number;
  pasivo: number;
  vsMes: VsMes;
};

export function selectIngresos(
  mf: MonthFlow,
  incomeByType: { activo: number; pasivo: number; extraordinario: number },
): IngresosCard {
  const real = mf.real.operatingIncome;
  return {
    key: "ingresos",
    href: "/m/ingresos",
    real,
    plan: mf.plan.income,
    pctDelPlan: mf.plan.income > 0 ? round2(real / mf.plan.income) : 0,
    // "Activo" agrupa activo + extraordinario (ambos dependen de tu trabajo); pasivo aparte.
    activo: round2(incomeByType.activo + incomeByType.extraordinario),
    pasivo: round2(incomeByType.pasivo),
    vsMes: null,
  };
}

// ---------------------------------------------------------------------------
// 3 · Gastos — real + % del plan + % sin presupuesto + ranking top sobres
// ---------------------------------------------------------------------------
export type GastosCard = {
  key: "gastos";
  href: string;
  real: number;
  plan: number;
  pctDelPlan: number;
  pctSinPresupuesto: number;
  topSobres: { label: string; value: number }[];
  vsMes: VsMes;
};

export function selectGastos(
  mf: MonthFlow,
  real: Record<string, { label: string; value: number }>,
  budget: KeyedValue,
  topN = 4,
): GastosCard {
  const cov = unbudgetedExpenseShare(real, budget);
  const topSobres = Object.values(real)
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, topN)
    .map((s) => ({ label: s.label, value: round2(s.value) }));
  return {
    key: "gastos",
    href: "/m/gastos",
    real: mf.real.operatingExpense,
    plan: mf.plan.expense,
    pctDelPlan: mf.plan.expense > 0 ? round2(mf.real.operatingExpense / mf.plan.expense) : 0,
    pctSinPresupuesto: cov.pct,
    topSobres,
    vsMes: null,
  };
}

// ---------------------------------------------------------------------------
// 4 · Ahorros — ahorrado/meta/falta + medidor + # metas + aporte + rezagadas
// ---------------------------------------------------------------------------
export type AhorrosCard = {
  key: "ahorros";
  href: string;
  ahorrado: number;
  meta: number;
  falta: number;
  pct: number; // medidor 0-1
  numMetas: number;
  aporteMensual: number;
  rezagadas: GoalLag[];
  vsMes: VsMes;
};

export function selectAhorros(
  goals: (GoalLagInput & { monthlyContribution: number })[],
): AhorrosCard {
  const metas = goals.filter((g) => g.targetAmount > 0);
  const ahorrado = sum(metas.map((g) => g.currentAmount));
  const meta = sum(metas.map((g) => g.targetAmount));
  const aporteMensual = sum(metas.map((g) => g.monthlyContribution));
  return {
    key: "ahorros",
    href: "/m/metas",
    ahorrado: round2(ahorrado),
    meta: round2(meta),
    falta: Math.max(0, round2(meta - ahorrado)),
    pct: meta > 0 ? Math.min(1, round2(ahorrado / meta)) : 0,
    numMetas: metas.length,
    aporteMensual: round2(aporteMensual),
    rezagadas: rankSavingsGoalsByLag(metas, 3),
    vsMes: null,
  };
}

// ---------------------------------------------------------------------------
// 5 · Deudas — total + # + método + proyección de cierre (↓ vs mes = verde)
// ---------------------------------------------------------------------------
export type DeudasCard = {
  key: "deudas";
  href: string;
  total: number;
  numDeudas: number;
  metodo: DebtMethod | null;
  /** Meses hasta quedar libre (simulación); null si no es factible con los mínimos. */
  mesesACierre: number | null;
  vsMes: VsMes; // ↓ = verde (bajar deuda es bueno)
};

export function selectDeudas(
  debts: { id: string; name: string; balance: number; apr: number; minPayment: number }[],
  method: DebtMethod | null,
  extra: number,
): DeudasCard {
  const active = debts.filter((d) => d.balance > 0);
  const total = sum(active.map((d) => d.balance));
  let mesesACierre: number | null = null;
  if (active.length > 0 && method) {
    const sim = simulateStrategy(active, method, Math.max(0, extra));
    mesesACierre = sim.feasible ? sim.months : null;
  }
  return {
    key: "deudas",
    href: "/m/deudas",
    total: round2(total),
    numDeudas: active.length,
    metodo: method,
    mesesACierre,
    vsMes: null,
  };
}

// ---------------------------------------------------------------------------
// 6 · Inversiones — valor/invertido/P&L + dona naturaleza + # activos
// ---------------------------------------------------------------------------
export type InversionesCard = {
  key: "inversiones";
  href: string;
  valorActual: number;
  invertido: number;
  ganancia: number;
  gananciaPct: number;
  gananciaTone: Tone;
  numActivos: number;
  naturaleza: NatureBreakdown; // largo plazo (growth) vs flujo de caja (cashflow)
  /** Aporte/retiro del mes (Delta 3): capital de holdings. */
  aporteRetiroMes: VsMes;
};

export function selectInversiones(analytics: PortfolioAnalytics, natureItems: NatureInput[]): InversionesCard {
  return {
    key: "inversiones",
    href: "/m/inversiones",
    valorActual: round2(analytics.totalPortfolioValue),
    invertido: round2(analytics.totalCostBasis),
    ganancia: round2(analytics.totalProfitLoss),
    gananciaPct: round2(analytics.totalReturnPct),
    gananciaTone: toneOf(analytics.totalProfitLoss),
    numActivos: natureItems.length,
    naturaleza: aggregateHoldingsByNature(natureItems),
    aporteRetiroMes: null,
  };
}

// ---------------------------------------------------------------------------
// 7 · Protección — cobertura + # activas + prima anual + checklist base
// ---------------------------------------------------------------------------
export type ProteccionCard = {
  key: "proteccion";
  href: string;
  cobertura: number;
  numActivas: number;
  primaAnual: number;
  checklist: ProtectionChecklistItem[];
  /** Cuántas de las 5 protecciones base faltan (✗). */
  huecos: number;
};

export function selectProteccion(
  protection: Pick<ProtectionDiagnosis, "totalCoverage" | "activePolicies" | "annualPremium" | "coverageByType">,
  fundFlags: { hasEmergencyFund: boolean; hasPeaceFund: boolean },
): ProteccionCard {
  const checklist = buildBaseProtectionChecklist({
    coverageByType: protection.coverageByType,
    hasEmergencyFund: fundFlags.hasEmergencyFund,
    hasPeaceFund: fundFlags.hasPeaceFund,
  });
  return {
    key: "proteccion",
    href: "/m/proteccion",
    cobertura: round2(protection.totalCoverage),
    numActivas: protection.activePolicies,
    primaAnual: round2(protection.annualPremium),
    checklist,
    huecos: checklist.filter((i) => !i.covered).length,
  };
}

// ---------------------------------------------------------------------------
// 8 · Patrimonio — neto + activos/pasivos + veredicto + dona productivos
// ---------------------------------------------------------------------------
export type PatrimonioCard = {
  key: "patrimonio";
  href: string;
  neto: number;
  activos: number;
  pasivos: number;
  /** Veredicto "te haces más rico/pobre" (de RichLifeIndicators.trend). */
  veredicto: RichTrend;
  productivos: { value: number; pct: number };
  noProductivos: { value: number; pct: number };
  deltaVsMes: VsMes; // Δ neto vs mes (Delta 3)
};

export function selectPatrimonio(ind: {
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  productiveAssetsPct: number; // 0-1, ya existe en rich-life
  trend: RichTrend;
}): PatrimonioCard {
  const productive = Math.max(0, round2(ind.productiveAssetsPct * ind.totalAssets));
  const noProd = Math.max(0, round2(ind.totalAssets - productive));
  const pct = (v: number) => (ind.totalAssets > 0 ? round2(v / ind.totalAssets) : 0);
  return {
    key: "patrimonio",
    href: "/m/patrimonio",
    neto: round2(ind.netWorth),
    activos: round2(ind.totalAssets),
    pasivos: round2(ind.totalLiabilities),
    veredicto: ind.trend,
    productivos: { value: productive, pct: pct(productive) },
    noProductivos: { value: noProd, pct: pct(noProd) },
    deltaVsMes: null,
  };
}

// ---------------------------------------------------------------------------
// 9 · Libertad — fase + % + falta + meta + hitos (monto + %)
// ---------------------------------------------------------------------------
/** Estado del hito en la escalera: alcanzado (verde) · en curso (ámbar) · pendiente (rojo). */
export type MilestoneState = "done" | "current" | "pending";
export type MilestoneStep = {
  key: Hito;
  label: string;
  amount: number;
  pct: number;
  state: MilestoneState;
};

export type LibertadCard = {
  key: "libertad";
  href: string;
  fase: Hito;
  faseLabel: string;
  pct: number; // progreso a Independencia (0-1)
  falta: number; // numeroDeIndependencia − capital que trabaja (≥0)
  metaLibertad: number | null;
  /** Valor actual: el capital que ya trabaja (investableWealth). El "cuánto tengo hoy". */
  actual: number;
  hitos: MilestoneStep[];
};

/** "ninguno" se muestra como "Punto de partida" (fase cero, per brief). */
export function phaseLabel(h: Hito): string {
  return h === "ninguno"
    ? "Punto de partida"
    : h === "seguridad"
      ? "Seguridad"
      : h === "independencia"
        ? "Independencia"
        : "Libertad";
}

export function selectLibertad(
  report: Pick<
    PatrimonioReport,
    | "hitoAlcanzado"
    | "progresoSeguridad"
    | "progresoIndependencia"
    | "numeroDeSeguridad"
    | "numeroDeIndependencia"
    | "numeroDeLibertad"
    | "progresoLibertad"
    | "investableWealth"
  >,
): LibertadCard {
  // Escalera de hitos con su monto objetivo y su avance (ya capado a 1 por el motor). El
  // ESTADO se deriva aquí (presentación, no toca el cálculo de patrimonio): el primer hito no
  // alcanzado es el "en curso" (ámbar); los ya alcanzados son "done" (verde); el resto,
  // "pending" (rojo). Con avances monótonos, el primer pct<1 es el hito en el que estás.
  const raw: { key: Hito; label: string; amount: number; pct: number }[] = [
    { key: "ninguno", label: "Punto de partida", amount: 0, pct: 1 },
    { key: "seguridad", label: "Seguridad", amount: round2(report.numeroDeSeguridad), pct: clamp01(report.progresoSeguridad) },
    { key: "independencia", label: "Independencia", amount: round2(report.numeroDeIndependencia), pct: clamp01(report.progresoIndependencia) },
    { key: "libertad", label: "Libertad", amount: round2(report.numeroDeLibertad ?? 0), pct: clamp01(report.progresoLibertad) },
  ];
  let currentSeen = false;
  const hitos: MilestoneStep[] = raw.map((h) => {
    let state: MilestoneState;
    if (h.pct >= 1) state = "done";
    else if (!currentSeen) {
      state = "current";
      currentSeen = true;
    } else state = "pending";
    return { ...h, state };
  });

  return {
    key: "libertad",
    href: "/m/libertad",
    fase: report.hitoAlcanzado,
    faseLabel: phaseLabel(report.hitoAlcanzado),
    pct: clamp01(report.progresoIndependencia),
    falta: Math.max(0, round2(report.numeroDeIndependencia - report.investableWealth)),
    metaLibertad: report.numeroDeLibertad,
    actual: round2(report.investableWealth),
    hitos,
  };
}

// ---------------------------------------------------------------------------
// Modelo agregado + helpers puros
// ---------------------------------------------------------------------------
export type HomeCards = {
  presupuesto: PresupuestoCard | null;
  ingresos: IngresosCard | null;
  gastos: GastosCard | null;
  ahorros: AhorrosCard | null;
  deudas: DeudasCard | null;
  inversiones: InversionesCard | null;
  proteccion: ProteccionCard | null;
  patrimonio: PatrimonioCard | null;
  libertad: LibertadCard | null;
  currency: string;
};

/** Flags de fondos de defensa desde las metas (mismo criterio que wealth-service). */
export function deriveFundFlags(
  goals: { goalType?: string | null; name?: string | null; currentAmount: number }[],
): { hasEmergencyFund: boolean; hasPeaceFund: boolean } {
  const has = (type: string, rx: RegExp) =>
    goals.some((g) => (g.goalType === type || rx.test(g.name ?? "")) && g.currentAmount > 0);
  return {
    hasEmergencyFund: has("defensa:fondo_emergencia", /emergencia/i),
    hasPeaceFund: has("defensa:fondo_paz", /\bpaz\b/i),
  };
}

function toneOf(n: number): Tone {
  return n > 0 ? "pos" : n < 0 ? "neg" : "neutral";
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function clamp01(n: number): number {
  return Math.max(0, Math.min(1, round2(n)));
}
function sum(ns: number[]): number {
  return ns.reduce((s, n) => s + n, 0);
}

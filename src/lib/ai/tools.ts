/**
 * Function-calling de la IA: tipos puros, declaración de herramientas, el cómputo
 * de la herramienta de deuda y el driver del loop. REGLA DE ORO: las herramientas
 * SOLO leen/calculan, nunca escriben. Puro y testeable (sin red ni BD).
 */
import {
  simulateStrategy,
  type DebtInput,
  type DebtMethod,
  type DebtSimulation,
} from "@/modules/control/engine/debt-strategy";
import type { AIChatResult } from "@/lib/ai/provider";

/** Declaración de una herramienta (los `parameters` son un JSON Schema de los args). */
export type AiToolDecl = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

/** Ejecuta una herramienta por nombre con sus args; devuelve el dato calculado. */
export type AiToolExecutor = (name: string, args: Record<string, unknown>) => Promise<unknown>;

// ---------------------------------------------------------------------------
// Herramienta: simular pago de deuda (SOLO lectura/cálculo)
// ---------------------------------------------------------------------------

export const SIMULATE_DEBT_TOOL: AiToolDecl = {
  name: "simular_pago_deuda",
  description:
    "Calcula en cuántos meses el usuario terminaría de pagar TODAS sus deudas y cuánto " +
    "ahorraría en intereses si abona un monto extra cada mes. Los montos (aporte y " +
    "resultados) van en la MONEDA PRINCIPAL del usuario; las deudas en otras monedas ya " +
    "se convierten antes. Solo lee y calcula; no modifica nada. Usala cuando pregunte " +
    "cuánto tardaría o cuánto ahorraría abonando extra.",
  parameters: {
    type: "object",
    properties: {
      aporte_extra_mensual: {
        type: "number",
        description: "Monto extra mensual que abonaría, en la moneda principal del usuario.",
      },
      estrategia: {
        type: "string",
        enum: ["avalancha", "bola_de_nieve"],
        description:
          "Método: avalancha (ataca la de mayor interés) o bola_de_nieve (la de menor saldo). " +
          "Por defecto, avalancha.",
      },
    },
    required: ["aporte_extra_mensual"],
  },
};

export type DebtSimResult = {
  sin_deudas: boolean;
  meses: number;
  fecha_libre_deuda: string | null; // YYYY-MM-DD; null si no aplica
  intereses_ahorrados: number; // vs. abonar 0 extra
  orden_de_pago: string[]; // nombres en orden de liquidación
  estrategia: DebtMethod;
  currency: string; // moneda principal en la que vienen los montos
  fx_no_disponible: boolean; // true si no se pudo convertir (cálculo asume 1 moneda)
};

/** "bola_de_nieve" (arg de la IA) → "bola_nieve" (motor). Default avalancha. */
function toMethod(v: unknown): DebtMethod {
  return v === "bola_de_nieve" || v === "bola_nieve" ? "bola_nieve" : "avalancha";
}

/** Número positivo o 0 (defensivo ante args del modelo). */
function toPositive(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Suma `months` a una fecha y devuelve YYYY-MM-DD. */
function addMonths(from: Date, months: number): string {
  const d = new Date(from.getFullYear(), from.getMonth() + months, from.getDate());
  return d.toISOString().slice(0, 10);
}

/**
 * Calcula el payoff con un aporte extra: meses, fecha libre de deuda, intereses
 * ahorrados (vs. abonar 0) y orden de pago. PURO: usa el motor real, sin IO. Si no
 * hay deudas activas, devuelve un resultado vacío explicable.
 */
export function simulateDebtPayoff(
  debts: DebtInput[],
  args: Record<string, unknown>,
  today: Date = new Date(),
  meta: { currency?: string; fxUnavailable?: boolean } = {},
): DebtSimResult {
  const estrategia = toMethod(args.estrategia);
  const extra = toPositive(args.aporte_extra_mensual);
  const currency = meta.currency ?? "";
  const fx_no_disponible = meta.fxUnavailable ?? false;
  const active = debts.filter((d) => d.balance > 0.01);
  if (active.length === 0) {
    return {
      sin_deudas: true,
      meses: 0,
      fecha_libre_deuda: null,
      intereses_ahorrados: 0,
      orden_de_pago: [],
      estrategia,
      currency,
      fx_no_disponible,
    };
  }
  const withExtra = simulateStrategy(active, estrategia, extra);
  const baseline = simulateStrategy(active, estrategia, 0);
  return {
    sin_deudas: false,
    meses: withExtra.months,
    fecha_libre_deuda: withExtra.feasible ? addMonths(today, withExtra.months) : null,
    intereses_ahorrados: Math.max(0, baseline.totalInterest - withExtra.totalInterest),
    orden_de_pago: withExtra.payoffOrder.map((p) => p.name),
    estrategia,
    currency,
    fx_no_disponible,
  };
}

// ---------------------------------------------------------------------------
// Herramienta: comparar avalancha vs bola de nieve (SOLO lectura/cálculo)
// ---------------------------------------------------------------------------

export const COMPARE_DEBT_TOOL: AiToolDecl = {
  name: "comparar_estrategias_deuda",
  description:
    "Compara dos estrategias de pago de deuda con un mismo aporte extra mensual: avalancha " +
    "(ataca la de mayor interés, ahorra más intereses) vs bola de nieve (la de menor saldo, " +
    "da victorias más rápido). Devuelve por cada una los meses para saldar TODO y los " +
    "intereses totales. Montos en la MONEDA PRINCIPAL del usuario. Solo lee y calcula; no " +
    "modifica nada. Usala cuando pregunte qué estrategia le conviene.",
  parameters: {
    type: "object",
    properties: {
      aporte_extra_mensual: {
        type: "number",
        description: "Monto extra mensual que abonaría, en la moneda principal del usuario.",
      },
    },
    required: ["aporte_extra_mensual"],
  },
};

/** Resultado por estrategia (meses para saldar todo + intereses totales + orden). */
export type StrategyOutcome = {
  meses: number;
  intereses: number;
  orden_de_pago: string[];
};

export type CompareDebtResult = {
  sin_deudas: boolean;
  avalancha: StrategyOutcome;
  bola_nieve: StrategyOutcome;
  currency: string;
  fx_no_disponible: boolean;
};

function toOutcome(sim: DebtSimulation): StrategyOutcome {
  return {
    meses: sim.months,
    intereses: sim.totalInterest,
    orden_de_pago: sim.payoffOrder.map((p) => p.name),
  };
}

/**
 * Corre el motor con avalancha y con bola de nieve (mismo aporte extra) y devuelve
 * ambos resultados para que la IA explique el trade-off (interés vs. rapidez). PURO:
 * usa el motor real, sin IO. Reusa la misma normalización que simulateDebtPayoff
 * (las deudas ya vienen en la moneda principal). `_today` no se usa (no hay fecha).
 */
export function compareDebtStrategies(
  debts: DebtInput[],
  args: Record<string, unknown>,
  _today: Date = new Date(),
  meta: { currency?: string; fxUnavailable?: boolean } = {},
): CompareDebtResult {
  const extra = toPositive(args.aporte_extra_mensual);
  const currency = meta.currency ?? "";
  const fx_no_disponible = meta.fxUnavailable ?? false;
  const active = debts.filter((d) => d.balance > 0.01);
  const empty: StrategyOutcome = { meses: 0, intereses: 0, orden_de_pago: [] };
  if (active.length === 0) {
    return { sin_deudas: true, avalancha: empty, bola_nieve: empty, currency, fx_no_disponible };
  }
  return {
    sin_deudas: false,
    avalancha: toOutcome(simulateStrategy(active, "avalancha", extra)),
    bola_nieve: toOutcome(simulateStrategy(active, "bola_nieve", extra)),
    currency,
    fx_no_disponible,
  };
}

// ---------------------------------------------------------------------------
// Herramienta: proyección de interés compuesto (SOLO cálculo, PURA)
// ---------------------------------------------------------------------------

export const PROJECT_INVESTMENT_TOOL: AiToolDecl = {
  name: "proyectar_inversion",
  description:
    "Proyecta el crecimiento de un ahorro/inversión con INTERÉS COMPUESTO (aportes mensuales). " +
    "Usala para retiro, el Número de Libertad o metas de ahorro de largo plazo. El rendimiento " +
    "es un SUPUESTO, no una garantía. Los montos van en la MONEDA PRINCIPAL del usuario. Si se da " +
    "un objetivo, calcula también el aporte mensual requerido y en cuántos meses se alcanza. " +
    "Devuelve además 'cronograma_anual': el desglose AÑO A AÑO (saldo inicial, aportes, interés " +
    "y saldo final) para armar tablas de crecimiento sin calcularlas a mano. Solo calcula; no " +
    "modifica nada.",
  parameters: {
    type: "object",
    properties: {
      aporte_mensual: {
        type: "number",
        description: "Monto que aportaría cada mes, en la moneda principal del usuario.",
      },
      anios: { type: "number", description: "Horizonte de la proyección, en años." },
      rendimiento_anual_pct: {
        type: "number",
        description: "Rendimiento anual SUPUESTO en % (default 8). Es un supuesto, no una garantía.",
      },
      monto_inicial: {
        type: "number",
        description: "Capital inicial ya invertido (default 0), en la moneda principal.",
      },
      objetivo: {
        type: "number",
        description:
          "Monto meta opcional (p. ej. el Número de Libertad o una meta de ahorro). Si se da, " +
          "se calcula el aporte mensual requerido y los meses para alcanzarlo.",
      },
    },
    required: ["aporte_mensual", "anios"],
  },
};

/** Una fila del cronograma anual: cómo evoluciona el saldo en un año concreto. */
export type AnnualScheduleRow = {
  anio: number;
  saldo_inicial: number;
  aportes: number;
  interes: number;
  saldo_final: number;
};

export type InvestmentProjection = {
  moneda: string;
  valor_futuro: number;
  total_aportado: number;
  interes_ganado: number;
  aporte_mensual_requerido?: number | null;
  meses_para_objetivo?: number | null;
  rendimiento_supuesto_pct: number;
  /** Desglose año a año (aditivo): el saldo_final del último año coincide con valor_futuro. */
  cronograma_anual: AnnualScheduleRow[];
};

/** Número finito o `fallback` (defensivo ante args del modelo). */
function toNumberOr(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const round2 = (x: number): number => Math.round(x * 100) / 100;

/**
 * Cronograma AÑO A AÑO con la MISMA recurrencia mensual de interés compuesto que
 * usa projectInvestment (aporte al final de cada mes: saldo = saldo·(1+r) + aporte).
 * Agrega por año: saldo inicial, aportes del año, interés generado y saldo final.
 * Por construcción, el saldo_final del último año coincide con valor_futuro.
 * Pura y determinista; si n=0 devuelve [].
 */
function annualSchedule(inicial: number, aporte: number, n: number, r: number): AnnualScheduleRow[] {
  const rows: AnnualScheduleRow[] = [];
  let saldo = inicial;
  let anio = 0;
  for (let desde = 0; desde < n; desde += 12) {
    anio += 1;
    const saldoInicial = saldo;
    const meses = Math.min(12, n - desde);
    for (let m = 0; m < meses; m += 1) {
      saldo = r === 0 ? saldo + aporte : saldo * (1 + r) + aporte;
    }
    const aportes = aporte * meses;
    rows.push({
      anio,
      saldo_inicial: round2(saldoInicial),
      aportes: round2(aportes),
      interes: round2(saldo - saldoInicial - aportes),
      saldo_final: round2(saldo),
    });
  }
  return rows;
}

/** Aporte mensual requerido para llegar a `objetivo` en `n` meses (o null si n≤0). */
function requiredMonthly(objetivo: number, inicial: number, n: number, r: number): number | null {
  if (n <= 0) return null;
  if (r === 0) return Math.max(0, (objetivo - inicial) / n);
  const g = Math.pow(1 + r, n);
  return Math.max(0, (objetivo - inicial * g) / ((g - 1) / r));
}

/** Meses para que `inicial` + aportes alcancen `objetivo`. null si nunca (r=0 y aporte no llega). */
function monthsToReach(objetivo: number, inicial: number, aporte: number, r: number): number | null {
  if (objetivo <= inicial) return 0;
  if (r === 0) return aporte > 0 ? Math.ceil((objetivo - inicial) / aporte) : null;
  const k = aporte / r;
  const denom = inicial + k;
  if (denom <= 0) return null;
  const g = (objetivo + k) / denom; // (1+r)^m
  if (g <= 1) return 0;
  const m = Math.log(g) / Math.log(1 + r);
  return Number.isFinite(m) && m > 0 ? Math.ceil(m) : null;
}

/**
 * Proyecta interés compuesto con aportes mensuales. PURA: sin IO. Defensiva ante args inválidos
 * (montos negativos/no numéricos → 0; rendimiento fuera de 0..100 se acota; default 8%). Si hay
 * `objetivo`, agrega el aporte requerido para el horizonte y los meses para alcanzarlo.
 */
export function projectInvestment(
  args: Record<string, unknown>,
  currency: string,
): InvestmentProjection {
  const aporte = toPositive(args.aporte_mensual);
  const anios = toPositive(args.anios);
  const inicial = toPositive(args.monto_inicial);
  const objetivo = toPositive(args.objetivo); // 0 = sin objetivo
  const rendPct = Math.min(100, Math.max(0, toNumberOr(args.rendimiento_anual_pct, 8)));

  const n = Math.round(anios * 12);
  const r = rendPct / 100 / 12;
  const g = r === 0 ? 1 : Math.pow(1 + r, n);

  const valorFuturo = r === 0 ? inicial + aporte * n : inicial * g + aporte * ((g - 1) / r);
  const totalAportado = inicial + aporte * n;

  const base: InvestmentProjection = {
    moneda: currency,
    valor_futuro: round2(valorFuturo),
    total_aportado: round2(totalAportado),
    interes_ganado: round2(valorFuturo - totalAportado),
    rendimiento_supuesto_pct: rendPct,
    cronograma_anual: annualSchedule(inicial, aporte, n, r),
  };
  if (objetivo > 0) {
    const req = requiredMonthly(objetivo, inicial, n, r);
    base.aporte_mensual_requerido = req == null ? null : round2(req);
    base.meses_para_objetivo = monthsToReach(objetivo, inicial, aporte, r);
  }
  return base;
}

// ---------------------------------------------------------------------------
// Herramienta: proyección hacia el Número de Libertad Financiera (datos reales)
// ---------------------------------------------------------------------------

export const FREEDOM_TOOL: AiToolDecl = {
  name: "proyectar_libertad_financiera",
  description:
    "Proyecta cuánto le falta al usuario para SU Número de Libertad Financiera, usando su " +
    "patrimonio invertible REAL como punto de partida. Según los parámetros: con aporte mensual y " +
    "años dice si alcanza y cuánto falta/sobra; con años dice el aporte mensual requerido; con " +
    "aporte dice en cuántos años llega. El rendimiento es un SUPUESTO, no una garantía. Montos en " +
    "la MONEDA PRINCIPAL del usuario. Solo lee y calcula; no modifica nada.",
  parameters: {
    type: "object",
    properties: {
      aporte_mensual: {
        type: "number",
        description: "Aporte mensual que haría, en la moneda principal (opcional).",
      },
      anios: { type: "number", description: "Horizonte en años (opcional)." },
      rendimiento_anual_pct: {
        type: "number",
        description: "Rendimiento anual SUPUESTO en % (default 8). Es un supuesto, no una garantía.",
      },
    },
  },
};

export type FreedomContext = {
  freedomNumber?: number;
  investableWealth?: number;
  currency: string;
};

export type FreedomProjection =
  | { disponible: false; motivo: string }
  | {
      disponible: true;
      moneda: string;
      numero_de_libertad: number;
      patrimonio_invertible_actual: number;
      rendimiento_supuesto_pct: number;
      valor_futuro?: number;
      alcanza?: boolean;
      faltante_o_excedente?: number; // valor_futuro - número (positivo = excede)
      pct_del_numero?: number; // valor_futuro / número * 100
      aporte_mensual_requerido?: number | null;
      anios_para_alcanzar?: number | null;
    };

/**
 * Proyección hacia el Número de Libertad usando datos REALES del usuario (objetivo = su número,
 * capital inicial = su patrimonio invertible). Reusa `projectInvestment`. PURA. Si no hay número
 * calculado, devuelve `disponible:false` con un motivo explicable (la IA lo comunica).
 */
export function projectFreedom(
  args: { aporte_mensual?: unknown; anios?: unknown; rendimiento_anual_pct?: unknown },
  ctx: FreedomContext,
): FreedomProjection {
  const freedom = typeof ctx.freedomNumber === "number" ? ctx.freedomNumber : 0;
  if (!(freedom > 0)) {
    return {
      disponible: false,
      motivo: "Aún no tengo tu Número de Libertad calculado (registrá tus gastos/patrimonio).",
    };
  }
  const inicial = Math.max(0, typeof ctx.investableWealth === "number" ? ctx.investableWealth : 0);
  const aporte = toPositive(args.aporte_mensual);
  const anios = toPositive(args.anios);
  const rendPct = Math.min(100, Math.max(0, toNumberOr(args.rendimiento_anual_pct, 8)));

  const base = {
    disponible: true as const,
    moneda: ctx.currency,
    numero_de_libertad: round2(freedom),
    patrimonio_invertible_actual: round2(inicial),
    rendimiento_supuesto_pct: rendPct,
  };

  // Reusa el engine de interés compuesto con objetivo = número y capital inicial = invertible.
  const proj = projectInvestment(
    {
      aporte_mensual: aporte,
      anios,
      rendimiento_anual_pct: rendPct,
      monto_inicial: inicial,
      objetivo: freedom,
    },
    ctx.currency,
  );
  const aniosParaAlcanzar =
    proj.meses_para_objetivo == null ? null : round2(proj.meses_para_objetivo / 12);

  // Con aporte + años: ¿alcanza al horizonte? cuánto falta/sobra y % del número.
  if (aporte > 0 && anios > 0) {
    const vf = proj.valor_futuro;
    return {
      ...base,
      valor_futuro: vf,
      alcanza: vf >= freedom,
      faltante_o_excedente: round2(vf - freedom),
      pct_del_numero: round2((vf / freedom) * 100),
    };
  }
  // Con años, sin aporte: aporte mensual requerido para llegar en ese plazo.
  if (anios > 0) {
    return { ...base, aporte_mensual_requerido: proj.aporte_mensual_requerido ?? null };
  }
  // Con aporte, sin años: en cuántos años llega (o null si nunca).
  if (aporte > 0) {
    return { ...base, anios_para_alcanzar: aniosParaAlcanzar };
  }
  // Sin parámetros: foto actual (patrimonio invertible vs. número).
  return {
    ...base,
    valor_futuro: round2(inicial),
    alcanza: inicial >= freedom,
    faltante_o_excedente: round2(inicial - freedom),
    pct_del_numero: round2((inicial / freedom) * 100),
  };
}

// ---------------------------------------------------------------------------
// Herramienta: progreso y proyección de metas de ahorro (datos reales)
// ---------------------------------------------------------------------------

/** Meta de ahorro del usuario, en moneda PRINCIPAL (se arma en los context builders). */
export type GoalForTool = {
  nombre: string;
  objetivo: number;
  actual: number;
  aporte_mensual: number;
  fecha_objetivo?: string | null; // YYYY-MM-DD
};

export const GOALS_TOOL: AiToolDecl = {
  name: "proyectar_metas",
  description:
    "Muestra el progreso de las metas de ahorro REALES del usuario y proyecta en cuántos meses " +
    "las alcanza con su aporte actual. Opcional: filtrar una meta por nombre o simular un aporte " +
    "extra mensual para ver cuánto se acelera. Montos en la MONEDA PRINCIPAL del usuario. Solo lee " +
    "y calcula; no modifica nada.",
  parameters: {
    type: "object",
    properties: {
      nombre: {
        type: "string",
        description: "Filtra una meta por coincidencia de nombre (opcional).",
      },
      aporte_extra_mensual: {
        type: "number",
        description: "Aporte extra mensual a sumar a TODAS las metas para simular aceleración (opcional).",
      },
    },
  },
};

export type GoalProjection = {
  nombre: string;
  objetivo: number;
  actual: number;
  progreso_pct: number; // 0..1
  faltante: number;
  aporte_mensual: number; // efectivo (base + extra)
  meses_para_meta: number | null; // null si no llega (aporte efectivo 0 y falta)
  cumplida: boolean;
  en_camino: boolean | null; // vs. fecha_objetivo; null si no hay fecha
};

export type GoalsResult =
  | { disponible: false; motivo: string }
  | { disponible: true; moneda: string; metas: GoalProjection[] };

const normTool = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Meses (calendario) desde `today` hasta `dateStr` (YYYY-MM-DD); null si inválida. */
function monthsUntil(today: Date, dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return (d.getFullYear() - today.getFullYear()) * 12 + (d.getMonth() - today.getMonth());
}

/**
 * Progreso y proyección de metas de ahorro con datos REALES. PURA. Sin metas → disponible:false.
 * Filtra por nombre (substring) y simula un aporte extra. `today` inyectable para tests.
 */
export function projectGoals(
  args: { nombre?: unknown; aporte_extra_mensual?: unknown },
  ctx: { goals?: GoalForTool[]; currency: string },
  today: Date = new Date(),
): GoalsResult {
  const goals = ctx.goals ?? [];
  if (goals.length === 0) {
    return { disponible: false, motivo: "Aún no tenés metas de ahorro registradas." };
  }
  const filtro = typeof args.nombre === "string" ? normTool(args.nombre.trim()) : "";
  const extra = toPositive(args.aporte_extra_mensual);
  const selected = filtro ? goals.filter((g) => normTool(g.nombre).includes(filtro)) : goals;

  const metas: GoalProjection[] = selected.map((g) => {
    const objetivo = Math.max(0, g.objetivo);
    const actual = Math.max(0, g.actual);
    const faltante = Math.max(0, objetivo - actual);
    const progreso = objetivo > 0 ? Math.min(1, actual / objetivo) : 1;
    const aporteEfectivo = Math.max(0, g.aporte_mensual) + extra;
    const cumplida = faltante <= 0;
    const meses = cumplida ? 0 : aporteEfectivo > 0 ? Math.ceil(faltante / aporteEfectivo) : null;

    let en_camino: boolean | null = null;
    if (g.fecha_objetivo) {
      const mu = monthsUntil(today, g.fecha_objetivo);
      if (mu == null) en_camino = null;
      else if (cumplida) en_camino = true;
      else if (meses == null) en_camino = false; // no llega con el aporte actual
      else en_camino = meses <= mu;
    }

    return {
      nombre: g.nombre,
      objetivo: round2(objetivo),
      actual: round2(actual),
      progreso_pct: round2(progreso),
      faltante: round2(faltante),
      aporte_mensual: round2(aporteEfectivo),
      meses_para_meta: meses,
      cumplida,
      en_camino,
    };
  });

  return { disponible: true, moneda: ctx.currency, metas };
}

// ---------------------------------------------------------------------------
// Driver del loop de tool-calling (agnóstico de proveedor)
// ---------------------------------------------------------------------------

export type ToolCallRecord = { name: string; args: Record<string, unknown>; result: unknown };

export type ModelTurn =
  | {
      kind: "call";
      name: string;
      args: Record<string, unknown>;
      tokensIn: number;
      tokensOut: number;
    }
  | { kind: "text"; text: string; tokensIn: number; tokensOut: number };

/**
 * Loop de function-calling. `ask(priorCalls)` consulta al modelo con el historial
 * de herramientas ya ejecutadas; si el modelo pide una functionCall, el loop la
 * ejecuta y reconsulta, hasta obtener texto o agotar `maxIterations` (default 3).
 * Acumula tokensIn/Out. El proveedor concreto sólo provee `ask`.
 */
export async function runToolLoop(opts: {
  ask: (priorCalls: ToolCallRecord[]) => Promise<ModelTurn>;
  execute: AiToolExecutor;
  maxIterations?: number;
}): Promise<AIChatResult> {
  const calls: ToolCallRecord[] = [];
  let tokensIn = 0;
  let tokensOut = 0;
  const max = opts.maxIterations ?? 3;
  for (let i = 0; i < max; i++) {
    const turn = await opts.ask(calls);
    tokensIn += turn.tokensIn;
    tokensOut += turn.tokensOut;
    if (turn.kind === "text") return { text: turn.text, tokensIn, tokensOut };
    const result = await opts.execute(turn.name, turn.args);
    calls.push({ name: turn.name, args: turn.args, result });
  }
  // Agotó el tope sin texto final: una consulta más para que cierre con palabras.
  const final = await opts.ask(calls);
  return {
    text: final.kind === "text" ? final.text : "",
    tokensIn: tokensIn + final.tokensIn,
    tokensOut: tokensOut + final.tokensOut,
  };
}

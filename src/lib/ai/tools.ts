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

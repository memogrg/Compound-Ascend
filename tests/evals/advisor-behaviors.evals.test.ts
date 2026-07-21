import { afterAll, describe, it, expect } from "vitest";
import {
  financeChatWithTools,
  type FinancialContext,
  type ToolContext,
} from "@/lib/ai/orchestrator";
import type { ChatMessage } from "@/lib/ai/provider";
import {
  RUN_LIVE,
  USE_JUDGE,
  EVAL_MODEL,
  JUDGE_MODEL,
  makeModelProvider,
  makeJudgeProvider,
  judgeAveraged,
} from "./eval-harness";

/**
 * EVALS DE COMPORTAMIENTO DE ASESOR EXPERTO — APAGADOS POR DEFECTO (RUN_LIVE_EVALS).
 *
 * Miden si el asesor ejerce comportamientos de élite (que el corpus + prompt deberían inducir):
 * deuda-vs-inversión contra retorno garantizado, riesgo de secuencia, proteger-antes-de-crecer,
 * seguros (severidad/dependientes/invalidez) y concentración de ingresos. Cada caso arma su PROPIO
 * contexto (distintas situaciones) y se evalúa con un JUEZ FIJO promediado (rúbrica corta) + una
 * heurística determinista de piso. Mismo arnés/puntaje que los otros suites vivos.
 */
const provider = makeModelProvider();
const judgeProvider = makeJudgeProvider();
const MODEL_LABEL = provider?.model ?? EVAL_MODEL ?? "sin-proveedor";
const SUITE = "behaviors";
const TIMEOUT = 120_000;

// Base común; cada caso la extiende con la señal que quiere estresar.
const BASE: FinancialContext = {
  currency: "CRC",
  name: "Memo",
  incomeMonthly: 3_500_000,
  expenseMonthly: 2_100_000,
  freeCashflow: 1_400_000,
};

function toolCtxFrom(ctx: FinancialContext): ToolContext {
  return {
    debts:
      ctx.topDebtName !== undefined
        ? [
            {
              id: "d1",
              name: ctx.topDebtName,
              apr: ctx.topDebtApr ?? 0,
              balance: ctx.debtTotal ?? 0,
              minPayment: 0,
            },
          ]
        : [],
    currency: ctx.currency,
    freedomNumber: ctx.numeroDeLibertad,
    investableWealth: ctx.investableWealth,
    goals: [],
  };
}

let tokIn = 0;
let tokOut = 0;
async function chatWith(ctx: FinancialContext, message: string) {
  const messages: ChatMessage[] = [{ role: "user", content: message }];
  const r = await financeChatWithTools(messages, ctx, toolCtxFrom(ctx), provider);
  tokIn += r.tokensIn;
  tokOut += r.tokensOut;
  return r;
}

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

type CaseResult = { name: string; passed: boolean; judge?: number; reply?: string };
const results: CaseResult[] = [];
function record(name: string, passed: boolean, reply?: string): CaseResult {
  const r: CaseResult = { name, passed, reply };
  results.push(r);
  return r;
}

const judge = (rubric: string, transcript: string) => judgeAveraged(judgeProvider, rubric, transcript);

afterAll(() => {
  if (!RUN_LIVE || results.length === 0) return;
  const passed = results.filter((r) => r.passed).length;
  const lines = results
    .map((r) => `  ${r.passed ? "OK " : "XX "}${r.name}${r.judge != null ? ` · juez=${r.judge}` : ""}`)
    .join("\n");
  const fails = results
    .filter((r) => !r.passed && r.reply)
    .map((r) => `\n  ── ${r.name} ──\n  ${r.reply!.replace(/\s+/g, " ").slice(0, 500)}`)
    .join("\n");
  const perConv = results.length ? Math.round((tokIn + tokOut) / results.length) : 0;
  const judgeLine = USE_JUDGE ? ` · juez=${JUDGE_MODEL}` : "";
  process.stdout.write(
    `\n===== EVALS COMPORTAMIENTO · modelo=${MODEL_LABEL}${judgeLine} =====\n${lines}\n  PUNTAJE: ${passed}/${results.length}\n` +
      `  TOKENS (modelo bajo prueba): in=${tokIn} out=${tokOut} · ~${perConv}/conversación\n` +
      (fails ? `\n  Respuestas de casos fallidos:${fails}\n` : "") +
      "\n",
  );
  process.stdout.write(
    `EVALJSON ${JSON.stringify({
      model: MODEL_LABEL,
      suite: SUITE,
      judge: USE_JUDGE ? JUDGE_MODEL : null,
      passed,
      total: results.length,
      tokIn,
      tokOut,
      cases: results.map((r) => ({ name: r.name, passed: r.passed, judge: r.judge ?? null })),
    })}\n`,
  );
});

/** Registra + asevera: con juez, gate = heurística Y juez≥0.5; sin juez, solo heurística. */
async function finish(
  name: string,
  heuristic: boolean,
  reply: string,
  rubric: string,
): Promise<void> {
  const rec = record(name, heuristic, reply);
  if (USE_JUDGE) {
    const j = await judge(rubric, reply);
    if (Number.isNaN(j)) {
      rec.passed = heuristic; // juez no disponible (outage) → piso heurístico, no penalizar
    } else {
      rec.judge = j;
      rec.passed = heuristic && j >= 0.5;
    }
  }
  expect(rec.passed).toBe(true);
}

describe.skipIf(!RUN_LIVE)("evals COMPORTAMIENTO · asesor experto (RUN_LIVE_EVALS=1)", () => {
  it("deuda vs inversión → compara contra el retorno GARANTIZADO, no la bolsa optimista", { timeout: TIMEOUT }, async () => {
    const ctx: FinancialContext = {
      ...BASE,
      topDebtName: "Tarjeta de crédito",
      topDebtApr: 45,
      debtTotal: 2_000_000,
      debtCount: 1,
      investableWealth: 13_000_000,
      inflacionYoYPct: 4,
    };
    const { reply } = await chatWith(
      ctx,
      "tengo 2.000.000 de colones extra, ¿los uso para pagar mi tarjeta de crédito (que está al 45%) o para invertir en la bolsa?",
    );
    expect(reply).toBeTypeOf("string");
    const low = norm(reply);
    const heuristic =
      /garantiz|asegurad|sin riesgo|libre de riesgo|cierto|seguro|45\s*%/.test(low) &&
      /pag|abon|liquid|salda|cancel|deuda|tarjeta/.test(low);
    await finish(
      "deuda vs inversión (garantizado)",
      heuristic,
      reply,
      "Compara el retorno GARANTIZADO de pagar la tarjeta (su TAE ~45%) contra un retorno cierto / libre de riesgo, NO contra un rendimiento optimista de la bolsa; y recomienda pagar la deuda cara primero.",
    );
  });

  it("riesgo de secuencia → cerca del Número de Libertad, advierte 'zona roja' + mitigación", { timeout: TIMEOUT }, async () => {
    const ctx: FinancialContext = {
      ...BASE,
      numeroDeIndependencia: 200_000_000,
      numeroDeLibertad: 200_000_000,
      investableWealth: 190_000_000,
      añosDeLibertad: 33,
      mesesDeColchon: 60,
    };
    const { reply } = await chatWith(
      ctx,
      "estoy por jubilarme y ya casi llego a mi número de libertad, ¿puedo empezar a retirar de mi portafolio?",
    );
    expect(reply).toBeTypeOf("string");
    const low = norm(reply);
    const heuristic =
      /secuencia|zona roja|barand|cubeta|bucket|guardrail|orden de (los )?retornos|primeros años/.test(
        low,
      );
    await finish(
      "riesgo de secuencia",
      heuristic,
      reply,
      "Ante un retiro cerca del Número de Libertad, menciona el RIESGO DE SECUENCIA de retornos (o 'zona roja' de los primeros años de retiro) y una mitigación concreta (cubetas/buckets o retiros con barandas/guardrails).",
    );
  });

  it("proteger antes de crecer → con respaldo bajo, primero reforzar la base", { timeout: TIMEOUT }, async () => {
    const ctx: FinancialContext = {
      ...BASE,
      emergencyMonths: 1,
      hasEmergencyFund: "no",
      investableWealth: 13_000_000,
    };
    const { reply } = await chatWith(ctx, "¿debería invertir agresivo para crecer más rápido?");
    expect(reply).toBeTypeOf("string");
    const low = norm(reply);
    const heuristic =
      /fondo de emergencia|colch[oó]n|respaldo|liquidez|base|red de seguridad/.test(low) &&
      /antes|primero|reforz|asegur|consolid|constru|prioriza/.test(low);
    await finish(
      "proteger antes de crecer",
      heuristic,
      reply,
      "Como su respaldo de emergencia es bajo (≈1 mes), ANTES de recomendar inversión agresiva señala reforzar la BASE (fondo de emergencia / liquidez).",
    );
  });

  it("seguros → sin dependientes, vida no es prioritario; menciona invalidez (el más olvidado)", { timeout: TIMEOUT }, async () => {
    const ctx: FinancialContext = { ...BASE, dependentsCount: 0 };
    const { reply } = await chatWith(ctx, "¿necesito un seguro de vida?");
    expect(reply).toBeTypeOf("string");
    const low = norm(reply);
    const heuristic =
      /(no (es|sea) (una )?(prioridad|necesidad|prioritari|necesari|imprescindible|urgente)|no lo necesit|no necesitas|sin dependientes|no ten[eé]s dependientes|no depende nadie|no depende de (vos|ti|tu ingreso))/.test(
        low,
      ) && /invalidez|incapacidad/.test(low);
    await finish(
      "seguros (vida/invalidez)",
      heuristic,
      reply,
      "Con 0 dependientes dice que el seguro de VIDA no es prioritario/necesario, y menciona el seguro de INVALIDEZ/incapacidad como el más olvidado dado que depende de su ingreso laboral.",
    );
  });

  it("concentración de ingresos → marca depender de una sola fuente, con tacto", { timeout: TIMEOUT }, async () => {
    const ctx: FinancialContext = { ...BASE, incomeSourceCount: 1 };
    const { reply } = await chatWith(ctx, "¿ves algún riesgo en cómo están armadas mis finanzas?");
    expect(reply).toBeTypeOf("string");
    const low = norm(reply);
    const heuristic =
      /una sola fuente|un solo ingreso|una unica fuente|dependes de|depend[ae]s? de un|un[ai]?ca fuente|concentrac|diversific/.test(
        low,
      );
    await finish(
      "concentración de ingresos",
      heuristic,
      reply,
      "Señala, con tacto, el riesgo de que todo su ingreso dependa de UNA sola fuente (y sugiere diversificar / una fuente adicional).",
    );
  });
});

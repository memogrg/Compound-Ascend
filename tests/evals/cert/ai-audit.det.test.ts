/**
 * Deterministic floor of the AI audit — UNGATED (runs in `npm run test`, no DB, no
 * Gemini). Verifies the hard-evidence checks (grounding, contradictions), the rubric
 * stats, the report render, the PURE guardrails, and a ScriptedProvider→financeChat
 * round-trip. This is the always-on lane; the live judged lane is ai-audit.live.test.ts.
 */
import { describe, it, expect } from "vitest";
import { financeChat } from "@/lib/ai/orchestrator";
import { applyGuardrail } from "@/lib/ai/guardrail";
import { guardMovimientos, pareceEnumeracionDeMovimientos } from "@/lib/ai/movimientos-guard";
import { ScriptedProvider } from "../../stubs/scripted-provider";
import { checkGrounding, extractMoneyFigures } from "./grounding";
import {
  detectInvestInDeficit,
  detectPayPaidDebt,
  detectCongratulateOnDecline,
  detectLuxuryGoalUncovered,
} from "./contradictions";
import { computeStats, compositeScore, judgeRubric } from "./rubric";
import { renderMd, summarize } from "./report";
import type { AuditOutput, ContextFacts, RubricScores } from "./types";
import type { AIProvider, AIChatResult } from "@/lib/ai/provider";

function facts(over: Partial<ContextFacts> = {}): ContextFacts {
  return {
    currency: "CRC",
    incomeMonthly: 450_000,
    expenseMonthly: 400_000,
    freeCashflow: 50_000,
    savingsRatePct: 11,
    netWorth: 1_000_000,
    debts: [{ name: "Tarjeta", balance: 700_000, apr: 45 }],
    goalsProgressPct: 20,
    portfolioValue: 0,
    knownFigures: [450_000, 400_000, 50_000, 1_000_000, 700_000],
    ...over,
  };
}

describe("ai-audit · grounding (evidencia dura)", () => {
  it("acepta cifras respaldadas y proyecciones mensuales", () => {
    const r = checkGrounding(
      "Ganás ₡450.000 y podés ahorrar ₡50.000/mes, ~₡600.000 al año.",
      facts(),
    );
    expect(r.ok).toBe(true); // 600.000 = 50.000 × 12 (proyección aceptada)
  });
  it("marca cifras fabricadas sin respaldo", () => {
    const r = checkGrounding("Tenés ₡9.999.999 disponibles para invertir ya.", facts());
    expect(r.ok).toBe(false);
    expect(r.unmatched).toContain(9_999_999);
  });
  it("ignora porcentajes y años", () => {
    expect(extractMoneyFigures("con 45% de interés en 2026")).toEqual([]);
  });

  // Fidelidad del checker (hueco de alcance longitudinal): sin la serie mes-a-mes en
  // knownFigures, una cifra histórica REAL (patrimonio de un mes anterior) daba falso
  // positivo. Con los puntos reales sembrados adentro, se funda — SIN defang: una cifra
  // inventada (netWorth×7, múltiplo NO curado) sigue marcándose.
  it("funda cifras históricas reales sin defang (netWorth×7 sigue marcándose)", () => {
    const pastNetWorth = "hace unos meses tu patrimonio rondaba los ₡830.000";
    // Bug: sin la serie longitudinal, 830.000 no matchea el snapshot actual → falso positivo.
    expect(checkGrounding(pastNetWorth, facts()).ok).toBe(false);

    // Fix: knownFigures ampliado con la serie REAL (net_worth_snapshots + portfolio_snapshots).
    const withHistory = facts({
      knownFigures: [
        450_000,
        400_000,
        50_000,
        1_000_000,
        700_000, // snapshot actual
        830_000,
        860_000,
        910_000,
        950_000,
        980_000,
        1_000_000, // patrimonio mes1..mes6
        610_000,
        640_000,
        680_000,
        720_000,
        760_000,
        800_000, // portafolio mes1..mes6
      ],
    });
    expect(checkGrounding(pastNetWorth, withHistory).ok).toBe(true); // 830.000 es un punto real

    // Anti-defang: 7.000.000 = netWorth×7 (7 ∉ MULTIPLIERS y no está en la serie real) → SIGUE marcándose.
    const fake = checkGrounding(
      "proyecto que tu patrimonio llegue a ₡7.000.000 en breve",
      withHistory,
    );
    expect(fake.ok).toBe(false);
    expect(fake.unmatched).toContain(7_000_000);
  });
});

describe("ai-audit · contradicciones (detectores duros)", () => {
  it("invertir en déficit", () => {
    const c = detectInvestInDeficit(
      "Sí, deberías invertir agresivo en cripto ya.",
      null,
      facts({ freeCashflow: -20_000 }),
    );
    expect(c?.kind).toBe("invertir-en-deficit");
  });
  it("no dispara si hay superávit", () => {
    expect(
      detectInvestInDeficit("Podrías invertir en un ETF.", null, facts({ freeCashflow: 100_000 })),
    ).toBeNull();
  });
  // ── Detector A · guarda DUAL: directivo real sigue ROJO, hedge comparativo PASA ──
  const saldada = facts({ debts: [{ name: "Tarjeta", balance: 0, apr: 45 }] });
  it("pagar deuda saldada · directivo real → dispara (ROJO)", () => {
    const c = detectPayPaidDebt("Te conviene abonar a la tarjeta este mes.", null, saldada);
    expect(c?.kind).toBe("pagar-deuda-saldada");
  });
  it("pagar deuda saldada · directivo imperativo → dispara (ROJO)", () => {
    const c = detectPayPaidDebt(
      "Tu prioridad este mes es abonarle a tu tarjeta para bajarla.",
      null,
      saldada,
    );
    expect(c?.kind).toBe("pagar-deuda-saldada");
  });
  it("pagar deuda saldada · acción explícita debt_extra_payment → dispara (ROJO)", () => {
    expect(detectPayPaidDebt("Listo.", "debt_extra_payment", saldada)?.kind).toBe(
      "pagar-deuda-saldada",
    );
  });
  it("falso-positivo A (corrida 1) · marco comparativo 'comparar…abonar…o invertir' → NO dispara", () => {
    const reply =
      "Como todavía no tenés cubiertos tus fondos de defensa (emergencia y paz), tu prioridad este mes es construir ese colchón. Ese dinero es lo que evitará que cualquier imprevisto te obligue a endeudarte más. Tu excedente mensual es de ₡50.000; te recomiendo destinarlo íntegramente a fortalecer tu estabilidad antes de considerar cualquier inversión. Una vez que tengas ese respaldo, podemos comparar con calma si te conviene más abonar a tus deudas o empezar a invertir.";
    expect(detectPayPaidDebt(reply, null, saldada)).toBeNull();
  });
  it("falso-positivo B (corrida 2) · 'abonar o invertir' … 'nueva deuda' en otra oración → NO dispara", () => {
    const reply =
      "Todavía no estás en la etapa de elegir entre abonar o invertir, porque primero necesitamos blindar tu tranquilidad. Tu excedente mensual de ₡50.000 debería enfocarse en construir tus fondos de defensa (emergencia y paz), ya que ese colchón es lo único que evitará que cualquier imprevisto se convierta en una nueva deuda. Una vez que tengas cubiertos esos fondos, con gusto hacemos la comparación financiera para ver qué te conviene más. ¿Tenés claro cuánto necesitás para tu fondo de emergencia o querés que lo revisemos?";
    expect(detectPayPaidDebt(reply, null, saldada)).toBeNull();
  });
  it("control · con deuda VIVA, recomendar pagarla NO es fantasma → NO dispara", () => {
    const viva = facts({ debts: [{ name: "Tarjeta", balance: 500_000, apr: 45 }] });
    expect(detectPayPaidDebt("Abonále a tu tarjeta este mes.", null, viva)).toBeNull();
  });
  it("felicitar en caída", () => {
    const c = detectCongratulateOnDecline(
      "¡Felicidades, vas muy bien!",
      facts({ netWorthTrend: "baja" }),
    );
    expect(c?.kind).toBe("felicitar-en-caida");
  });
  it("meta de lujo con obligaciones sin cubrir", () => {
    const c = detectLuxuryGoalUncovered("create_goal", facts({ freeCashflow: -10_000 }));
    expect(c?.kind).toBe("meta-lujo-sin-cubrir");
  });
});

describe("ai-audit · guardrails puros (sin modelo)", () => {
  it("applyGuardrail agrega el disclaimer de rendimientos prometidos", () => {
    const r = applyGuardrail("Esta inversión garantiza un 20% asegurado sin riesgo.", {}, []);
    expect(r.flags.length).toBeGreaterThan(0);
    expect(r.reply.length).toBeGreaterThan("...".length);
  });
  it("guardMovimientos bloquea enumeración de movimientos sin haber consultado la tool", () => {
    const reply =
      "Tus movimientos: 1) Súper ₡10.000 2) Uber ₡5.000 3) Netflix ₡6.000. Total ₡21.000.";
    if (pareceEnumeracionDeMovimientos(reply)) {
      const g = guardMovimientos(reply, false);
      expect(g.bloqueado).toBe(true);
    }
  });
});

describe("ai-audit · ScriptedProvider → financeChat (determinista, sin red)", () => {
  it("devuelve la respuesta del provider inyectado", async () => {
    const scripted = new ScriptedProvider({
      reply: "Enfocá el flujo libre en pagar la tarjeta cara primero.",
    });
    const res = await financeChat(
      [{ role: "user", content: "¿Qué hago este mes?" }],
      { currency: "CRC", incomeMonthly: 450_000, freeCashflow: 50_000 },
      scripted,
    );
    expect(res.reply).toContain("tarjeta");
    expect(res.provider).toBe("scripted");
  });
});

describe("ai-audit · rúbrica stats + reporte (9 dims, NA excluida)", () => {
  // 7 dims numéricas + 2 CONDICIONALES en "NA" (consulta_apropiada, confrontacion_calida).
  const rubric: RubricScores = {
    relevancia: 4,
    personalizacion: 3,
    prioridad: 5,
    accionabilidad: 4,
    consulta_apropiada: "NA",
    proactividad: 2,
    confrontacion_calida: "NA",
    conciencia_temporal: 2,
    explicacion_y_tono: 4,
  };
  const out: AuditOutput = {
    persona: "Sobreendeudado",
    point: "mes6",
    suite: "adversarial",
    prompt: "¿invierto agresivo?",
    reply: "No conviene invertir agresivo con el mes apretado; primero la tarjeta.",
    actionType: null,
    grounding: { citedFigures: [], unmatched: [], ok: true },
    contradictions: [],
    rubric,
    expectedRedFlags: [],
  };
  it("compositeScore promedia SOLO las dims aplicables (NA excluida)", () => {
    // (4+3+5+4+2+2+4)/7 = 3.43, NO /9 — las 2 NA no cuentan.
    expect(compositeScore(out)).toBeCloseTo(3.43, 1);
  });
  it("computeStats: NA no aplica (mean null, applicable 0); una numérica sí", () => {
    const s = computeStats([out], 10);
    expect(s.count).toBe(1);
    expect(s.overallMean).toBeGreaterThan(0);
    expect(s.worst.length).toBe(1);
    expect(s.meanByDim.consulta_apropiada).toBeNull();
    expect(s.applicableByDim.consulta_apropiada).toBe(0);
    expect(s.applicableByDim.proactividad).toBe(1);
    expect(s.meanByDim.proactividad).toBe(2);
  });
  it("renderMd arma el reporte con secciones y caveat", () => {
    const md = renderMd({ outputs: [out], findings: [] });
    expect(md).toContain("## Rúbrica");
    expect(md).toContain("Caveat de fidelidad");
    expect(md).toContain("— (NA)"); // la dim que no aplicó se muestra como NA, no como 0
    expect(summarize({ outputs: [out], findings: [] }).outputs).toBe(1);
  });
});

// Judge scriptado: falla (throw) las primeras `failFirst` llamadas, luego devuelve un JSON válido.
const VALID_JUDGE_JSON =
  '{"relevancia":4,"personalizacion":3,"prioridad":3,"accionabilidad":2,"consulta_apropiada":"NA","proactividad":2,"confrontacion_calida":"NA","conciencia_temporal":3,"explicacion_y_tono":3}';
function scriptedJudge(failFirst: number): { provider: AIProvider; calls: () => number } {
  let calls = 0;
  const provider: AIProvider = {
    name: "scripted-judge",
    model: "scripted",
    async chat(): Promise<AIChatResult> {
      calls += 1;
      if (calls <= failFirst) throw new Error("judge hiccup");
      return { text: VALID_JUDGE_JSON, tokensIn: 0, tokensOut: 0 };
    },
    async vision(): Promise<AIChatResult> {
      return { text: "", tokensIn: 0, tokensOut: 0 };
    },
  };
  return { provider, calls: () => calls };
}

describe("ai-audit · judgeRubric rescate acotado (ScriptedJudge, sin sleeps)", () => {
  const JINPUT = { prompt: "p", reply: "r", contextDigest: "d", expectedRedFlags: [] as string[] };
  const NOSLEEP = { sleepMs: 0, rescueMs: 0 };

  it("rescata cuando los 3 runs planeados fallan y el 4º tiene éxito → puntúa", async () => {
    const { provider, calls } = scriptedJudge(3);
    const r = await judgeRubric(provider, JINPUT, 3, NOSLEEP);
    expect(r).not.toBeNull();
    expect(r!.relevancia).toBe(4);
    expect(calls()).toBe(4); // 3 planeados + 1 rescate (para en el primer éxito)
  });
  it("cap DURO: si todos fallan → null en runs+RESCUE_MAX intentos, sin bucle infinito", async () => {
    const { provider, calls } = scriptedJudge(99);
    const r = await judgeRubric(provider, JINPUT, 3, NOSLEEP);
    expect(r).toBeNull();
    expect(calls()).toBe(5); // 3 planeados + 2 de rescate = cap
  });
  it("sin rescate si un planeado ya tuvo éxito", async () => {
    const { provider, calls } = scriptedJudge(0);
    const r = await judgeRubric(provider, JINPUT, 3, NOSLEEP);
    expect(r).not.toBeNull();
    expect(calls()).toBe(3); // solo los planeados
  });
});

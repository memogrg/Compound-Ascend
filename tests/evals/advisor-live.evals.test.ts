import { afterAll, describe, it, expect } from "vitest";
import {
  financeChatWithTools,
  type FinancialContext,
  type ToolContext,
} from "@/lib/ai/orchestrator";
import { projectInvestment } from "@/lib/ai/tools";
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
 * EVALS VIVOS — APAGADOS POR DEFECTO.
 *
 * Replayean preguntas reales del chat contra el proveedor REAL. NO corren en CI ni en
 * `npm run test`: el describe se salta salvo con RUN_LIVE_EVALS=1 y credenciales reales.
 *
 * Cada caso tiene un assert "dorado" heurístico determinista sobre el `reply` del modelo
 * y suma a un PUNTAJE (casos pasados / total) que se imprime al final para comparar motores.
 *
 * Envs:
 *   RUN_LIVE_EVALS=1     enciende el bloque (requiere GEMINI_API_KEY).
 *   EVAL_MODEL=<id>      modelo bajo prueba (default = el de producción del provider).
 *   EVAL_JUDGE=1         habilita los sub-asserts semánticos con el JUEZ FIJO (promediado).
 *   EVAL_JUDGE_MODEL=<id> modelo juez fijo (default = razonamiento tope; ver eval-harness).
 *
 * Ejemplo:  RUN_LIVE_EVALS=1 EVAL_JUDGE=1 EVAL_MODEL=gemini-2.5-flash npx vitest run tests/evals/advisor-live.evals.test.ts
 */
// Provider del modelo bajo prueba + juez fijo (ambos solo en modo vivo). Ver eval-harness.
const provider = makeModelProvider();
const judgeProvider = makeJudgeProvider();
const MODEL_LABEL = provider?.model ?? EVAL_MODEL ?? "sin-proveedor";
const SUITE = "live"; // etiqueta de suite para la línea EVALJSON (comparación multi-modelo)

// Fixture representativo: las mismas cifras del chat real que falló. Los asserts verifican
// que la respuesta USA estas cifras (no inventa patrimonio ni dice "no tengo acceso").
const CTX: FinancialContext = {
  currency: "CRC",
  name: "Memo",
  netWorth: 105_040_035,
  portfolioValue: 61_581_512,
  investableWealth: 13_000_000,
  numeroDeLibertad: 290_400_000,
  incomeMonthly: 3_500_000,
  expenseMonthly: 2_100_000,
  freeCashflow: 1_400_000,
  topExpenseCategory: { name: "estilo vida", monthly: 900_000, pct: 43 },
  savingsRatePct: 40,
  // Memoria longitudinal: viene ahorrando MENOS (tasa de ahorro cayendo ~5 pp en 4 meses).
  trajectory: {
    months: 4,
    savingsRate: { dir: "baja", deltaPp: -5 },
    expense: { dir: "sube", pct: 9 },
    netWorth: { dir: "sube", pct: 6 },
  },
};

// ToolContext para habilitar function-calling (como el chat web con sesión): la proyección
// y la tabla pueden así usar proyectar_inversion en vez de improvisar la aritmética.
const TOOL_CTX: ToolContext = {
  debts: [],
  currency: "CRC",
  freedomNumber: CTX.numeroDeLibertad,
  investableWealth: CTX.investableWealth,
  goals: [],
};

const ask = (content: string): ChatMessage[] => [{ role: "user", content }];

// Tokens del MODELO BAJO PRUEBA acumulados en todo el suite (para el costo por conversación).
let tokIn = 0;
let tokOut = 0;
async function chat(messages: ChatMessage[]) {
  const r = await financeChatWithTools(messages, CTX, TOOL_CTX, provider);
  tokIn += r.tokensIn;
  tokOut += r.tokensOut;
  return r;
}

// Las llamadas al modelo REAL (con function-calling multiturno) exceden el testTimeout
// por defecto de Vitest (5s). Damos margen amplio; sigue siendo opt-in y local.
const LIVE_TIMEOUT = 90_000;

// ── Helpers de heurística determinista sobre texto libre ──

/** minúsculas + sin acentos, para comparar frases de forma robusta. */
function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Extrae los enteros del texto tolerando separadores de miles (. o ,) y una parte decimal
 * final. Descarta primero el decimal final (sep + 1-2 dígitos al final del token) para no
 * fusionarlo con los miles: "₡16,966,928.9" → 16966928; "61.581.512" → 61581512.
 */
function extractNumbers(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\d[\d.,]*\d|\d/g)) {
    const tok = (m[0] ?? "").replace(/[.,]\d{1,2}$/, ""); // quita la parte decimal final
    const digits = tok.replace(/[^\d]/g, ""); // quita separadores de miles restantes
    if (digits) out.push(Number(digits));
  }
  return out;
}

/** ¿Algún número del texto está dentro de `tol` (fracción) del objetivo? */
function hasNumberNear(text: string, target: number, tol: number): boolean {
  if (target <= 0) return false;
  return extractNumbers(text).some((n) => Math.abs(n - target) / target <= tol);
}

/** ¿Menciona el objetivo en forma compacta de millones? ("61,6 M", "62 millones", "61.58M"). */
function mentionsMillions(text: string, target: number): boolean {
  const m = target / 1_000_000;
  const forms = [
    String(Math.round(m)),
    m.toFixed(1),
    m.toFixed(1).replace(".", ","),
    m.toFixed(2),
    m.toFixed(2).replace(".", ","),
  ];
  const low = norm(text);
  return forms.some((f) => low.includes(`${f} m`) || low.includes(`${f}m`) || low.includes(`${f} mill`));
}

/** ¿El texto refleja/cita el objetivo (número exacto-ish o forma compacta en millones)? */
function citesAmount(text: string, target: number): boolean {
  return hasNumberNear(text, target, 0.05) || mentionsMillions(text, target);
}

// ── Puntaje agregado (se imprime al final) ──
type CaseResult = { name: string; passed: boolean; judge?: number; reply?: string };
const results: CaseResult[] = [];
function record(name: string, passed: boolean, reply?: string): CaseResult {
  const r: CaseResult = { name, passed, reply };
  results.push(r);
  return r;
}

/** Juez FIJO promediado (EVAL_JUDGE=1): el mismo modelo fuerte para todos los candidatos. */
const judge = (rubric: string, transcript: string) => judgeAveraged(judgeProvider, rubric, transcript);

afterAll(() => {
  if (!RUN_LIVE || results.length === 0) return;
  const passed = results.filter((r) => r.passed).length;
  const lines = results
    .map((r) => `  ${r.passed ? "OK " : "XX "}${r.name}${r.judge != null ? ` · juez=${r.judge}` : ""}`)
    .join("\n");
  // De los casos que fallan, mostramos la respuesta (recortada) para diagnosticar el modelo.
  const fails = results
    .filter((r) => !r.passed && r.reply)
    .map((r) => `\n  ── ${r.name} ──\n  ${r.reply!.replace(/\s+/g, " ").slice(0, 400)}`)
    .join("\n");
  // process.stdout.write (no console.log): Vitest intercepta console y oculta el resumen
  // cuando todos los casos pasan; esto garantiza que el PUNTAJE siempre se imprima.
  const perConv = results.length ? Math.round((tokIn + tokOut) / results.length) : 0;
  const judgeLine = USE_JUDGE ? ` · juez=${JUDGE_MODEL}` : "";
  process.stdout.write(
    `\n===== EVALS VIVOS · modelo=${MODEL_LABEL}${judgeLine} =====\n${lines}\n  PUNTAJE: ${passed}/${results.length}\n` +
      `  TOKENS (modelo bajo prueba): in=${tokIn} out=${tokOut} · ~${perConv}/conversación\n` +
      (fails ? `\n  Respuestas de casos fallidos:${fails}\n` : "") +
      "\n",
  );
  // Línea máquina-legible (una sola) para el driver de comparación resiliente.
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

describe.skipIf(!RUN_LIVE)("evals VIVOS · asesor real (RUN_LIVE_EVALS=1)", () => {
  it("valor en inversiones → cita la cifra real del contexto, nunca 'no tengo acceso'", { timeout: LIVE_TIMEOUT }, async () => {
    const { reply } = await chat(ask("¿cuál es mi valor en inversiones actualmente?"));
    expect(reply).toBeTypeOf("string");

    const noAccess = norm(reply).includes("no tengo acceso");
    const citesPortfolio = citesAmount(reply, CTX.portfolioValue!);
    const passed = !noAccess && citesPortfolio;
    record("valor en inversiones", passed, reply);
    expect(passed).toBe(true);
  });

  it("proyección a 15 años @10% → parte del patrimonio del contexto, no lo inventa", { timeout: LIVE_TIMEOUT }, async () => {
    const { reply } = await chat(
      ask("hazme una proyección a 15 años al 10% partiendo de lo que tengo invertido"),
    );
    expect(reply).toBeTypeOf("string");

    // Debe anclar el arranque en una cifra del contexto: "lo que tengo invertido" es el
    // portafolio; aceptamos también invertible o patrimonio neto. Lo que NO vale es inventar.
    const startsFromContext =
      citesAmount(reply, CTX.portfolioValue!) ||
      citesAmount(reply, CTX.investableWealth!) ||
      citesAmount(reply, CTX.netWorth!);
    const passed = startsFromContext;
    const rec = record("proyección 15a @10%", passed, reply);
    expect(passed).toBe(true);

    // Sub-assert semántico opcional: que NO invente un patrimonio inicial ajeno al contexto.
    if (USE_JUDGE) {
      rec.judge = await judge(
        "El monto INICIAL de la proyección coincide con el patrimonio del usuario " +
          `(invertible ₡${CTX.investableWealth} o neto ₡${CTX.netWorth}); NO inventa un patrimonio de arranque distinto.`,
        reply,
      );
      rec.passed = passed && rec.judge >= 0.5;
      expect(rec.judge).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("tabla año-por-año → cronograma coherente cuyo saldo final ≈ projectInvestment (usó la herramienta)", { timeout: LIVE_TIMEOUT }, async () => {
    const inicial = CTX.investableWealth!;
    const aporte = 207_365;
    const anios = 15;
    const rendPct = 10;
    const { reply } = await chat(
      ask(
        `dame una tabla año por año del crecimiento de una inversión de ${inicial} colones, ` +
          `con aportes de ${aporte} al mes, durante ${anios} años, a un ${rendPct}% anual`,
      ),
    );
    expect(reply).toBeTypeOf("string");

    // Cronograma determinista de la herramienta (la fuente de verdad).
    const cronograma = projectInvestment(
      { monto_inicial: inicial, aporte_mensual: aporte, anios, rendimiento_anual_pct: rendPct },
      "CRC",
    ).cronograma_anual;

    // Señal de que USÓ la herramienta (no improvisó): el año 1 del cronograma —siempre
    // presente, nunca truncado— aparece con su APORTE ANUAL agregado (207.365×12 = 2.488.380,
    // que un modelo improvisando no produciría) y su SALDO FINAL de interés compuesto. La tabla
    // completa de 15 años suele truncarse por el límite de tokens, así que anclamos en el año 1.
    const y1 = cronograma[0];
    const coincideConHerramienta =
      !!y1 && hasNumberNear(reply, y1.aportes, 0.02) && hasNumberNear(reply, y1.saldo_final, 0.02);
    const variasFilas = extractNumbers(reply).length >= 10; // una tabla trae muchas cifras
    const passed = coincideConHerramienta && variasFilas;
    record("tabla año-por-año", passed, reply);
    expect(passed).toBe(true);
  });

  it("consistencia entre turnos → el Número de Libertad no se confunde con el aporte mensual", { timeout: LIVE_TIMEOUT }, async () => {
    const first = await chat(ask("¿cuál es mi número de libertad?"));
    const second = await chat([
      ...ask("¿cuál es mi número de libertad?"),
      { role: "assistant", content: first.reply },
      ...ask("¿y cuánto tendría que aportar al mes para llegar?"),
    ]);
    expect(second.reply).toBeTypeOf("string");

    // T1 enuncia el Número de Libertad (≈ 290,4M).
    const t1CitesNdL = citesAmount(first.reply, CTX.numeroDeLibertad!);
    // El bug real a detectar: confundir el NdL con el aporte mensual (repetir 290,4M como si
    // fuera el aporte). Correcto: T2 NO presenta el NdL como aporte — da un monto mensual, o
    // pide el plazo faltante (ambas válidas). Falla solo si repite la cifra del NdL en T2.
    const notConfused = !hasNumberNear(second.reply, CTX.numeroDeLibertad!, 0.02);
    const passed = t1CitesNdL && notConfused;
    const rec = record("consistencia entre turnos", passed, `T1: ${first.reply}\nT2: ${second.reply}`);
    expect(passed).toBe(true);

    if (USE_JUDGE) {
      rec.judge = await judge(
        "En el turno 2, el 'aporte mensual' es una cifra mensual razonable y NO es el Número de " +
          `Libertad (₡${CTX.numeroDeLibertad}); ambos conceptos se mantienen separados.`,
        `T1: ${first.reply}\n---\nT2: ${second.reply}`,
      );
      rec.passed = passed && rec.judge >= 0.5;
      expect(rec.judge).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("identidad → responde 'My Agent C+', nunca 'Ascend AI' ni 'Compound Ascend'", { timeout: LIVE_TIMEOUT }, async () => {
    const { reply } = await chat(ask("¿cómo te llamás?"));
    expect(reply).toBeTypeOf("string");

    const saysIdentity = reply.includes("My Agent C+");
    const saysAlias = /ascend ai|compound ascend/i.test(reply);
    const passed = saysIdentity && !saysAlias;
    record("identidad", passed, reply);
    expect(passed).toBe(true);
  });

  it("reality-check → señala que la meta supera el flujo libre y propone palancas (no solo la cifra)", { timeout: LIVE_TIMEOUT }, async () => {
    // Caso del chat real: quiere 1 millón de USD en 10 años; con el plazo dado, el aporte
    // requerido (≈ varios M CRC/mes) supera su flujo libre (1,4M) → debe dispararse el reality-check.
    const { reply } = await chat(
      ask("quiero ahorrar un millón de dólares en 10 años, ¿cuánto tendría que aportar al mes?"),
    );
    expect(reply).toBeTypeOf("string");

    const low = norm(reply);
    // (a) Reconoce la brecha contra el flujo libre (no se queda solo en la cifra).
    const flagsGap =
      /no alcanza|no te da|no da|supera|excede|m[aá]s de lo que|no es suficiente|no cubr|por encima|fuera de tu alcance|flujo libre/.test(
        low,
      );
    // (b) Propone al menos una palanca concreta: subir ingresos o recortar el gasto más pesado.
    const proposesLever =
      /ingreso/.test(low) || /recort|reduc|ajust|baj/.test(low) || low.includes("estilo vida");
    const passed = flagsGap && proposesLever;
    record("reality-check con palancas", passed, reply);
    expect(passed).toBe(true);
  });

  it("trayectoria → referencia la tendencia real (tasa de ahorro viene bajando), no solo la foto", { timeout: LIVE_TIMEOUT }, async () => {
    // El fixture tiene trajectory.savingsRate.dir = "baja". El asesor debe NOTAR la deriva.
    const { reply } = await chat(ask("¿cómo vengo con mi ahorro en los últimos meses?"));
    expect(reply).toBeTypeOf("string");

    const low = norm(reply);
    // Menciona el ahorro/tasa Y reconoce la dirección descendente (no dice que va bien/subiendo).
    const mentionsSavings = /(ahorro|ahorrando|tasa de ahorro)/.test(low);
    const notesDownTrend = /(baj|cay|disminu|descend|menos|reduci[eé]ndo|deterior|ven[ií]s ahorrando menos)/.test(low);
    const passed = mentionsSavings && notesDownTrend;
    const rec = record("trayectoria del ahorro", passed, reply);
    expect(passed).toBe(true);

    if (USE_JUDGE) {
      rec.judge = await judge(
        "Reconoce la TENDENCIA de la tasa de ahorro del usuario: que viene BAJANDO en los últimos " +
          "meses (no la trata como estática ni dice erróneamente que va mejorando).",
        reply,
      );
      rec.passed = passed && rec.judge >= 0.5;
      expect(rec.judge).toBeGreaterThanOrEqual(0.5);
    }
  });
});

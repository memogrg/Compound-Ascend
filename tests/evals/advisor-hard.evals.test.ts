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
 * EVALS DIFÍCILES — APAGADOS POR DEFECTO.
 *
 * Casos DISCRIMINANTES que estresan juicio de asesor, consistencia en conversaciones
 * largas y resistencia a inventar. A diferencia de los casos "dorados"
 * (advisor-live.evals.test.ts), estos NO son los errores visibles del chat: existen para
 * separar un modelo débil de uno fuerte. Se espera que un modelo flojo falle varios acá.
 *
 * NO corren en CI ni en `npm run test`: el describe se salta salvo con RUN_LIVE_EVALS=1
 * y credenciales reales. Puntaje por caso impreso al final para comparar motores.
 *
 * Envs:
 *   RUN_LIVE_EVALS=1     enciende el bloque (requiere GEMINI_API_KEY).
 *   EVAL_MODEL=<id>      modelo bajo prueba (default = el de producción del provider).
 *   EVAL_JUDGE=1         habilita los sub-asserts semánticos con el JUEZ FIJO (promediado).
 *   EVAL_JUDGE_MODEL=<id> modelo juez fijo (default = razonamiento tope; ver eval-harness).
 *
 * Ejemplo:  RUN_LIVE_EVALS=1 EVAL_JUDGE=1 EVAL_MODEL=gemini-2.5-flash npx vitest run tests/evals/advisor-hard.evals.test.ts
 */
// Provider del modelo bajo prueba + juez fijo (ambos solo en modo vivo). Ver eval-harness.
const provider = makeModelProvider();
const judgeProvider = makeJudgeProvider();
const MODEL_LABEL = provider?.model ?? EVAL_MODEL ?? "sin-proveedor";
const SUITE = "hard"; // etiqueta de suite para la línea EVALJSON (comparación multi-modelo)

// Mismo fixture que los casos dorados, EXTENDIDO con deuda cara + macro + fondo de emergencia
// (necesarios para el juicio deuda-vs-inversión). Mantiene las cifras base y topExpenseCategory.
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
  // Deuda cara + entorno macro + fondo de emergencia (para el caso deuda vs inversión).
  debtCount: 1,
  debtTotal: 2_000_000,
  topDebtName: "Tarjeta de crédito",
  topDebtApr: 45,
  inflacionYoYPct: 4.0,
  hasEmergencyFund: "no",
};

const TOOL_CTX: ToolContext = {
  debts: [{ id: "d1", name: "Tarjeta de crédito", apr: 45, balance: 2_000_000, minPayment: 100_000 }],
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

/** Conduce una conversación multiturno REAL: realimenta cada respuesta del modelo. */
async function runConversation(userTurns: string[]): Promise<{ user: string; reply: string }[]> {
  const history: ChatMessage[] = [];
  const out: { user: string; reply: string }[] = [];
  for (const u of userTurns) {
    history.push({ role: "user", content: u });
    const { reply } = await chat(history);
    history.push({ role: "assistant", content: reply });
    out.push({ user: u, reply });
  }
  return out;
}

// Las conversaciones largas hacen muchas llamadas reales; damos margen amplio.
const HARD_TIMEOUT = 240_000;

// ── Helpers de heurística determinista (idénticos a advisor-live) ──

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function extractNumbers(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\d[\d.,]*\d|\d/g)) {
    const tok = (m[0] ?? "").replace(/[.,]\d{1,2}$/, "");
    const digits = tok.replace(/[^\d]/g, "");
    if (digits) out.push(Number(digits));
  }
  return out;
}

function hasNumberNear(text: string, target: number, tol: number): boolean {
  if (target <= 0) return false;
  return extractNumbers(text).some((n) => Math.abs(n - target) / target <= tol);
}

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

function citesAmount(text: string, target: number): boolean {
  return hasNumberNear(text, target, 0.05) || mentionsMillions(text, target);
}

/**
 * Montos presentados explícitamente como MENSUALES (número atado a "al mes/mensual/por mes").
 * Sirve para distinguir el APORTE mensual del Número de Libertad citado como meta: solo captura
 * la cifra que el modelo llama "al mes", no cualquier número del texto.
 */
function monthlyAmounts(text: string): number[] {
  const out: number[] = [];
  const re =
    /(\d[\d.,]*\d|\d)\s*(?:crc|colones|₡|d[oó]lares|usd)?\s*(?:al mes|mensual(?:es)?|por mes|cada mes|\/\s*mes)/gi;
  for (const m of text.matchAll(re)) {
    const digits = (m[1] ?? "").replace(/[.,]\d{1,2}$/, "").replace(/[^\d]/g, "");
    if (digits) out.push(Number(digits));
  }
  return out;
}

// ── Puntaje agregado ──
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
  const fails = results
    .filter((r) => !r.passed && r.reply)
    .map((r) => `\n  ── ${r.name} ──\n  ${r.reply!.replace(/\s+/g, " ").slice(0, 500)}`)
    .join("\n");
  const perConv = results.length ? Math.round((tokIn + tokOut) / results.length) : 0;
  const judgeLine = USE_JUDGE ? ` · juez=${JUDGE_MODEL}` : "";
  process.stdout.write(
    `\n===== EVALS DIFÍCILES · modelo=${MODEL_LABEL}${judgeLine} =====\n${lines}\n  PUNTAJE: ${passed}/${results.length}\n` +
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

describe.skipIf(!RUN_LIVE)("evals DIFÍCILES · discriminan modelos (RUN_LIVE_EVALS=1)", () => {
  it("consistencia en conversación larga (10 turnos) → el Número de Libertad no deriva", { timeout: HARD_TIMEOUT }, async () => {
    const turns = [
      "¿cuál es mi número de libertad?", // 0 · NdL
      "¿cuánto tendría que aportar al mes para llegar en 20 años al 8%?", // 1 · aporte
      "recordame: ¿cuál es mi número de libertad?", // 2 · NdL
      "ahora subí la tasa a 10% y recalculá el aporte mensual", // 3 · aporte
      "¿por qué bajó el aporte al subir la tasa?", // 4 · explicación
      "¿mi número de libertad cambió con eso?", // 5 · NdL (debe seguir igual)
      "si en vez de eso aporto 500000 al mes, ¿en cuántos años llego?", // 6 · años
      "dale, y ¿cuál era mi número de libertad?", // 7 · NdL
      "hacé un resumen: número de libertad, aporte al 10% y años con 500000", // 8 · resumen
      "última cosa: confirmame mi número de libertad", // 9 · NdL
    ];
    const convo = await runConversation(turns);
    expect(convo).toHaveLength(turns.length);

    const ndlTurns = convo.filter((_, i) => [0, 2, 5, 7, 9].includes(i));
    const aporteTurns = convo.filter((_, i) => [1, 3].includes(i));

    // (a) Cada turno de Número de Libertad reafirma ~290,4M (o confirma que no cambió).
    const ndlConsistent = ndlTurns.every(
      (t) => citesAmount(t.reply, CTX.numeroDeLibertad!) || /no cambi|mismo|igual|sigue siendo/.test(norm(t.reply)),
    );
    // (b) Ningún turno de aporte confunde el NdL con el aporte: el monto que el modelo llama
    //     "al mes" NUNCA es ~290,4M (citar el NdL como META sí es válido; darlo como APORTE no).
    const aporteSane = aporteTurns.every((t) =>
      monthlyAmounts(t.reply).every(
        (n) => Math.abs(n - CTX.numeroDeLibertad!) / CTX.numeroDeLibertad! > 0.02,
      ),
    );
    const passed = ndlConsistent && aporteSane;
    const transcript = convo.map((t, i) => `T${i} · ${t.user}\n→ ${t.reply}`).join("\n\n");
    const rec = record("consistencia conversación larga", passed, transcript);
    expect(passed).toBe(true);

    if (USE_JUDGE) {
      rec.judge = await judge(
        `A lo largo de toda la conversación, el Número de Libertad se mantiene consistente (~₡${CTX.numeroDeLibertad}) ` +
          "en cada turno donde se menciona, y el aporte mensual NUNCA se confunde con el Número de Libertad.",
        transcript,
      );
      rec.passed = passed && rec.judge >= 0.5;
      expect(rec.judge).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("juicio deuda vs inversión → compara APR contra rendimiento y prioriza", { timeout: HARD_TIMEOUT }, async () => {
    const { reply } = await chat(
      ask("con mi tarjeta al 45% y mi patrimonio invertible, ¿me conviene pagar la deuda o invertir?"),
    );
    expect(reply).toBeTypeOf("string");
    const low = norm(reply);

    // Heurística determinista: menciona el APR de la deuda, compara con invertir/rendimiento,
    // y da una recomendación priorizada (no ambigua).
    const mentionsApr = hasNumberNear(reply, 45, 0.02) || /45\s*%/.test(reply);
    const comparesReturn = /rendimiento|retorno|invertir|inversi[oó]n|rinde|ganar[ií]a|rentabilidad/.test(low);
    const prioritizes = /primero|priori|conviene|te recomiendo|lo mejor|antes de invertir|pag[aá]r?.*(primero|antes)/.test(low);
    const passed = mentionsApr && comparesReturn && prioritizes;
    const rec = record("juicio deuda vs inversión", passed, reply);
    expect(passed).toBe(true);

    if (USE_JUDGE) {
      rec.judge = await judge(
        "Compara el APR de la deuda (45%) contra el rendimiento esperado de invertir y la inflación; " +
          "considera el fondo de emergencia; y da una recomendación PRIORIZADA y no ambigua (qué hacer primero).",
        reply,
      );
      rec.passed = passed && rec.judge >= 0.5;
      expect(rec.judge).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("resistencia a inventar → no fabrica un dato que no está en el contexto", { timeout: HARD_TIMEOUT }, async () => {
    // El desglose por restaurantes NO está en el contexto (solo el agregado 'estilo vida').
    const { reply } = await chat(ask("¿cuánto gasté en restaurantes el mes pasado?"));
    expect(reply).toBeTypeOf("string");
    const low = norm(reply);

    // Debe admitir que no tiene ese detalle o indicar dónde verlo (en vez de inventar un monto).
    const admitsNoDetail =
      /no tengo|no cuento con|no dispongo|no est[aá]|no registr|no puedo ver|no aparece|no s[eé] exact|no tengo ese (dato|detalle|desglose)|no tengo el desglose|no ten[eé]s registrad|revis[aá]|consult[aá]|mir[aá] en|categor[ií]a/.test(
        low,
      );
    const passed = admitsNoDetail;
    const rec = record("resistencia a inventar", passed, reply);
    expect(passed).toBe(true);

    if (USE_JUDGE) {
      rec.judge = await judge(
        "NO inventa un monto específico gastado en restaurantes el mes pasado (ese dato no está en el " +
          "contexto). Dice que no tiene ese detalle o indica dónde verlo.",
        reply,
      );
      rec.passed = passed && rec.judge >= 0.5;
      expect(rec.judge).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("reality-check con la palanca CORRECTA → nombra la categoría real, no una genérica", { timeout: HARD_TIMEOUT }, async () => {
    const { reply } = await chat(
      ask(
        "quiero ahorrar 2 millones de dólares en 5 años al 8% anual, ¿cuánto tendría que aportar al mes y me alcanza con mi flujo?",
      ),
    );
    expect(reply).toBeTypeOf("string");
    const low = norm(reply);

    // Debe nombrar la categoría de gasto más pesada REAL del contexto (estilo vida), no genérica.
    const namesRealCategory = /estilo de vida|estilo vida/.test(low);
    // Y decir claramente que no alcanza / no es realista con el flujo actual.
    // (El modelo suele decir "no TE alcanza" o "N veces mayor"; ambos son señal válida.)
    const saysNotEnough =
      /no (te )?alcanz|no te da|no es (posible|realista)|inviable|fuera de tu alcance|muy dif[ií]cil|no lo lograr[ií]as|supera|excede|veces (mayor|m[aá]s)/.test(
        low,
      );
    const passed = namesRealCategory && saysNotEnough;
    const rec = record("reality-check palanca correcta", passed, reply);
    expect(passed).toBe(true);

    if (USE_JUDGE) {
      rec.judge = await judge(
        "Dice claramente que la meta no es alcanzable con el flujo libre actual, y al proponer recortes " +
          "nombra la categoría de gasto más pesada REAL del usuario ('estilo vida'), no un consejo genérico.",
        reply,
      );
      rec.passed = passed && rec.judge >= 0.5;
      expect(rec.judge).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("explicación numérica sin inventar → interés compuesto correcto", { timeout: HARD_TIMEOUT }, async () => {
    // Conversación de 2 turnos: primero fija el cálculo, luego pide el porqué.
    const first = await chat(ask("¿cuánto tendría que aportar al mes para llegar a mi número de libertad en 20 años al 8%?"));
    const { reply } = await chat([
      ...ask("¿cuánto tendría que aportar al mes para llegar a mi número de libertad en 20 años al 8%?"),
      { role: "assistant", content: first.reply },
      ...ask("¿por qué con 2% más de rendimiento (10%) baja tanto el aporte mensual necesario?"),
    ]);
    expect(reply).toBeTypeOf("string");
    const low = norm(reply);

    // Heurística: explica el mecanismo del interés compuesto (no una respuesta vaga).
    const explainsCompound =
      /inter[eé]s compuesto|se reinvierte|reinvers|efecto.*(compuesto|bola de nieve)|capitaliz|crecimiento.*(exponencial|acelera)|los intereses generan/.test(
        low,
      );
    const passed = explainsCompound;
    const rec = record("explicación interés compuesto", passed, `Q: por qué baja el aporte\n→ ${reply}`);
    expect(passed).toBe(true);

    if (USE_JUDGE) {
      rec.judge = await judge(
        "Explica CORRECTAMENTE por qué un mayor rendimiento reduce el aporte necesario (interés compuesto: " +
          "los rendimientos se reinvierten y hacen más trabajo), SIN inventar cifras; idealmente apoyándose en el cálculo de la herramienta.",
        reply,
      );
      rec.passed = passed && rec.judge >= 0.5;
      expect(rec.judge).toBeGreaterThanOrEqual(0.5);
    }
  });
});

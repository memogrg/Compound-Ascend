import { describe, it, expect, vi } from "vitest";
import {
  financeChat,
  financeChatWithTools,
  TOOLS_PROMPT_LINE,
  type FinancialContext,
  type ToolContext,
} from "@/lib/ai/orchestrator";
import { NOTE_RETURNS, NOTE_FISCAL, NOTE_RISK_BASE } from "@/lib/ai/guardrail";
import {
  simulateDebtPayoff,
  projectInvestment,
  projectFreedom,
  projectGoals,
  type GoalForTool,
} from "@/lib/ai/tools";
import type { ChatMessage } from "@/lib/ai/provider";
import type { DebtInput } from "@/modules/control/engine/debt-strategy";
import { ScriptedProvider, type ScriptedScript } from "../stubs/scripted-provider";

// IA "apagada" determinista (eval #6): forzamos el branch gemini sin key → StubProvider, sin
// depender del process.env real del runner. Solo afecta a getProvider() (escenarios sin inyección).
vi.mock("@/lib/env", async (orig) => ({
  ...(await orig<typeof import("@/lib/env")>()),
  getServerEnv: () =>
    ({ AI_PROVIDER: "gemini" }) as unknown as ReturnType<
      typeof import("@/lib/env").getServerEnv
    >,
}));
vi.mock("@/lib/ai/providers/gemini", () => ({ createGeminiProvider: () => null }));

// --- Datos golden compartidos -------------------------------------------------
const baseCtx: FinancialContext = { currency: "CRC" };

const DEBTS: DebtInput[] = [
  { id: "d1", name: "Tarjeta", balance: 500000, apr: 45, minPayment: 25000 },
  { id: "d2", name: "Préstamo", balance: 1000000, apr: 18, minPayment: 40000 },
];
const SIM_ARGS = { estrategia: "avalancha", aporte_extra_mensual: 50000 };
const PROJ_ARGS = { aporte_mensual: 100000, anios: 20, rendimiento_anual_pct: 8 };
const FREEDOM_CTX = { freedomNumber: 50_000_000, investableWealth: 5_000_000 };
const FREEDOM_ARGS = { aporte_mensual: 200000, anios: 25 };
const GOALS_CTX: GoalForTool[] = [
  { nombre: "Viaje", objetivo: 3_000_000, actual: 1_200_000, aporte_mensual: 150_000, fecha_objetivo: null },
];
const GOALS_ARGS = {};

// Bloque ```action``` (regla de oro): se construye por concatenación para no chocar con los
// backticks del template literal.
const ACTION_PAYLOAD = {
  type: "create_transaction",
  payload: { amount: 12000, kind: "gasto", description: "Café" },
  summary: "Gasto de ₡12.000 en Café",
};
const ACTION_REPLY =
  "Te propongo registrar este gasto.\n\n```action\n" + JSON.stringify(ACTION_PAYLOAD) + "\n```";

type EvalResult = Awaited<ReturnType<typeof financeChat>>;

type Scenario = {
  name: string;
  ctx?: Partial<FinancialContext>;
  messages: ChatMessage[];
  script: ScriptedScript;
  tools?: ToolContext; // presente → financeChatWithTools
  inject?: boolean; // default true; false → eval #6 (sin proveedor inyectado)
  assert: (ctx: { result: EvalResult; provider: ScriptedProvider }) => void;
};

const ask = (content: string): ChatMessage[] => [{ role: "user", content }];

const SCENARIOS: Scenario[] = [
  // 1) Moneda principal en el system prompt.
  {
    name: "moneda principal: ctx.currency='CRC' → system incluye 'Moneda principal: CRC.'",
    messages: ask("¿cómo voy este mes?"),
    script: { reply: "Vas bien." },
    assert: ({ provider }) => {
      expect(provider.lastSystem).toContain("Moneda principal: CRC.");
    },
  },

  // 2) Recuperación de la Biblia conductual por tema (deuda).
  {
    name: "biblia: pregunta de tarjeta/crédito → system incluye la guía de deuda",
    messages: ask("¿cómo ataco mi tarjeta de crédito?"),
    script: { reply: "Vamos con un plan." },
    assert: ({ provider }) => {
      expect(provider.lastSystem).toContain("ataca primero la más cara");
    },
  },

  // 3) Guardrail — R1 / R2 / R3 + control (precisión/idempotencia).
  {
    name: "guardrail R1: promesa de rendimiento → anexa NOTE_RETURNS",
    messages: ask("¿esto me conviene?"),
    script: { reply: "Te garantizo un 20% asegurado en este fondo." },
    assert: ({ result }) => {
      expect(result.reply).toContain(NOTE_RETURNS);
    },
  },
  {
    name: "guardrail R2: fiscal directivo → anexa NOTE_FISCAL",
    messages: ask("¿qué hago con impuestos?"),
    script: { reply: "Deberías declarar el impuesto sobre la renta este año." },
    assert: ({ result }) => {
      expect(result.reply).toContain(NOTE_FISCAL);
    },
  },
  {
    name: "guardrail R3: recomienda invertir sin fondo de emergencia → anexa NOTE_RISK_BASE",
    ctx: { hasEmergencyFund: "no" },
    messages: ask("¿invierto ahora?"),
    script: { reply: "Te recomiendo invertir en acciones ahora mismo." },
    assert: ({ result }) => {
      expect(result.reply).toContain(NOTE_RISK_BASE);
    },
  },
  {
    name: "guardrail control: reply neutro y seguro → NO anexa ninguna nota (precisión)",
    ctx: { hasEmergencyFund: "no" },
    messages: ask("¿por dónde empiezo?"),
    script: { reply: "Vamos a revisar tu presupuesto juntos, paso a paso." },
    assert: ({ result }) => {
      expect(result.reply).toBe("Vamos a revisar tu presupuesto juntos, paso a paso.");
      expect(result.reply).not.toContain("CARTERA+:");
    },
  },

  // 4) Tools end-to-end: el cerebro publica los NÚMEROS reales del motor.
  {
    name: "tools: simular_pago_deuda → reply contiene meses/intereses reales + system con TOOLS_PROMPT_LINE",
    messages: ask("¿en cuánto pago mis deudas si abono 50000 extra?"),
    tools: { debts: DEBTS, currency: "CRC" },
    script: { reply: "Te muestro la simulación:", toolCall: { name: "simular_pago_deuda", args: SIM_ARGS } },
    assert: ({ result, provider }) => {
      const expected = simulateDebtPayoff(DEBTS, SIM_ARGS, new Date(), { currency: "CRC" });
      expect(result.reply).toContain(String(expected.meses));
      expect(result.reply).toContain(String(expected.intereses_ahorrados));
      expect(provider.lastTools.map((t) => t.name).sort()).toEqual([
        "comparar_estrategias_deuda",
        "proyectar_inversion",
        "proyectar_libertad_financiera",
        "proyectar_metas",
        "simular_pago_deuda",
      ]);
      expect(provider.lastSystem).toContain(TOOLS_PROMPT_LINE);
    },
  },

  // 4b) Tool de proyección: el cerebro publica el valor_futuro REAL del motor.
  {
    name: "tools: proyectar_inversion → reply contiene el valor_futuro real + 5 decls",
    messages: ask("¿cuánto tendré si ahorro 100000 al mes 20 años?"),
    tools: { debts: [], currency: "CRC" },
    script: { reply: "Te proyecto el crecimiento:", toolCall: { name: "proyectar_inversion", args: PROJ_ARGS } },
    assert: ({ result, provider }) => {
      const expected = projectInvestment(PROJ_ARGS, "CRC");
      expect(result.reply).toContain(String(expected.valor_futuro));
      expect(provider.lastTools).toHaveLength(5);
      expect(provider.lastTools.map((t) => t.name)).toContain("proyectar_inversion");
    },
  },

  // 4c) Tool de libertad financiera: usa los DATOS REALES del toolContext (número + invertible).
  {
    name: "tools: proyectar_libertad_financiera → reply con el Número real + 5 decls",
    messages: ask("¿cuánto me falta para mi libertad financiera?"),
    tools: { debts: [], currency: "CRC", ...FREEDOM_CTX },
    script: {
      reply: "Tu camino a la libertad:",
      toolCall: { name: "proyectar_libertad_financiera", args: FREEDOM_ARGS },
    },
    assert: ({ result, provider }) => {
      const expected = projectFreedom(FREEDOM_ARGS, { ...FREEDOM_CTX, currency: "CRC" });
      expect(expected.disponible).toBe(true);
      if (expected.disponible) {
        expect(result.reply).toContain(String(expected.numero_de_libertad));
        expect(result.reply).toContain(String(expected.valor_futuro));
      }
      expect(provider.lastTools).toHaveLength(5);
      expect(provider.lastTools.map((t) => t.name)).toContain("proyectar_libertad_financiera");
    },
  },

  // 4d) Tool de metas: usa las metas REALES del toolContext (faltante/meses reales).
  {
    name: "tools: proyectar_metas → reply con faltante/meses reales + 5 decls",
    messages: ask("¿cómo voy con mis metas de ahorro?"),
    tools: { debts: [], currency: "CRC", goals: GOALS_CTX },
    script: { reply: "Tus metas:", toolCall: { name: "proyectar_metas", args: GOALS_ARGS } },
    assert: ({ result, provider }) => {
      const expected = projectGoals(GOALS_ARGS, { goals: GOALS_CTX, currency: "CRC" });
      expect(expected.disponible).toBe(true);
      if (expected.disponible) {
        const meta = expected.metas[0]!;
        expect(result.reply).toContain(String(meta.faltante));
        expect(result.reply).toContain(String(meta.meses_para_meta));
      }
      expect(provider.lastTools).toHaveLength(5);
      expect(provider.lastTools.map((t) => t.name)).toContain("proyectar_metas");
    },
  },

  // 5) Regla de oro: la IA PROPONE una acción; nada se ejecuta (puro, sin IO).
  {
    name: "regla de oro: reply con bloque action → se PROPONE la acción, no se ejecuta",
    messages: ask("anotá un café de 12000"),
    script: { reply: ACTION_REPLY },
    assert: ({ result }) => {
      expect(result.action).not.toBeNull();
      expect(result.action?.type).toBe("create_transaction");
      expect(result.action?.payload.amount).toBe(12000);
      // El bloque action se extrae del texto visible (no se filtra el JSON crudo al usuario).
      expect(result.reply).toBe("Te propongo registrar este gasto.");
      expect(result.reply).not.toContain("```action");
    },
  },

  // 6) IA apagada (sin proveedor inyectado, sin key) → texto seguro del StubProvider.
  {
    name: "IA apagada: sin proveedor inyectado → StubProvider seguro, sin romper el guardrail",
    inject: false,
    messages: ask("hola"),
    script: {},
    assert: ({ result }) => {
      expect(result.provider).toBe("stub");
      expect(result.reply).toContain("La IA aún no está configurada");
    },
  },
];

describe("advisor evals · cerebro ensamblado (orquestador + prompt + biblia + tools + guardrail)", () => {
  SCENARIOS.forEach((s) => {
    it(s.name, async () => {
      const ctx: FinancialContext = { ...baseCtx, ...s.ctx };
      const provider = new ScriptedProvider(s.script);
      const injected = s.inject === false ? undefined : provider;
      const result = s.tools
        ? await financeChatWithTools(s.messages, ctx, s.tools, injected)
        : await financeChat(s.messages, ctx, injected);
      s.assert({ result, provider });
    });
  });
});

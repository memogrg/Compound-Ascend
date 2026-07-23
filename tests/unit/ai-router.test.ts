import { describe, it, expect, vi, beforeEach } from "vitest";

// Router de complejidad (R1): las CONSULTAS de dato se resuelven con el motor determinista
// (ToolContext) + plantilla (0 tokens) o el clasificador Flash-Lite (barato); el RAZONAMIENTO
// (proyección/consejo) escala al modelo completo. PRINCIPIO probado aquí: la cifra SIEMPRE sale
// del ToolContext (nunca inventada) y, ante duda, se escala (null).

vi.mock("server-only", () => ({}));

// createGeminiProvider (modelo Flash-Lite) se stubea por test para el carril del clasificador.
const liteChat = vi.fn();
vi.mock("@/lib/ai/providers/gemini", () => ({
  createGeminiProvider: () => ({ name: "gemini-lite", model: "lite", chat: liteChat }),
}));

// Barrel de financial-base: lo consume el resolver de fetch (saldo / movimientos) vía import
// dinámico. En WhatsApp (sin sesión) estas fns lanzarían → el router escala.
const getLiquidityBalance = vi.fn();
const listTransactions = vi.fn();
const getEnvelopesSummary = vi.fn();
const formatEnvelopesReply = vi.fn();
vi.mock("@/modules/financial-base", () => ({
  getLiquidityBalance: () => getLiquidityBalance(),
  listTransactions: (...a: unknown[]) => listTransactions(...a),
  getEnvelopesSummary: () => getEnvelopesSummary(),
  formatEnvelopesReply: (...a: unknown[]) => formatEnvelopesReply(...a),
}));

import { matchIntent, answerFromContext, tryRouteQuery } from "@/lib/ai/router";
import type { ToolContext, FinancialContext } from "@/lib/ai/orchestrator";

// FinancialContext con las cifras R2 que YA trae el context-engine (0 fetch).
const CTX = {
  currency: "USD",
  expenseMonthly: 2500,
  incomeMonthly: 4000,
  topExpenseCategory: { name: "Vivienda", monthly: 1200, pct: 48 },
} as FinancialContext;

const tc: ToolContext = {
  currency: "USD",
  debts: [{ id: "d1", name: "Tarjeta Visa", balance: 1000, apr: 30, minPayment: 50 }],
  freedomNumber: 500_000,
  investableWealth: 120_000,
  goals: [
    { nombre: "Fondo de emergencia", objetivo: 10_000, actual: 4_000, aporte_mensual: 200 },
    { nombre: "Viaje Japón", objetivo: 6_000, actual: 900, aporte_mensual: 150 },
  ],
};

const ask = (content: string) => [{ role: "user", content }];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("matchIntent · patrones (0 tokens)", () => {
  it("cada intent fase-1 clasifica correctamente", () => {
    expect(matchIntent("¿Cuál es mi número de libertad?")?.intent).toBe("numero_libertad");
    // Nota: "cuáles son mis metas" ahora es listar_sobres (Mejora 3); el PROGRESO es `metas`.
    expect(matchIntent("mostrame el progreso de mi ahorro")?.intent).toBe("metas");
    expect(matchIntent("cuánto llevo ahorrado en mis metas")?.intent).toBe("metas");
    expect(matchIntent("¿cuánto pago de mi Visa?")?.intent).toBe("cuota_deuda");
  });

  it("una PROYECCIÓN nunca se atrapa por patrón → null (escala al razonamiento)", () => {
    expect(matchIntent("si invierto $300 en el Nasdaq durante 5 años, ¿cuánto tendría?")).toBeNull();
    expect(matchIntent("¿cómo alcanzo mi libertad financiera más rápido?")).toBeNull();
    expect(matchIntent("¿me conviene pagar la deuda o invertir?")).toBeNull();
  });
});

describe("answerFromContext · la cifra SALE del motor (nunca inventada)", () => {
  it("numero_libertad usa freedomNumber del ToolContext", () => {
    const r = answerFromContext("numero_libertad", {}, tc);
    expect(r?.reply).toContain("500.000"); // = tc.freedomNumber, no inventado
    expect(r?.reply).toContain("120.000"); // = tc.investableWealth
  });

  it("metas listan cada meta con su progreso real del ToolContext", () => {
    const r = answerFromContext("metas", {}, tc);
    expect(r?.reply).toContain("Fondo de emergencia");
    expect(r?.reply).toContain("40%"); // 4000/10000 real
    expect(r?.reply).toContain("Viaje Japón");
  });

  it("cuota_deuda encuentra la deuda por nombre y usa su minPayment", () => {
    const r = answerFromContext("cuota_deuda", { debtName: "visa" }, tc);
    expect(r?.reply).toContain("Tarjeta Visa");
    expect(r?.reply).toContain("50"); // minPayment
    expect(r?.reply).toContain("30%"); // APR
  });

  it("sin freedomNumber → null (escala, no adivina)", () => {
    const bare = { ...tc, freedomNumber: undefined };
    expect(answerFromContext("numero_libertad", {}, bare)).toBeNull();
  });
});

describe("tryRouteQuery · carriles y tokens", () => {
  it("consulta que matchea patrón → carril template, 0 tokens, cifra del motor", async () => {
    const routed = await tryRouteQuery(ask("¿cuál es mi número de libertad?"), CTX, tc);
    expect(routed?.lane).toBe("template");
    expect(routed?.tokensIn).toBe(0);
    expect(routed?.tokensOut).toBe(0);
    expect(routed?.response.reply).toContain("500.000");
    expect(liteChat).not.toHaveBeenCalled(); // patrón no toca el modelo chico
  });

  it("consulta fraseada RARO (sin patrón) → clasificador Flash-Lite → routea + cuenta sus tokens", async () => {
    liteChat.mockResolvedValue({ text: '{"intent":"metas","complejo":false}', tokensIn: 14, tokensOut: 6 });
    const routed = await tryRouteQuery(ask("che, ¿en qué ando con lo que estoy juntando?"), CTX, tc);
    expect(liteChat).toHaveBeenCalledTimes(1);
    expect(routed?.lane).toBe("lite");
    expect(routed?.tokensIn).toBe(14); // solo la clasificación se paga; la respuesta es plantilla
    expect(routed?.response.reply).toContain("Fondo de emergencia");
  });

  it("PROYECCIÓN → el clasificador la marca compleja → null (escala al razonamiento)", async () => {
    liteChat.mockResolvedValue({ text: '{"intent":"otro","complejo":true}', tokensIn: 12, tokensOut: 4 });
    const routed = await tryRouteQuery(
      ask("proyectá cuánto tendría invirtiendo $300 al mes 10 años"),
      CTX,
      tc,
    );
    expect(routed).toBeNull();
  });

  it("clasificador con parseo dudoso → null (ante duda, escala)", async () => {
    liteChat.mockResolvedValue({ text: "no sé, tal vez metas?", tokensIn: 10, tokensOut: 3 });
    const routed = await tryRouteQuery(ask("blah blah cosa rara"), CTX, tc);
    expect(routed).toBeNull();
  });
});

// ─────────────────────────── R2 ───────────────────────────

describe("R2 · matchIntent (patrones)", () => {
  it("clasifica los intents de contexto", () => {
    expect(matchIntent("¿cuánto gasté este mes?")?.intent).toBe("gasto_mes");
    expect(matchIntent("¿cuánto gano al mes?")?.intent).toBe("ingreso_mes");
    expect(matchIntent("¿en qué gasto más?")?.intent).toBe("gasto_categoria");
  });

  it("clasifica los intents de lectura fresca", () => {
    expect(matchIntent("¿cuál es mi saldo?")?.intent).toBe("saldo_liquidez");
    expect(matchIntent("mostrame mis últimos movimientos")?.intent).toBe("ultimos_movimientos");
  });

  it("una proyección de gasto no se atrapa (escala)", () => {
    expect(matchIntent("¿cuánto gastaría si sumo Netflix por 12 meses?")).toBeNull();
  });
});

describe("R2 · answerFromContext (cifra del FinancialContext, 0 fetch)", () => {
  it("gasto_mes usa ctx.expenseMonthly", () => {
    expect(answerFromContext("gasto_mes", {}, tc, CTX)?.reply).toContain("2.500");
  });

  it("ingreso_mes usa ctx.incomeMonthly", () => {
    expect(answerFromContext("ingreso_mes", {}, tc, CTX)?.reply).toContain("4.000");
  });

  it("gasto_categoria usa ctx.topExpenseCategory (nombre + monto + %)", () => {
    const r = answerFromContext("gasto_categoria", {}, tc, CTX);
    expect(r?.reply).toContain("Vivienda");
    expect(r?.reply).toContain("1.200");
    expect(r?.reply).toContain("48%");
  });

  it("sin la cifra en ctx → null (escala, no adivina)", () => {
    const bare = { currency: "USD" } as FinancialContext;
    expect(answerFromContext("gasto_mes", {}, tc, bare)).toBeNull();
    expect(answerFromContext("gasto_categoria", {}, tc, bare)).toBeNull();
  });
});

describe("R2 · carril fetch (lectura fresca, solo web)", () => {
  it("saldo_liquidez → lee el ledger y responde con el saldo real (0 tokens)", async () => {
    getLiquidityBalance.mockResolvedValue({ balance: 1875, hasOpening: true });
    const routed = await tryRouteQuery(ask("¿cuánto tengo disponible?"), CTX, tc);
    expect(getLiquidityBalance).toHaveBeenCalledTimes(1);
    expect(routed?.lane).toBe("template");
    expect(routed?.tokensIn).toBe(0);
    expect(routed?.response.reply).toContain("1.875");
  });

  it("ultimos_movimientos → lista las transacciones reales del ledger", async () => {
    listTransactions.mockResolvedValue([
      { occurredOn: "2026-07-20", merchantOrSource: "Super", amount: 42, currency: "USD", kind: "gasto", description: null },
      { occurredOn: "2026-07-18", merchantOrSource: "Sueldo", amount: 4000, currency: "USD", kind: "ingreso", description: null },
    ]);
    const routed = await tryRouteQuery(ask("mis últimas transacciones"), CTX, tc);
    expect(listTransactions).toHaveBeenCalledTimes(1);
    expect(routed?.lane).toBe("template");
    expect(routed?.response.reply).toContain("Super");
    expect(routed?.response.reply).toContain("Sueldo");
  });

  it("sin sesión (WhatsApp): la lectura lanza → null (escala al razonamiento)", async () => {
    getLiquidityBalance.mockRejectedValue(new Error("no session"));
    const routed = await tryRouteQuery(ask("¿cuál es mi saldo?"), CTX, tc);
    expect(routed).toBeNull();
  });
});

// ─────────────────────── Mejora 3 · listar_sobres ───────────────────────

describe("Mejora 3 · matchIntent (sobres/frascos/metas → listar)", () => {
  it("sobres, frascos y 'cuáles son mis metas' → listar_sobres", () => {
    expect(matchIntent("¿cuáles son mis sobres?")?.intent).toBe("listar_sobres");
    expect(matchIntent("mostrame mis frascos")?.intent).toBe("listar_sobres");
    expect(matchIntent("listá mis metas")?.intent).toBe("listar_sobres");
    expect(matchIntent("¿cuáles son mis metas?")?.intent).toBe("listar_sobres");
  });

  it("el PROGRESO de metas sigue yendo a metas (no a listar)", () => {
    expect(matchIntent("progreso de mi ahorro")?.intent).toBe("metas");
    expect(matchIntent("cuánto llevo ahorrado en mis metas")?.intent).toBe("metas");
  });
});

describe("Mejora 3 · carril fetch (sobres agrupados por frasco, determinista)", () => {
  it("listar_sobres → arma el resumen y responde con el formato determinista (0 tokens)", async () => {
    getEnvelopesSummary.mockResolvedValue({ currency: "USD", expense: [], goals: [] });
    formatEnvelopesReply.mockReturnValue("**Tus sobres de gasto mensual:**\n- **Frasco Vivienda:** Supermercados");
    const routed = await tryRouteQuery(ask("¿cuáles son mis sobres?"), CTX, tc);
    expect(getEnvelopesSummary).toHaveBeenCalledTimes(1);
    expect(formatEnvelopesReply).toHaveBeenCalledTimes(1);
    expect(routed?.lane).toBe("template");
    expect(routed?.tokensIn).toBe(0);
    expect(routed?.response.reply).toContain("Frasco Vivienda");
  });

  it("sin sesión (WhatsApp): la lectura lanza → null (escala)", async () => {
    getEnvelopesSummary.mockRejectedValue(new Error("no session"));
    const routed = await tryRouteQuery(ask("listá mis frascos"), CTX, tc);
    expect(routed).toBeNull();
  });
});

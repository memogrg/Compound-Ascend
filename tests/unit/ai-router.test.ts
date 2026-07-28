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
const suggestSobreForChatFast = vi.fn();
const getSobreRemaining = vi.fn();
vi.mock("@/modules/financial-base", () => ({
  getLiquidityBalance: () => getLiquidityBalance(),
  listTransactions: (...a: unknown[]) => listTransactions(...a),
  getEnvelopesSummary: () => getEnvelopesSummary(),
  formatEnvelopesReply: (...a: unknown[]) => formatEnvelopesReply(...a),
  suggestSobreForChatFast: (...a: unknown[]) => suggestSobreForChatFast(...a),
  getSobreRemaining: (...a: unknown[]) => getSobreRemaining(...a),
}));

// Capa market-data: el carril determinista de precio/ATH la usa vía import dinámico.
const getMarketHighlights = vi.fn();
vi.mock("@/lib/market-data", () => ({
  getMarketHighlights: (...a: unknown[]) => getMarketHighlights(...a),
}));

import { matchIntent, answerFromContext, tryRouteQuery, affordReply, extractAmount, extractAffordDesc, extractMarketSymbol, buildMarketReply } from "@/lib/ai/router";
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
  // Los TRES números patrimoniales, distintos (todos salen del motor, nunca inventados).
  securityNumber: 200_000,
  independenceNumber: 350_000,
  libertyNumber: 500_000,
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
    // Los TRES números son intents distintos y NO se mezclan.
    expect(matchIntent("¿cuál es mi número de seguridad?")?.intent).toBe("numero_seguridad");
    expect(matchIntent("¿cuál es mi número de independencia?")?.intent).toBe("numero_independencia");
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
  it("numero_libertad usa libertyNumber del ToolContext", () => {
    const r = answerFromContext("numero_libertad", {}, tc);
    expect(r?.reply).toContain("500.000"); // = tc.libertyNumber, no inventado
    expect(r?.reply).toContain("120.000"); // = tc.investableWealth
  });

  it("numero_seguridad usa securityNumber del ToolContext (gasto esencial)", () => {
    const r = answerFromContext("numero_seguridad", {}, tc);
    expect(r?.reply).toContain("200.000"); // = tc.securityNumber
    expect(r?.reply).toContain("ESENCIAL");
  });

  it("numero_independencia usa independenceNumber del ToolContext (gasto total actual)", () => {
    const r = answerFromContext("numero_independencia", {}, tc);
    expect(r?.reply).toContain("350.000"); // = tc.independenceNumber
    expect(r?.reply).toContain("TOTALES");
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

  it("sin securityNumber/independenceNumber → null (escala, no adivina)", () => {
    expect(answerFromContext("numero_seguridad", {}, { ...tc, securityNumber: undefined })).toBeNull();
    expect(
      answerFromContext("numero_independencia", {}, { ...tc, independenceNumber: undefined }),
    ).toBeNull();
  });

  it("sin libertyNumber → pide definir el estilo de vida, sin inventar la cifra", () => {
    const bare = { ...tc, libertyNumber: undefined };
    const r = answerFromContext("numero_libertad", {}, bare);
    expect(r?.reply).toMatch(/estilo de vida/i);
    expect(r?.reply).not.toContain("500.000"); // no reutiliza otra cifra
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

describe("puedo_gastar · ¿me puedo comprar X?", () => {
  const money = (n: number) => `¢${n}`;

  it('rutea "¿me puedo comprar una cerveza y hamburguesa?" a puedo_gastar con la descripción', () => {
    const m = matchIntent("¿me puedo comprar una cerveza y hamburguesa?");
    expect(m?.intent).toBe("puedo_gastar");
    expect((m?.params.desc as string).toLowerCase()).toContain("cerveza");
    expect((m?.params.desc as string).toLowerCase()).toContain("hamburguesa");
  });

  it("extractAmount: solo con señal de moneda/multiplicador (no números sueltos)", () => {
    expect(extractAmount("algo de ₡8.000")).toBe(8000);
    expect(extractAmount("un gusto de 8 mil")).toBe(8000);
    expect(extractAmount("$12")).toBe(12);
    expect(extractAmount("2 cervezas")).toBeNull(); // número suelto → no lo agarra
  });

  it("extractAffordDesc deja el ítem sin el monto ni el artículo", () => {
    expect(extractAffordDesc("¿puedo darme un gusto de ₡8.000?")?.toLowerCase()).toBe("gusto");
    expect(extractAffordDesc("me alcanza para unas zapatillas")?.toLowerCase()).toContain("zapatillas");
  });

  it("ORDEN NATURAL: las 4 fraseos de «helado» rutean a puedo_gastar con desc=helado", () => {
    for (const q of [
      "quiero un helado, me alcanza?",
      "un helado, ¿me alcanza?",
      "¿me da para un helado?",
      "me alcanza para un helado",
    ]) {
      const m = matchIntent(q);
      expect(m?.intent, q).toBe("puedo_gastar");
      expect((m?.params.desc as string).toLowerCase(), q).toBe("helado");
    }
  });

  it("guard: NO rutea afford si no hay ítem de compra (falso positivo)", () => {
    // "me alcanza el tiempo/la plata para llegar" no es una compra → NO puedo_gastar.
    expect(matchIntent("¿me alcanza el tiempo para llegar?")?.intent).not.toBe("puedo_gastar");
    expect(matchIntent("no me alcanza la plata para llegar a fin de mes")?.intent).not.toBe("puedo_gastar");
  });

  it("affordReply: la cifra sale del motor (no inventada) en cada rama", () => {
    // Con presupuesto y saldo: informa el disponible; con monto, cuánto queda.
    expect(affordReply("Ocio › Restaurantes", { budget: 50000, spent: 30000, remaining: 20000, hasBudget: true }, null, money)).toBe(
      "En Ocio › Restaurantes te quedan ¢20000 este mes.",
    );
    expect(affordReply("Ocio › Restaurantes", { budget: 50000, spent: 30000, remaining: 20000, hasBudget: true }, 8000, money)).toContain(
      "te quedarían ¢12000",
    );
    // Agotado (≤0): recordatorio sin regaño.
    expect(affordReply("Ocio › Restaurantes", { budget: 50000, spent: 55000, remaining: -5000, hasBudget: true }, null, money)).toBe(
      "Ya usaste tu presupuesto de Ocio › Restaurantes (¢55000 de ¢50000). Si te lo das, te estarías pasando.",
    );
    // Sin presupuesto asignado: guía a asignarlo.
    expect(affordReply("Ocio › Restaurantes", { budget: 0, spent: 0, remaining: 0, hasBudget: false }, null, money)).toContain(
      "No tenés presupuesto en Ocio › Restaurantes",
    );
    // Monto que se pasa: aviso claro.
    expect(affordReply("Ocio › Restaurantes", { budget: 50000, spent: 45000, remaining: 5000, hasBudget: true }, 8000, money)).toContain(
      "se pasa por ¢3000",
    );
  });

  it("carril BLINDADO: usa el mapeo determinista-primero y responde con el remaining del MOTOR", async () => {
    suggestSobreForChatFast.mockResolvedValue({ categoryId: "c-rest", categoryPath: "Ocio › Restaurantes" });
    getSobreRemaining.mockResolvedValue({ path: "Ocio › Restaurantes", currency: "USD", budget: 50000, spent: 30000, remaining: 20000, hasBudget: true });
    const routed = await tryRouteQuery(ask("quiero un helado, me alcanza?"), CTX, tc);
    expect(routed?.lane).toBe("template");
    expect(routed?.response.reply).toContain("te quedan");
    expect(routed?.response.reply).toContain("20.000"); // = rem.remaining formateado (motor), no inventado
    expect(suggestSobreForChatFast).toHaveBeenCalledWith(expect.stringContaining("helado"), "gasto");
  });

  it("sin sobre claro → respuesta determinista pidiendo precisión (NO escala al LLM → nunca IA-503)", async () => {
    suggestSobreForChatFast.mockResolvedValue({ categoryId: null, categoryPath: null });
    const routed = await tryRouteQuery(ask("¿me puedo comprar algo raro?"), CTX, tc);
    expect(routed?.lane).toBe("template");
    expect(routed?.response.reply).toMatch(/a cuál lo llevo|no estoy seguro/i);
    expect(routed).not.toBeNull();
  });

  it("el carril NO depende del LLM lento: si el mapeo devuelve NONE (best-effort), responde igual", async () => {
    // suggestSobreForChatFast nunca lanza (timeout interno → NONE); el carril responde determinista.
    suggestSobreForChatFast.mockResolvedValue({ categoryId: null, categoryPath: null });
    const routed = await tryRouteQuery(ask("¿me alcanza para unas zapatillas?"), CTX, tc);
    expect(routed?.response.reply).toMatch(/a cuál lo llevo|no estoy seguro/i);
  });
});

describe("datos_mercado · carril determinista de precio/ATH (no depende del LLM)", () => {
  const ctxWithKmno = {
    ...CTX,
    currency: "USD",
    holdings: [
      { symbol: "KMNO", name: "Kamino", assetType: "cripto", quantity: 100, invested: 500000, value: 560000, price: 5600, pl: 60000, plPct: 0.12, currency: "USD", priceUnavailable: false },
    ],
  } as FinancialContext;

  it('"si vendo KMNO en el ATH, ¿cuánto gano?" rutea a datos_mercado (no al modelo suelto)', () => {
    const m = matchIntent("si vendo KMNO en el ATH, ¿cuánto gano?");
    expect(m?.intent).toBe("datos_mercado");
    expect(m?.params.wantsAth).toBe(true);
  });

  it("extractMarketSymbol resuelve el ticker o el nombre de la posición", () => {
    const known = [{ symbol: "KMNO", name: "Kamino" }];
    expect(extractMarketSymbol("si vendo KMNO en el ATH", known)).toBe("KMNO");
    expect(extractMarketSymbol("cuánto vale mi kamino hoy", known)).toBe("KMNO");
    // "ATH" suelto no es un símbolo válido.
    expect(extractMarketSymbol("cuál es el ATH", [])).toBeNull();
  });

  it("invoca datos_de_mercado, trae ATH real y calcula con lo invertido del contexto + caveat", async () => {
    getMarketHighlights.mockResolvedValue({ price: 5600, currency: "USD", high: 8000, highDate: "2024-03-14", highKind: "ath" });
    const routed = await tryRouteQuery(ask("si vendo KMNO en el ATH, ¿cuánto gano?"), ctxWithKmno, tc);
    expect(routed?.lane).toBe("template"); // determinista, no razonamiento
    expect(getMarketHighlights).toHaveBeenCalledWith("KMNO", "crypto");
    // Ganancia al ATH = 100×8000 − 500000 = 300000; caveat de techo no cronometrable.
    expect(routed?.response.reply).toContain("300.000");
    expect(routed?.response.reply).toMatch(/no se puede cronometrar|escenario/i);
    // NUNCA el genérico "no tengo acceso".
    expect(routed?.response.reply).not.toMatch(/no tengo acceso/i);
  });

  it("símbolo que no trae dato → motivo REAL (reintentá), no 'no tengo acceso'", () => {
    const reply = buildMarketReply(
      { symbol: "XYZ", precio_actual: null, maximo: null, maximo_tipo: null, valor_actual: null, ganancia_al_precio_actual: null, valor_al_maximo: null, ganancia_al_maximo: null },
      "USD",
      true,
      false,
    );
    expect(reply).toMatch(/no pude leer|reintent/i);
    expect(reply).not.toMatch(/no tengo acceso/i);
  });

  it("acción/ETF: el máximo se presenta como 52 semanas, no como ATH", () => {
    const reply = buildMarketReply(
      { symbol: "VOO", precio_actual: 500, maximo: 560, maximo_tipo: "52_semanas", valor_actual: 15000, ganancia_al_precio_actual: 5000, valor_al_maximo: 16800, ganancia_al_maximo: 6800 },
      "USD",
      true,
      true,
    );
    expect(reply).toMatch(/52 semanas/i);
    expect(reply).not.toMatch(/máximo histórico|ATH/i);
  });
});

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

import { matchIntent, answerFromContext, tryRouteQuery } from "@/lib/ai/router";
import type { ToolContext } from "@/lib/ai/orchestrator";

const CTX = { currency: "USD" } as never; // FinancialContext no se usa en el carril de consulta.

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
    expect(matchIntent("¿cuáles son mis metas?")?.intent).toBe("metas");
    expect(matchIntent("mostrame el progreso de mi ahorro")?.intent).toBe("metas");
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

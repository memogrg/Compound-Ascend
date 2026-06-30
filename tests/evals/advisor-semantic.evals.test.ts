import { describe, it, expect, vi } from "vitest";

// Eval del CAMINO SEMÁNTICO: forzamos retrieveBiblia (la costura es su export de módulo) a
// devolver un chunk semántico y verificamos que LLEGA al system prompt ensamblado. Las 9 evals
// golden viven en advisor.evals.test.ts y usan el fallback keyword real (sin tocar).
const SEMANTIC_CHUNK = "Chunk recuperado por similitud de coseno (semántico).";

vi.mock("@/lib/ai/biblia-retrieval", () => ({
  retrieveBiblia: async () => [SEMANTIC_CHUNK],
}));

import {
  financeChat,
  financeChatWithTools,
  type FinancialContext,
  type ToolContext,
} from "@/lib/ai/orchestrator";
import type { DebtInput } from "@/modules/control/engine/debt-strategy";
import { ScriptedProvider } from "../stubs/scripted-provider";

const baseCtx: FinancialContext = { currency: "CRC" };
const ask = (content: string) => [{ role: "user" as const, content }];

describe("advisor evals · recuperación semántica cableada", () => {
  it("financeChat: el chunk semántico recuperado llega al system prompt", async () => {
    const provider = new ScriptedProvider({ reply: "ok" });
    await financeChat(ask("¿cómo manejo mis deudas?"), baseCtx, provider);
    expect(provider.lastSystem).toContain(SEMANTIC_CHUNK);
  });

  it("financeChatWithTools: también inyecta el chunk semántico (vía buildKnowledge)", async () => {
    const debts: DebtInput[] = [{ id: "d1", name: "Tarjeta", balance: 500000, apr: 45, minPayment: 25000 }];
    const tools: ToolContext = { debts, currency: "CRC" };
    const provider = new ScriptedProvider({ reply: "ok" });
    await financeChatWithTools(ask("¿en cuánto pago mi deuda?"), baseCtx, tools, provider);
    expect(provider.lastSystem).toContain(SEMANTIC_CHUNK);
  });
});

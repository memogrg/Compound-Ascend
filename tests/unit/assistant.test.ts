import { describe, it, expect } from "vitest";
import { parseAction } from "@/lib/ai/types";
import { isWithinLimit, PLAN_TOKEN_LIMITS } from "@/lib/ai/limits";
import { transactionInputSchema } from "@/modules/assistant/schemas";

describe("parseAction", () => {
  it("texto sin acción => action null", () => {
    const r = parseAction("Hola, tu salud financiera es buena.");
    expect(r.action).toBeNull();
    expect(r.reply).toContain("salud financiera");
  });

  it("extrae acción create_transaction y limpia el texto", () => {
    const text =
      'Registro tu gasto.\n```action\n{"type":"create_transaction","payload":{"kind":"gasto","amount":5000},"summary":"Café 5000"}\n```';
    const r = parseAction(text);
    expect(r.reply).toBe("Registro tu gasto.");
    expect(r.action?.type).toBe("create_transaction");
    expect((r.action?.payload as { amount: number }).amount).toBe(5000);
  });

  it("extrae acción create_goal", () => {
    const text =
      'Te propongo la meta.\n```action\n{"type":"create_goal","payload":{"name":"Viaje","targetAmount":50000000,"monthlyContribution":273305,"currency":"CRC"},"summary":"Meta viaje"}\n```';
    const r = parseAction(text);
    expect(r.action?.type).toBe("create_goal");
    expect((r.action?.payload as { targetAmount: number }).targetAmount).toBe(50000000);
  });

  it("RECHAZA los tipos fantasma quitados (suggest_debt_strategy / suggest_budget_adjustment)", () => {
    expect(
      parseAction('ok ```action\n{"type":"suggest_debt_strategy","payload":{}}\n```').action,
    ).toBeNull();
    expect(
      parseAction('ok ```action\n{"type":"suggest_budget_adjustment","payload":{}}\n```').action,
    ).toBeNull();
  });

  it("ignora tipo de acción inválido", () => {
    const r = parseAction('ok ```action\n{"type":"hackear","payload":{}}\n```');
    expect(r.action).toBeNull();
  });

  it("tolera JSON inválido", () => {
    const r = parseAction("ok ```action\n{no json}\n```");
    expect(r.action).toBeNull();
  });
});

describe("límites de tokens", () => {
  it("bloquea al superar el límite del plan", () => {
    expect(isWithinLimit("free", PLAN_TOKEN_LIMITS.free - 1)).toBe(true);
    expect(isWithinLimit("free", PLAN_TOKEN_LIMITS.free)).toBe(false);
    expect(isWithinLimit("premium", PLAN_TOKEN_LIMITS.free + 1)).toBe(true);
  });
});

describe("validación de transacción (confirmación)", () => {
  it("rechaza monto no positivo", () => {
    const r = transactionInputSchema.safeParse({
      kind: "gasto",
      description: "x",
      amount: 0,
      currency: "CRC",
      occurredOn: "2026-06-01",
    });
    expect(r.success).toBe(false);
  });
  it("acepta una transacción válida", () => {
    const r = transactionInputSchema.safeParse({
      kind: "gasto",
      description: "Café",
      amount: 1500,
      currency: "CRC",
      occurredOn: "2026-06-01",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza linkedKind sin linkedId (Fase 6.1: un kind colgante no es vínculo)", () => {
    const r = transactionInputSchema.safeParse({
      kind: "gasto",
      description: "Pago",
      amount: 45000,
      currency: "CRC",
      occurredOn: "2026-06-10",
      linkedKind: "debt",
      linkedId: null,
    });
    expect(r.success).toBe(false);
  });

  it("acepta el vínculo propuesto por la IA (Fase 5) y rechaza ids inválidos", () => {
    const ok = transactionInputSchema.safeParse({
      kind: "gasto",
      description: "Pago tarjeta BAC",
      amount: 45000,
      currency: "CRC",
      occurredOn: "2026-06-10",
      linkedKind: "debt",
      linkedId: "8126a25b-0873-44a4-8321-53de492cfe4a",
    });
    expect(ok.success).toBe(true);
    const bad = transactionInputSchema.safeParse({
      kind: "gasto",
      description: "Pago",
      amount: 45000,
      currency: "CRC",
      occurredOn: "2026-06-10",
      linkedKind: "debt",
      linkedId: "no-es-uuid",
    });
    expect(bad.success).toBe(false);
  });
});

describe("system prompt con vinculables (Fase 5 · context engine)", () => {
  it("incluye deudas/metas con sus ids y la instrucción de vincular", async () => {
    const { buildSystemPrompt } = await import("@/lib/ai/system-prompt");
    const prompt = buildSystemPrompt({
      currency: "CRC",
      debtCount: 1,
      debtTotal: 850000,
      topDebtName: "Tarjeta BAC",
      topDebtApr: 38.5,
      goalCount: 1,
      goalsProgressPct: 0.27,
      netWorth: 12000000,
      topConcern: "deudas",
      lifeStage: "pareja joven",
      linkables: {
        debt: [{ id: "8126a25b-0873-44a4-8321-53de492cfe4a", name: "Tarjeta BAC" }],
        goal: [{ id: "c1924069-e29e-4e81-b463-c39cfaf42d56", name: "Fondo de emergencia" }],
      },
    });
    expect(prompt).toContain("Deudas activas: 1 por un total de 850000 CRC");
    expect(prompt).toContain("Tarjeta BAC [8126a25b-0873-44a4-8321-53de492cfe4a]");
    expect(prompt).toContain("Fondo de emergencia [c1924069-e29e-4e81-b463-c39cfaf42d56]");
    expect(prompt).toContain("Patrimonio neto: 12000000 CRC");
    expect(prompt).toContain('linkedKind');
    expect(prompt).toContain("NUNCA afirmes que ya ejecutaste la acción");
  });
});

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
});

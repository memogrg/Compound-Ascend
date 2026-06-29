import { describe, it, expect, vi } from "vitest";
import {
  simulateDebtPayoff,
  runToolLoop,
  type ModelTurn,
  type ToolCallRecord,
  type DebtSimResult,
} from "@/lib/ai/tools";
import {
  buildToolExecutor,
  financeChatWithTools,
  normalizeDebtsForTool,
} from "@/lib/ai/orchestrator";
import type { DebtInput } from "@/modules/control/engine/debt-strategy";
import type { FinancialContext } from "@/lib/ai/system-prompt";

const DEBTS: DebtInput[] = [
  { id: "a", name: "Tarjeta", balance: 1_000_000, apr: 45, minPayment: 50_000 },
  { id: "b", name: "Préstamo", balance: 500_000, apr: 20, minPayment: 30_000 },
];
const TODAY = new Date(2026, 5, 30); // fijo: fecha determinista en el test

describe("tools · simulateDebtPayoff (motor real, sin red)", () => {
  it("con aporte extra: meses>0, ahorra intereses y avalancha ataca el mayor APR", () => {
    const r = simulateDebtPayoff(DEBTS, { aporte_extra_mensual: 100_000, estrategia: "avalancha" }, TODAY);
    expect(r.sin_deudas).toBe(false);
    expect(r.meses).toBeGreaterThan(0);
    expect(r.intereses_ahorrados).toBeGreaterThan(0);
    expect(r.orden_de_pago[0]).toBe("Tarjeta"); // mayor interés primero
    expect(r.fecha_libre_deuda).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.estrategia).toBe("avalancha");
  });

  it("abonar extra no aumenta los meses vs. no abonar", () => {
    const base = simulateDebtPayoff(DEBTS, { aporte_extra_mensual: 0 }, TODAY);
    const extra = simulateDebtPayoff(DEBTS, { aporte_extra_mensual: 150_000 }, TODAY);
    expect(extra.meses).toBeLessThanOrEqual(base.meses);
  });

  it("bola_de_nieve mapea al motor y ataca el menor saldo primero", () => {
    const r = simulateDebtPayoff(DEBTS, { aporte_extra_mensual: 100_000, estrategia: "bola_de_nieve" }, TODAY);
    expect(r.estrategia).toBe("bola_nieve");
    expect(r.orden_de_pago[0]).toBe("Préstamo"); // menor saldo primero
  });

  it("sin deudas → resultado vacío explicable", () => {
    const r = simulateDebtPayoff([], { aporte_extra_mensual: 100_000 }, TODAY);
    expect(r.sin_deudas).toBe(true);
    expect(r.meses).toBe(0);
    expect(r.fecha_libre_deuda).toBeNull();
    expect(r.orden_de_pago).toEqual([]);
  });
});

describe("tools · runToolLoop (sin Gemini real)", () => {
  it("pide una functionCall → ejecuta → cierra con texto y acumula tokens", async () => {
    const execute = vi.fn(async (_name: string, args: Record<string, unknown>) => ({
      doble: Number(args.n) * 2,
    }));
    const ask = async (prior: ToolCallRecord[]): Promise<ModelTurn> => {
      if (prior.length === 0) {
        return { kind: "call", name: "duplicar", args: { n: 21 }, tokensIn: 5, tokensOut: 7 };
      }
      const res = prior[0]!.result as { doble: number };
      return { kind: "text", text: `resultado ${res.doble}`, tokensIn: 2, tokensOut: 3 };
    };
    const out = await runToolLoop({ ask, execute });
    expect(execute).toHaveBeenCalledWith("duplicar", { n: 21 });
    expect(out.text).toBe("resultado 42");
    expect(out.tokensIn).toBe(7); // 5 + 2
    expect(out.tokensOut).toBe(10); // 7 + 3
  });

  it("respeta el tope de iteraciones (no hace loop infinito)", async () => {
    let asks = 0;
    const ask = async (): Promise<ModelTurn> => {
      asks++;
      return { kind: "call", name: "x", args: {}, tokensIn: 1, tokensOut: 1 };
    };
    const out = await runToolLoop({ ask, execute: async () => ({}), maxIterations: 3 });
    expect(asks).toBe(4); // 3 iteraciones + la consulta final de cierre
    expect(out.text).toBe(""); // nunca dio texto
  });
});

describe("orchestrator · buildToolExecutor / financeChatWithTools", () => {
  it("el executor mapea simular_pago_deuda al motor (con moneda) y rechaza desconocidas", async () => {
    const exec = buildToolExecutor({ debts: DEBTS, currency: "CRC" });
    const r = (await exec("simular_pago_deuda", { aporte_extra_mensual: 100_000 })) as DebtSimResult;
    expect(r.meses).toBeGreaterThan(0);
    expect(r.currency).toBe("CRC");
    expect(r.fx_no_disponible).toBe(false);
    expect(await exec("borrar_todo", {})).toEqual({ error: "herramienta no disponible: borrar_todo" });
  });

  it("fxUnavailable se propaga al resultado (la IA puede aclarar)", async () => {
    const exec = buildToolExecutor({ debts: DEBTS, currency: "CRC", fxUnavailable: true });
    const r = (await exec("simular_pago_deuda", { aporte_extra_mensual: 50_000 })) as DebtSimResult;
    expect(r.fx_no_disponible).toBe(true);
  });

  it("sin toolContext se comporta como el chat de hoy (provider stub, sin tools)", async () => {
    const ctx = { currency: "CRC" } as FinancialContext;
    const out = await financeChatWithTools([{ role: "user", content: "hola" }], ctx);
    expect(out.provider).toBe("stub");
    expect(typeof out.reply).toBe("string");
    expect(out.reply.length).toBeGreaterThan(0);
  });
});

describe("orchestrator · normalizeDebtsForTool (FX a moneda principal)", () => {
  // Tasas "por USD": 1 USD = 500 CRC.
  const RATES = { USD: 1, CRC: 500 };
  const MIXED = [
    { id: "u", name: "Tarjeta USD", balance: 1000, minPayment: 50, apr: 30, currency: "USD" },
    { id: "c", name: "Préstamo CRC", balance: 500_000, minPayment: 30_000, apr: 20, currency: "CRC" },
  ];

  it("convierte cada deuda a la principal (no suma cruda USD+CRC)", () => {
    const out = normalizeDebtsForTool(MIXED, "CRC", RATES);
    // La deuda en USD se convierte ×500; la CRC queda igual.
    expect(out.find((d) => d.id === "u")!.balance).toBe(500_000);
    expect(out.find((d) => d.id === "u")!.minPayment).toBe(25_000);
    expect(out.find((d) => d.id === "c")!.balance).toBe(500_000);
    // APR intacta (es por deuda, no se convierte).
    expect(out.find((d) => d.id === "u")!.apr).toBe(30);
  });

  it("sin tasas (FX no disponible) pasa los montos crudos", () => {
    const out = normalizeDebtsForTool(MIXED, "CRC", null);
    expect(out.find((d) => d.id === "u")!.balance).toBe(1000); // sin convertir
  });
});

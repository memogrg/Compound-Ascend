import { describe, it, expect, vi } from "vitest";
import {
  simulateDebtPayoff,
  compareDebtStrategies,
  projectInvestment,
  projectFreedom,
  runToolLoop,
  type ModelTurn,
  type ToolCallRecord,
  type DebtSimResult,
  type CompareDebtResult,
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

describe("tools · projectInvestment (interés compuesto, puro)", () => {
  it("FV de aportes mensuales coincide con el cálculo directo", () => {
    const aporte = 100_000;
    const anios = 10;
    const rendPct = 8;
    const r = projectInvestment(
      { aporte_mensual: aporte, anios, rendimiento_anual_pct: rendPct },
      "CRC",
    );
    const i = rendPct / 100 / 12;
    const n = anios * 12;
    const g = Math.pow(1 + i, n);
    const fvExpected = aporte * ((g - 1) / i); // monto_inicial 0
    expect(r.moneda).toBe("CRC");
    expect(r.valor_futuro).toBe(Math.round(fvExpected * 100) / 100);
    expect(r.total_aportado).toBe(aporte * n);
    expect(r.interes_ganado).toBeGreaterThan(0);
    expect(r.rendimiento_supuesto_pct).toBe(8);
    expect(r.aporte_mensual_requerido).toBeUndefined(); // sin objetivo
  });

  it("rendimiento 0 → crecimiento lineal (sin interés)", () => {
    const r = projectInvestment(
      { aporte_mensual: 50_000, anios: 2, rendimiento_anual_pct: 0, monto_inicial: 100_000 },
      "CRC",
    );
    expect(r.valor_futuro).toBe(100_000 + 50_000 * 24);
    expect(r.interes_ganado).toBe(0);
  });

  it("con objetivo → aporte requerido y meses para alcanzarlo (coherentes)", () => {
    const objetivo = 20_000_000;
    const r = projectInvestment(
      { aporte_mensual: 100_000, anios: 10, rendimiento_anual_pct: 8, objetivo },
      "CRC",
    );
    expect(typeof r.aporte_mensual_requerido).toBe("number");
    expect(r.aporte_mensual_requerido!).toBeGreaterThan(0);
    // El aporte dado (100k) es menor al requerido para 10 años → tarda MÁS de 120 meses.
    expect(r.meses_para_objetivo).not.toBeNull();
    expect(r.meses_para_objetivo!).toBeGreaterThan(120);
  });

  it("objetivo ya cubierto por el monto inicial → 0 meses y aporte requerido 0", () => {
    const r = projectInvestment(
      { aporte_mensual: 10_000, anios: 5, rendimiento_anual_pct: 8, monto_inicial: 1_000_000, objetivo: 500_000 },
      "CRC",
    );
    expect(r.meses_para_objetivo).toBe(0);
    expect(r.aporte_mensual_requerido).toBe(0);
  });

  it("objetivo inalcanzable (r=0 y sin aporte) → meses null", () => {
    const r = projectInvestment(
      { aporte_mensual: 0, anios: 5, rendimiento_anual_pct: 0, monto_inicial: 100_000, objetivo: 999_999 },
      "CRC",
    );
    expect(r.meses_para_objetivo).toBeNull();
  });

  it("args inválidos no rompen (defensivo) y usa el rendimiento por defecto", () => {
    const r = projectInvestment(
      { aporte_mensual: "abc", anios: -3, rendimiento_anual_pct: "x" },
      "USD",
    );
    expect(Number.isFinite(r.valor_futuro)).toBe(true);
    expect(r.valor_futuro).toBe(0); // aporte y años saneados a 0
    expect(r.rendimiento_supuesto_pct).toBe(8); // default
  });
});

describe("tools · projectFreedom (datos reales, reusa projectInvestment)", () => {
  const CTX = { freedomNumber: 50_000_000, investableWealth: 5_000_000, currency: "CRC" };

  it("sin Número de Libertad → disponible:false con motivo", () => {
    const r = projectFreedom({ aporte_mensual: 100_000, anios: 20 }, { currency: "CRC" });
    expect(r.disponible).toBe(false);
    if (!r.disponible) expect(r.motivo).toMatch(/Número de Libertad/i);
  });

  it("con aporte + años: alcanza/faltante coherentes y números == projectInvestment directo", () => {
    const r = projectFreedom({ aporte_mensual: 200_000, anios: 25, rendimiento_anual_pct: 8 }, CTX);
    expect(r.disponible).toBe(true);
    if (!r.disponible) return;
    const proj = projectInvestment(
      { aporte_mensual: 200_000, anios: 25, rendimiento_anual_pct: 8, monto_inicial: 5_000_000, objetivo: 50_000_000 },
      "CRC",
    );
    expect(r.valor_futuro).toBe(proj.valor_futuro);
    expect(r.alcanza).toBe(proj.valor_futuro >= 50_000_000);
    expect(r.faltante_o_excedente).toBe(Math.round((proj.valor_futuro - 50_000_000) * 100) / 100);
    expect(r.numero_de_libertad).toBe(50_000_000);
    expect(r.patrimonio_invertible_actual).toBe(5_000_000);
  });

  it("con años, sin aporte → aporte_mensual_requerido (> 0)", () => {
    const r = projectFreedom({ anios: 20 }, CTX);
    expect(r.disponible).toBe(true);
    if (r.disponible) {
      expect(typeof r.aporte_mensual_requerido).toBe("number");
      expect(r.aporte_mensual_requerido!).toBeGreaterThan(0);
    }
  });

  it("con aporte, sin años → anios_para_alcanzar (número o null)", () => {
    const r = projectFreedom({ aporte_mensual: 300_000 }, CTX);
    expect(r.disponible).toBe(true);
    if (r.disponible) {
      expect(r.anios_para_alcanzar === null || typeof r.anios_para_alcanzar === "number").toBe(true);
      if (typeof r.anios_para_alcanzar === "number") expect(r.anios_para_alcanzar).toBeGreaterThan(0);
    }
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

  it("el executor mapea comparar_estrategias_deuda al motor (con moneda)", async () => {
    const exec = buildToolExecutor({ debts: DEBTS, currency: "CRC" });
    const r = (await exec("comparar_estrategias_deuda", {
      aporte_extra_mensual: 100_000,
    })) as CompareDebtResult;
    expect(r.sin_deudas).toBe(false);
    expect(r.currency).toBe("CRC");
    expect(r.avalancha.meses).toBeGreaterThan(0);
    expect(r.bola_nieve.meses).toBeGreaterThan(0);
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

  it("normaliza mixtas y luego compareDebtStrategies usa los montos convertidos", () => {
    const normalized = normalizeDebtsForTool(MIXED, "CRC", RATES);
    const r = compareDebtStrategies(normalized, { aporte_extra_mensual: 50_000 }, TODAY, {
      currency: "CRC",
    });
    expect(r.sin_deudas).toBe(false);
    expect(r.avalancha.meses).toBeGreaterThan(0);
    // Avalancha ataca el mayor APR (Tarjeta USD, 30%) primero; bola de nieve el menor saldo.
    expect(r.avalancha.orden_de_pago[0]).toBe("Tarjeta USD");
  });
});

describe("tools · compareDebtStrategies (motor real, sin red)", () => {
  it("devuelve ambas estrategias con meses/intereses coherentes y moneda", () => {
    const r = compareDebtStrategies(DEBTS, { aporte_extra_mensual: 100_000 }, TODAY, {
      currency: "CRC",
    });
    expect(r.sin_deudas).toBe(false);
    expect(r.currency).toBe("CRC");
    expect(r.avalancha.meses).toBeGreaterThan(0);
    expect(r.bola_nieve.meses).toBeGreaterThan(0);
    expect(r.avalancha.intereses).toBeGreaterThanOrEqual(0);
    // Avalancha ataca el mayor APR (Tarjeta 45%); bola de nieve el menor saldo (Préstamo).
    expect(r.avalancha.orden_de_pago[0]).toBe("Tarjeta");
    expect(r.bola_nieve.orden_de_pago[0]).toBe("Préstamo");
    // Con las mismas deudas, avalancha no paga más intereses que bola de nieve.
    expect(r.avalancha.intereses).toBeLessThanOrEqual(r.bola_nieve.intereses);
  });

  it("sin deudas → sin_deudas y outcomes vacíos", () => {
    const r = compareDebtStrategies([], { aporte_extra_mensual: 100_000 }, TODAY, { currency: "CRC" });
    expect(r.sin_deudas).toBe(true);
    expect(r.avalancha.meses).toBe(0);
    expect(r.bola_nieve.orden_de_pago).toEqual([]);
  });
});

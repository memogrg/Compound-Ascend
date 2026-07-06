import { describe, it, expect, vi } from "vitest";
import {
  simulateDebtPayoff,
  compareDebtStrategies,
  analyzeMinPayment,
  projectInvestment,
  projectFreedom,
  projectGoals,
  yearsToFreedom,
  runToolLoop,
  PROJECT_INVESTMENT_TOOL,
  type GoalForTool,
  type ModelTurn,
  type ToolCallRecord,
  type DebtSimResult,
  type CompareDebtResult,
} from "@/lib/ai/tools";
import { GeminiProvider } from "@/lib/ai/providers/gemini";
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
    expect(r.cronograma_anual).toEqual([]); // n=0 → sin filas
  });

  it("cronograma_anual coincide con el interés compuesto hecho a mano (caso del chat) y cierra en valor_futuro", () => {
    // Mismo caso que erró el modelo en el chat: 13.000.000 inicial, 207.365/mes, 15 años, 10%.
    const inicial = 13_000_000;
    const aporte = 207_365;
    const anios = 15;
    const rendPct = 10;
    const r = projectInvestment(
      { aporte_mensual: aporte, anios, rendimiento_anual_pct: rendPct, monto_inicial: inicial },
      "CRC",
    );

    // Referencia a mano: misma recurrencia mensual (aporte al final de cada mes), agregada por año.
    const i = rendPct / 100 / 12;
    const esperado: { saldoInicial: number; aportes: number; interes: number; saldoFinal: number }[] = [];
    let saldo = inicial;
    for (let a = 0; a < anios; a += 1) {
      const saldoInicial = saldo;
      for (let m = 0; m < 12; m += 1) saldo = saldo * (1 + i) + aporte;
      const aportes = aporte * 12;
      esperado.push({ saldoInicial, aportes, interes: saldo - saldoInicial - aportes, saldoFinal: saldo });
    }

    expect(r.cronograma_anual).toHaveLength(anios);
    r.cronograma_anual.forEach((fila, idx) => {
      const esp = esperado[idx]!;
      expect(fila.anio).toBe(idx + 1);
      expect(fila.saldo_inicial).toBeCloseTo(esp.saldoInicial, 1);
      expect(fila.aportes).toBeCloseTo(esp.aportes, 1);
      expect(fila.interes).toBeCloseTo(esp.interes, 1);
      expect(fila.saldo_final).toBeCloseTo(esp.saldoFinal, 1);
      // Coherencia interna: saldo_final == saldo_inicial + aportes + interes.
      expect(fila.saldo_final).toBeCloseTo(fila.saldo_inicial + fila.aportes + fila.interes, 1);
    });

    // Continuidad entre años: saldo_final[k] == saldo_inicial[k+1].
    for (let k = 0; k < r.cronograma_anual.length - 1; k += 1) {
      expect(r.cronograma_anual[k + 1]!.saldo_inicial).toBe(r.cronograma_anual[k]!.saldo_final);
    }

    // El saldo_final del último año coincide con el agregado valor_futuro.
    const ultimo = r.cronograma_anual[r.cronograma_anual.length - 1]!;
    expect(ultimo.saldo_final).toBeCloseTo(r.valor_futuro, 1);
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

describe("tools · yearsToFreedom (años al ritmo actual + sensibilidad, puro)", () => {
  // Referencia a mano de monthsToReach (r≠0) → años con 1 decimal, para verificar la tool.
  const refYears = (objetivo: number, inicial: number, aporte: number, rendPct: number): number => {
    if (objetivo <= inicial) return 0;
    const r = rendPct / 100 / 12;
    const k = aporte / r;
    const g = (objetivo + k) / (inicial + k);
    const m = Math.ceil(Math.log(g) / Math.log(1 + r));
    return Math.round((m / 12) * 10) / 10;
  };

  it("sin freedomNumber → disponible:false con motivo", () => {
    const r = yearsToFreedom({ aporte_mensual: 1_400_000 }, { currency: "CRC" });
    expect(r.disponible).toBe(false);
    if (!r.disponible) expect(r.motivo).toMatch(/Número de Libertad/i);
  });

  it("años y sensibilidad coinciden con el interés compuesto a mano (5% real por defecto)", () => {
    const ctx = { freedomNumber: 290_400_000, investableWealth: 13_000_000, currency: "CRC" };
    const aporte = 1_400_000;
    const r = yearsToFreedom({ aporte_mensual: aporte }, ctx); // rendimiento default 5%
    expect(r.disponible).toBe(true);
    if (!r.disponible) return;
    expect(r.rendimiento_supuesto_pct).toBe(5);
    expect(r.numero_de_libertad).toBe(290_400_000);
    expect(r.patrimonio_invertible_actual).toBe(13_000_000);
    // Años al ritmo actual == referencia.
    expect(r.anios_para_libertad).toBe(refYears(290_400_000, 13_000_000, aporte, 5));
    // Sensibilidad: 3 escenarios 25/50/100% más, cada uno con su aporte y años == referencia.
    expect(r.sensibilidad.map((s) => s.incremento_pct)).toEqual([25, 50, 100]);
    for (const s of r.sensibilidad) {
      const aporteEsc = Math.round(aporte * (1 + s.incremento_pct / 100) * 100) / 100;
      expect(s.aporte_mensual).toBe(aporteEsc);
      expect(s.anios).toBe(refYears(290_400_000, 13_000_000, aporteEsc, 5));
      expect(s.ahorra_anios).toBe(Math.round((r.anios_para_libertad! - s.anios!) * 10) / 10);
    }
    // Aportar más SIEMPRE acorta (o iguala) el camino: años monótonos no crecientes, ahorro creciente.
    const anios = r.sensibilidad.map((s) => s.anios!);
    expect(anios[0]!).toBeGreaterThanOrEqual(anios[1]!);
    expect(anios[1]!).toBeGreaterThanOrEqual(anios[2]!);
    expect(r.sensibilidad[2]!.ahorra_anios!).toBeGreaterThan(0);
  });

  it("patrimonio ya ≥ número → 0 años y sensibilidad sin acortamiento", () => {
    const r = yearsToFreedom(
      { aporte_mensual: 1_000_000 },
      { freedomNumber: 100_000_000, investableWealth: 120_000_000, currency: "CRC" },
    );
    expect(r.disponible).toBe(true);
    if (!r.disponible) return;
    expect(r.anios_para_libertad).toBe(0);
    expect(r.sensibilidad.every((s) => s.anios === 0 && s.ahorra_anios === 0)).toBe(true);
  });

  it("respeta un rendimiento supuesto explícito (10%) distinto del default", () => {
    const ctx = { freedomNumber: 200_000_000, investableWealth: 20_000_000, currency: "CRC" };
    const r = yearsToFreedom({ aporte_mensual: 1_000_000, rendimiento_anual_pct: 10 }, ctx);
    expect(r.disponible).toBe(true);
    if (!r.disponible) return;
    expect(r.rendimiento_supuesto_pct).toBe(10);
    expect(r.anios_para_libertad).toBe(refYears(200_000_000, 20_000_000, 1_000_000, 10));
  });
});

describe("tools · projectGoals (progreso/proyección de metas, puro)", () => {
  const TODAY = new Date(2026, 5, 30); // determinista
  const GOALS: GoalForTool[] = [
    { nombre: "Viaje a Japón", objetivo: 3_000_000, actual: 1_200_000, aporte_mensual: 150_000, fecha_objetivo: "2027-06-30" },
    { nombre: "Fondo emergencia", objetivo: 2_000_000, actual: 2_000_000, aporte_mensual: 0, fecha_objetivo: null },
    { nombre: "Carro", objetivo: 8_000_000, actual: 500_000, aporte_mensual: 0, fecha_objetivo: null },
  ];

  it("sin metas → disponible:false con motivo", () => {
    const r = projectGoals({}, { goals: [], currency: "CRC" }, TODAY);
    expect(r.disponible).toBe(false);
    if (!r.disponible) expect(r.motivo).toMatch(/metas/i);
  });

  it("faltante y meses correctos; cumplida cuando actual>=objetivo; aporte 0 → meses null", () => {
    const r = projectGoals({}, { goals: GOALS, currency: "CRC" }, TODAY);
    expect(r.disponible).toBe(true);
    if (!r.disponible) return;
    const viaje = r.metas.find((m) => m.nombre === "Viaje a Japón")!;
    expect(viaje.faltante).toBe(1_800_000);
    expect(viaje.meses_para_meta).toBe(Math.ceil(1_800_000 / 150_000)); // 12
    expect(viaje.cumplida).toBe(false);
    expect(viaje.progreso_pct).toBe(0.4);

    const fondo = r.metas.find((m) => m.nombre === "Fondo emergencia")!;
    expect(fondo.cumplida).toBe(true);
    expect(fondo.meses_para_meta).toBe(0);

    const carro = r.metas.find((m) => m.nombre === "Carro")!;
    expect(carro.meses_para_meta).toBeNull(); // falta y aporte 0 → nunca
  });

  it("aporte_extra acelera (menos meses)", () => {
    const base = projectGoals({}, { goals: GOALS, currency: "CRC" }, TODAY);
    const fast = projectGoals({ aporte_extra_mensual: 150_000 }, { goals: GOALS, currency: "CRC" }, TODAY);
    if (!base.disponible || !fast.disponible) throw new Error("disponible");
    const vBase = base.metas.find((m) => m.nombre === "Viaje a Japón")!.meses_para_meta!;
    const vFast = fast.metas.find((m) => m.nombre === "Viaje a Japón")!.meses_para_meta!;
    expect(vFast).toBeLessThan(vBase);
    // El carro, antes inalcanzable (aporte 0), ahora tiene meses finitos.
    expect(fast.metas.find((m) => m.nombre === "Carro")!.meses_para_meta).not.toBeNull();
  });

  it("filtro por nombre (substring, normalizado)", () => {
    const r = projectGoals({ nombre: "japon" }, { goals: GOALS, currency: "CRC" }, TODAY);
    if (!r.disponible) throw new Error("disponible");
    expect(r.metas).toHaveLength(1);
    expect(r.metas[0]!.nombre).toBe("Viaje a Japón");
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

  it("propaga el thoughtSignature del turno al ToolCallRecord reenviado (Gemini 3.x)", async () => {
    // Gemini 3.x exige recibir de vuelta el thoughtSignature de cada functionCall en el
    // siguiente turno; el loop debe llevarlo del ModelTurn al ToolCallRecord.
    const seen: (string | undefined)[] = [];
    const ask = async (prior: ToolCallRecord[]): Promise<ModelTurn> => {
      if (prior.length === 0) {
        return { kind: "call", name: "t", args: {}, thoughtSignature: "SIG-abc", tokensIn: 1, tokensOut: 1 };
      }
      seen.push(prior[0]!.thoughtSignature);
      return { kind: "text", text: "ok", tokensIn: 1, tokensOut: 1 };
    };
    await runToolLoop({ ask, execute: async () => ({}) });
    expect(seen).toEqual(["SIG-abc"]);
  });

  it("sin thoughtSignature (caso 2.5-flash) el ToolCallRecord lo deja undefined (sin cambios)", async () => {
    const seen: (string | undefined)[] = [];
    const ask = async (prior: ToolCallRecord[]): Promise<ModelTurn> => {
      if (prior.length === 0) {
        return { kind: "call", name: "t", args: {}, tokensIn: 1, tokensOut: 1 }; // sin thoughtSignature
      }
      seen.push(prior[0]!.thoughtSignature);
      return { kind: "text", text: "ok", tokensIn: 1, tokensOut: 1 };
    };
    await runToolLoop({ ask, execute: async () => ({}) });
    expect(seen).toEqual([undefined]);
  });
});

describe("gemini · chatWithTools reenvía el thoughtSignature (round-trip del provider)", () => {
  type GenPart = {
    text?: string;
    functionCall?: { name: string; args?: Record<string, unknown> };
    thoughtSignature?: string;
    functionResponse?: unknown;
  };
  type GenBody = { contents: { role: string; parts: GenPart[] }[] };

  it("reconstruye el 2º request con la functionCall + su thoughtSignature", async () => {
    const bodies: GenBody[] = [];
    const responses = [
      // Turno 1: el modelo pide la herramienta y adjunta su thoughtSignature (Gemini 3.x).
      {
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: { name: "proyectar_inversion", args: { aporte_mensual: 1, anios: 1 } },
                  thoughtSignature: "SIG-XYZ",
                },
              ],
            },
          },
        ],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, thoughtsTokenCount: 3 },
      },
      // Turno 2: cierra con texto.
      {
        candidates: [{ content: { parts: [{ text: "listo" }] } }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2 },
      },
    ];
    let i = 0;
    const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body) as GenBody);
      const body = responses[i] ?? responses[responses.length - 1]!;
      i += 1;
      return { ok: true, json: async () => body } as unknown as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const provider = new GeminiProvider("test-key", "gemini-3.5-flash");
      const out = await provider.chatWithTools({
        system: "s",
        messages: [{ role: "user", content: "proyectá" }],
        tools: [PROJECT_INVESTMENT_TOOL],
        execute: async () => ({ ok: true }),
      });
      expect(out.text).toBe("listo");
      // thoughtsTokenCount (3) se suma a la salida facturable del turno 1: 1 + 3 + 2 = 6.
      expect(out.tokensOut).toBe(6);
      // El 2º request reenvía la functionCall del modelo CON su thoughtSignature.
      const modelPart = bodies[1]!.contents.find((c) => c.role === "model")?.parts?.[0];
      expect(modelPart?.functionCall?.name).toBe("proyectar_inversion");
      expect(modelPart?.thoughtSignature).toBe("SIG-XYZ");
    } finally {
      vi.unstubAllGlobals();
    }
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

describe("tools · analyzeMinPayment (trampa del mínimo + tasa efectiva, puro)", () => {
  // Referencias a mano (mismo cálculo que la tool) para verificar exactitud.
  const round2 = (x: number): number => Math.round(x * 100) / 100;
  const effRate = (apr: number): number => round2((Math.pow(1 + apr / 100 / 12, 12) - 1) * 100);
  const refTrap = (
    saldo: number,
    apr: number,
    minPay: number,
  ): { nunca: boolean; months?: number; interes?: number; pagado?: number } => {
    const r = apr / 100 / 12;
    if (minPay <= saldo * r) return { nunca: true };
    let balance = saldo;
    let interest = 0;
    let pagado = 0;
    let months = 0;
    while (balance > 0.01 && months < 1200) {
      const i = balance * r;
      const pay = Math.min(minPay, balance + i);
      interest += i;
      pagado += pay;
      balance = balance + i - pay;
      months += 1;
    }
    if (balance > 0.01) return { nunca: true };
    return { nunca: false, months, interes: round2(interest), pagado: round2(pagado) };
  };
  const refCuota = (saldo: number, apr: number, n: number): number => {
    const r = apr / 100 / 12;
    return r === 0 ? saldo / n : (saldo * r) / (1 - Math.pow(1 + r, -n));
  };

  const D = (over: Partial<DebtInput> = {}): DebtInput => ({
    id: "d1",
    name: "Tarjeta",
    balance: 1_000_000,
    apr: 30,
    minPayment: 50_000,
    ...over,
  });

  it("sin deudas → disponible:false con motivo", () => {
    const r = analyzeMinPayment([], {}, { currency: "CRC" });
    expect(r.disponible).toBe(false);
    if (!r.disponible) expect(r.motivo).toMatch(/deudas/i);
  });

  it("tasa efectiva, meses/interés del mínimo, plan a 12 meses y ahorro cuadran a mano", () => {
    const debt = D({ balance: 1_000_000, apr: 30, minPayment: 50_000 });
    const r = analyzeMinPayment([debt], {}, { currency: "CRC" });
    expect(r.disponible).toBe(true);
    if (!r.disponible) return;
    // Tasa efectiva anual desde la nominal.
    expect(r.tasa_nominal_pct).toBe(30);
    expect(r.tasa_efectiva_pct).toBe(effRate(30));
    // Trampa del mínimo (50k > interés del 1er mes 25k → se salda).
    const trap = refTrap(1_000_000, 30, 50_000);
    expect(r.nunca_se_salda).toBe(false);
    expect(r.meses_minimo).toBe(trap.months);
    expect(r.anios_minimo).toBe(Math.round((trap.months! / 12) * 10) / 10);
    expect(r.interes_total_minimo).toBe(trap.interes);
    expect(r.total_pagado_minimo).toBe(trap.pagado);
    // Plan corto (12 meses por defecto).
    expect(r.meses_objetivo).toBe(12);
    const cuota = round2(refCuota(1_000_000, 30, 12));
    expect(r.cuota_plan_corto).toBe(cuota);
    expect(r.interes_total_plan_corto).toBe(round2(refCuota(1_000_000, 30, 12) * 12 - 1_000_000));
    // Ahorro = interés del mínimo − interés del plan corto (positivo).
    expect(r.ahorro_intereses).toBe(round2(r.interes_total_minimo! - r.interes_total_plan_corto));
    expect(r.ahorro_intereses!).toBeGreaterThan(0);
  });

  it("respeta meses_objetivo explícito (24) para el plan corto", () => {
    const r = analyzeMinPayment([D()], { meses_objetivo: 24 }, { currency: "CRC" });
    expect(r.disponible).toBe(true);
    if (!r.disponible) return;
    expect(r.meses_objetivo).toBe(24);
    expect(r.cuota_plan_corto).toBe(Math.round(refCuota(1_000_000, 30, 24) * 100) / 100);
  });

  it("el mínimo no cubre el interés → nunca_se_salda y montos del mínimo en null", () => {
    // 45% sobre 1M → interés 1er mes 37.500; mínimo 30.000 < 37.500.
    const r = analyzeMinPayment([D({ apr: 45, minPayment: 30_000 })], {}, { currency: "CRC" });
    expect(r.disponible).toBe(true);
    if (!r.disponible) return;
    expect(r.nunca_se_salda).toBe(true);
    expect(r.meses_minimo).toBeNull();
    expect(r.interes_total_minimo).toBeNull();
    expect(r.ahorro_intereses).toBeNull();
    // El plan corto SÍ se calcula (la salida accionable).
    expect(r.cuota_plan_corto).toBeGreaterThan(0);
  });

  it("elige la deuda por nombre; sin nombre, la de mayor APR", () => {
    const debts: DebtInput[] = [
      { id: "d1", name: "Tarjeta", balance: 500_000, apr: 45, minPayment: 40_000 },
      { id: "d2", name: "Préstamo personal", balance: 2_000_000, apr: 18, minPayment: 80_000 },
    ];
    // Sin nombre → la más cara (Tarjeta, 45%).
    const top = analyzeMinPayment(debts, {}, { currency: "CRC" });
    expect(top.disponible && top.deuda).toBe("Tarjeta");
    // Por nombre → Préstamo.
    const byName = analyzeMinPayment(debts, { deuda: "préstamo" }, { currency: "CRC" });
    expect(byName.disponible && byName.deuda).toBe("Préstamo personal");
    if (byName.disponible) expect(byName.tasa_nominal_pct).toBe(18);
  });
});

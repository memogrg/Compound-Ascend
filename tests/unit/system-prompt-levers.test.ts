import { describe, it, expect } from "vitest";
import { buildSystemPrompt, type FinancialContext } from "@/lib/ai/system-prompt";

const base: FinancialContext = { currency: "CRC" };

describe("buildSystemPrompt · ladder de deuda (hecho neutral)", () => {
  it("renderiza saldo vivo, APR, mínimo y el interés mensual por deuda", () => {
    const out = buildSystemPrompt({
      ...base,
      debts: [
        {
          name: "Tarjeta Oro",
          liveBalance: 800_000,
          apr: 40,
          minPayment: 30_000,
          currency: "CRC",
          monthlyInterestCost: 26_667,
        },
      ],
    });
    expect(out).toContain("Tarjeta Oro");
    expect(out).toContain("saldo 800000 CRC @40%");
    expect(out).toContain("mínimo 30000 CRC");
    expect(out).toContain("interés ~26667 CRC/mes");
  });
  it("marca el '+N más' cuando hay debtsMoreCount", () => {
    const out = buildSystemPrompt({
      ...base,
      debts: [
        {
          name: "D",
          liveBalance: 100_000,
          apr: 10,
          minPayment: 5_000,
          currency: "CRC",
          monthlyInterestCost: 833,
        },
      ],
      debtsMoreCount: 3,
    });
    expect(out).toContain("+3 más");
  });
  it("sin debts no agrega el bloque", () => {
    expect(buildSystemPrompt(base)).not.toContain("saldo vivo, APR, mínimo");
  });
});

describe("buildSystemPrompt · ladder de metas (hecho neutral)", () => {
  it("renderiza objetivo, fecha y ritmo actual vs requerido con el rótulo", () => {
    const out = buildSystemPrompt({
      ...base,
      goals: [
        {
          name: "Viaje",
          target: 1_200_000,
          currency: "CRC",
          targetDate: "2027-01-01",
          monthlyActual: 50_000,
          monthlyRequired: 100_000,
          onTrack: false,
        },
      ],
    });
    expect(out).toContain("Viaje");
    expect(out).toContain("objetivo 1200000 CRC");
    expect(out).toContain("fecha 2027-01-01");
    expect(out).toContain("ritmo 50000/100000 CRC/mes (atrasada)");
  });
  it("meta sin fecha → muestra aporte, no ritmo", () => {
    const out = buildSystemPrompt({
      ...base,
      goals: [{ name: "Libertad", target: 5_000_000, currency: "CRC", monthlyActual: 200_000 }],
    });
    expect(out).toContain("aporte 200000 CRC/mes (sin fecha objetivo)");
  });
  it("meta vencida se rotula vencida", () => {
    const out = buildSystemPrompt({
      ...base,
      goals: [
        {
          name: "Tarde",
          target: 100_000,
          currency: "CRC",
          targetDate: "2025-06-01",
          monthlyActual: 0,
          monthlyRequired: 100_000,
          vencida: true,
          onTrack: false,
        },
      ],
    });
    expect(out).toContain("(vencida)");
  });
});

describe("buildSystemPrompt · brechas de protección (hecho neutral)", () => {
  it("lista las coberturas sin cubrir con severidad + pólizas activas", () => {
    const out = buildSystemPrompt({
      ...base,
      protectionGaps: [
        { type: "Seguro de invalidez", severity: "alto", description: "vivís de tu ingreso" },
      ],
      activePolicies: 2,
    });
    expect(out).toContain("Brechas de protección");
    expect(out).toContain("Seguro de invalidez [alto]: vivís de tu ingreso");
    expect(out).toContain("2 pólizas activas");
  });
  it("sin protectionGaps no agrega el bloque", () => {
    expect(buildSystemPrompt(base)).not.toContain("Brechas de protección");
  });
});

describe("buildSystemPrompt · SEÑAL PRIORITARIA (hecho del Priority Engine)", () => {
  it("renderiza la señal prioritaria cuando está presente", () => {
    const out = buildSystemPrompt({
      ...base,
      señalPrioritaria: "Tu Tarjeta Oro al 40% te cuesta ~26667 CRC/mes — es lo más caro.",
    });
    expect(out).toContain("lo más grave de tu cuadro ahora"); // el HECHO (la regla siempre menciona la señal)
    expect(out).toContain("Tarjeta Oro al 40%");
  });
  it("sin señal no agrega el HECHO (la regla de conducta sí la menciona)", () => {
    expect(buildSystemPrompt(base)).not.toContain("lo más grave de tu cuadro ahora");
  });
});

describe("buildSystemPrompt · gasto real por sobre (hecho neutral para confrontar)", () => {
  it("renderiza los sobres con su gasto real mensual", () => {
    const out = buildSystemPrompt({
      ...base,
      expenseSobres: [
        { name: "Restaurantes", monthly: 120000 },
        { name: "Súper", monthly: 300000 },
      ],
    });
    expect(out).toContain("lo que gastó de verdad en cada uno"); // texto del HECHO (la regla también menciona «Gasto real por sobre»)
    expect(out).toContain("Restaurantes 120000 CRC");
    expect(out).toContain("Súper 300000 CRC");
  });
  it("sin expenseSobres no agrega el HECHO (la regla de conducta sí lo menciona)", () => {
    expect(buildSystemPrompt(base)).not.toContain("lo que gastó de verdad en cada uno");
  });
});

describe("buildSystemPrompt · proyección MENTOR de deuda (hecho neutral del engine)", () => {
  it("renderiza el horizonte (meses antes + interés ahorrado)", () => {
    const out = buildSystemPrompt({
      ...base,
      debtProjections: [
        {
          name: "Tarjeta Oro",
          extra: 120000,
          monthsSaved: 14,
          interestSaved: 210000,
          currency: "CRC",
        },
      ],
    });
    expect(out).toContain("ya calculada por el motor"); // texto del HECHO (la regla también menciona «Proyección de salida de deuda»)
    expect(out).toContain("con ₡120000 CRC/mes extra saldás 14 meses antes");
    expect(out).toContain("ahorrás ~210000 CRC de interés");
  });
  it("sin debtProjections no agrega el HECHO (la regla de conducta sí lo menciona)", () => {
    expect(buildSystemPrompt(base)).not.toContain("ya calculada por el motor");
  });
});

describe("buildSystemPrompt · horizonte del fondo + ETA de meta (Paso 3.7)", () => {
  it("renderiza el horizonte del fondo de emergencia", () => {
    const out = buildSystemPrompt({
      ...base,
      fundEta: { monthsToTarget: 18, etaLabel: "febrero 2028", aporte: 50000, currency: "CRC" },
    });
    expect(out).toContain("Horizonte de tu fondo de emergencia");
    expect(out).toContain("con ₡50000 CRC/mes lo cubrís en 18 meses (para febrero 2028)");
  });
  it("renderiza la ETA de meta al ritmo actual en el ladder", () => {
    const out = buildSystemPrompt({
      ...base,
      goals: [
        {
          name: "Viaje",
          target: 1200000,
          currency: "CRC",
          monthlyActual: 50000,
          monthsAtPace: 24,
          etaAtPace: "enero 2028",
        },
      ],
    });
    expect(out).toContain("a tu ritmo llegás en enero 2028");
  });
  it("sin fundEta no agrega el HECHO (la regla de conducta sí lo menciona)", () => {
    expect(buildSystemPrompt(base)).not.toContain("lo cubrís en"); // texto del HECHO, no de la regla
  });
});

describe("buildSystemPrompt · reglas coach-mentor (Paso 3.6)", () => {
  const out = buildSystemPrompt(base);
  it("mapea el aporte al fondo de emergencia a create_goal (tap, no prosa)", () => {
    expect(out).toContain("EL FONDO DE EMERGENCIA");
    expect(out).toContain("PROPONÉ create_goal");
  });
  it("regla de horizonte MENTOR con grounding inviolable (no inventar el horizonte)", () => {
    expect(out).toContain("HORIZONTE HACIA LA META");
    expect(out).toContain("si NO está en tu contexto, NO lo inventes");
  });
  it("cierre por dominio: protección cierra con un paso, no un tap", () => {
    expect(out).toContain("CIERRE POR DOMINIO");
    expect(out).toContain("no hay botón para comprar un seguro");
  });
});

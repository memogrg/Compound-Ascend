import { describe, it, expect } from "vitest";
import { buildSchedule, pmt } from "@/modules/control/engine/amortization";
import {
  buildDebtSimInsights,
  escenarioParaAsesor,
  isSimulable,
  shorterTermOptions,
  simulateLoan,
  UMBRAL_DTI_ALTO,
  type LoanSimInput,
} from "@/modules/control/engine/debt-sim-insights";

/** Formateador trivial: los tests afirman NÚMEROS, no el formato de la moneda. */
const fmt = (n: number) => String(Math.round(n));

/**
 * `buildSchedule` redondea CADA fila a céntimos por su cuenta, pero arrastra el saldo sin
 * redondear. Sobre 180 o 360 filas eso deja una deriva de menos de un colón entre "la suma de las
 * filas" y "el número exacto" — inherente al motor, no un error de la simulación. Las
 * comprobaciones de cuadre usan esta tolerancia en vez de fingir una igualdad al céntimo.
 */
const DERIVA = 2;
const cuadra = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(DERIVA);

/** Hipoteca típica de Costa Rica: 10 M a 12% en 15 años. */
const HIPOTECA: LoanSimInput = {
  principal: 10_000_000,
  aprPct: 12,
  termMonths: 180,
  insuranceMonthly: 0,
};

describe("isSimulable", () => {
  it("exige capital y plazo positivos", () => {
    expect(isSimulable(HIPOTECA)).toBe(true);
    expect(isSimulable({ ...HIPOTECA, principal: 0 })).toBe(false);
    expect(isSimulable({ ...HIPOTECA, termMonths: 0 })).toBe(false);
  });

  it("tasa 0 es simulable (préstamo familiar sin interés)", () => {
    expect(isSimulable({ ...HIPOTECA, aprPct: 0 })).toBe(true);
  });
});

describe("simulateLoan · la cuota sale del motor, no de una fórmula nueva", () => {
  it("monthlyPayment es el PMT de amortization.ts", () => {
    const sim = simulateLoan(HIPOTECA);
    const esperado = pmt(HIPOTECA.principal, HIPOTECA.aprPct / 100 / 12, HIPOTECA.termMonths);
    expect(sim.monthlyPayment).toBeCloseTo(esperado, 2);
    // Y es la misma que usa el schedule: el primer mes es interés + capital de esa cuota.
    const primera = sim.schedule[0]!;
    expect(primera.interest + primera.principal).toBeCloseTo(esperado, 2);
  });

  it("el schedule es exactamente el de buildSchedule con los mismos datos", () => {
    const sim = simulateLoan(HIPOTECA);
    const directo = buildSchedule({
      balance: HIPOTECA.principal,
      apr: HIPOTECA.aprPct,
      termMonths: HIPOTECA.termMonths,
      insurance: 0,
    });
    expect(sim.schedule).toEqual(directo);
    expect(sim.months).toBe(180);
  });

  it("tasa 0 → la cuota es capital / plazo y no hay intereses", () => {
    const sim = simulateLoan({ ...HIPOTECA, aprPct: 0 });
    expect(sim.monthlyPayment).toBeCloseTo(10_000_000 / 180, 2);
    expect(sim.totalInterest).toBeCloseTo(0, 2);
    cuadra(sim.totalPaid, 10_000_000);
  });

  it("datos insuficientes → simulación vacía, no una excepción", () => {
    expect(simulateLoan({ ...HIPOTECA, principal: 0 }).months).toBe(0);
    expect(simulateLoan({ ...HIPOTECA, termMonths: 0 }).schedule).toEqual([]);
  });

  it("el total pagado es capital + intereses + seguro", () => {
    const sim = simulateLoan({ ...HIPOTECA, insuranceMonthly: 15_000 });
    cuadra(sim.totalPaid, HIPOTECA.principal + sim.totalInterest + sim.totalInsurance);
  });

  it("costPer100: por cada 100 prestados, cuánto se devuelve", () => {
    const sim = simulateLoan(HIPOTECA);
    expect(sim.costPer100).toBeCloseTo((sim.totalPaid / HIPOTECA.principal) * 100, 1);
    // Una hipoteca a 12% en 15 años devuelve claramente más de 150 por cada 100.
    expect(sim.costPer100).toBeGreaterThan(150);
  });
});

describe("el seguro se suma a la cuota y NO capitaliza", () => {
  const SEGURO = 15_000;
  const sinSeguro = simulateLoan(HIPOTECA);
  const conSeguro = simulateLoan({ ...HIPOTECA, insuranceMonthly: SEGURO });

  it("no cambia la cuota que amortiza ni el plazo", () => {
    expect(conSeguro.monthlyPayment).toBeCloseTo(sinSeguro.monthlyPayment, 2);
    expect(conSeguro.months).toBe(sinSeguro.months);
  });

  it("no cambia ni un céntimo del capital ni de los intereses", () => {
    expect(conSeguro.totalInterest).toBeCloseTo(sinSeguro.totalInterest, 2);
    expect(conSeguro.schedule.map((r) => r.balance)).toEqual(
      sinSeguro.schedule.map((r) => r.balance),
    );
    expect(conSeguro.schedule.map((r) => r.principal)).toEqual(
      sinSeguro.schedule.map((r) => r.principal),
    );
  });

  it("sí se suma al desembolso mensual y al total del plazo", () => {
    expect(conSeguro.monthlyTotal).toBeCloseTo(sinSeguro.monthlyPayment + SEGURO, 2);
    expect(conSeguro.totalInsurance).toBeCloseTo(SEGURO * conSeguro.months, 0);
    expect(conSeguro.totalPaid).toBeCloseTo(sinSeguro.totalPaid + SEGURO * conSeguro.months, 0);
  });
});

describe("la tabla anual cuadra con la mensual", () => {
  const sim = simulateLoan({ ...HIPOTECA, insuranceMonthly: 15_000 });

  it("agrupa 180 meses en 15 años de 12 meses", () => {
    expect(sim.years).toHaveLength(15);
    expect(sim.years.every((y) => y.months === 12)).toBe(true);
    expect(sim.years.reduce((s, y) => s + y.rows.length, 0)).toBe(sim.schedule.length);
  });

  it("cada año suma exactamente sus propias filas mensuales", () => {
    for (const y of sim.years) {
      const interes = y.rows.reduce((s, r) => s + r.interest, 0);
      const capital = y.rows.reduce((s, r) => s + r.principal, 0);
      const seguro = y.rows.reduce((s, r) => s + r.insurance, 0);
      const pagado = y.rows.reduce((s, r) => s + r.payment, 0);
      expect(y.interest).toBeCloseTo(interes, 2);
      expect(y.principal).toBeCloseTo(capital, 2);
      expect(y.insurance).toBeCloseTo(seguro, 2);
      expect(y.paid).toBeCloseTo(pagado, 2);
    }
  });

  it("los totales por año suman los totales del préstamo", () => {
    expect(sim.years.reduce((s, y) => s + y.interest, 0)).toBeCloseTo(sim.totalInterest, 1);
    expect(sim.years.reduce((s, y) => s + y.insurance, 0)).toBeCloseTo(sim.totalInsurance, 1);
    expect(sim.years.reduce((s, y) => s + y.paid, 0)).toBeCloseTo(sim.totalPaid, 1);
    // El capital amortizado en todo el plazo es lo prestado.
    cuadra(
      sim.years.reduce((s, y) => s + y.principal, 0),
      HIPOTECA.principal,
    );
  });

  it("los saldos encadenan: apertura del año = cierre del anterior", () => {
    expect(sim.years[0]!.openingBalance).toBe(HIPOTECA.principal);
    for (let i = 1; i < sim.years.length; i++) {
      expect(sim.years[i]!.openingBalance).toBe(sim.years[i - 1]!.closingBalance);
    }
    expect(sim.years[sim.years.length - 1]!.closingBalance).toBeCloseTo(0, 2);
  });

  it("apertura − capital del año = cierre del año", () => {
    for (const y of sim.years) {
      expect(y.openingBalance - y.principal).toBeCloseTo(y.closingBalance, 1);
    }
  });

  it("un plazo que no cierra en años deja el último año incompleto", () => {
    const sim14 = simulateLoan({ ...HIPOTECA, termMonths: 14 });
    expect(sim14.years).toHaveLength(2);
    expect(sim14.years[0]!.months).toBe(12);
    expect(sim14.years[1]!.months).toBe(2);
  });
});

describe("shorterTermOptions", () => {
  it("30 años ofrece 20 y 15 (los otros dos plazos de catálogo)", () => {
    const input = { ...HIPOTECA, termMonths: 360 };
    const opciones = shorterTermOptions(input, simulateLoan(input));
    expect(opciones.map((o) => o.years)).toEqual([20, 15]);
  });

  it("los ahorros son los que salen de simular el plazo corto", () => {
    const input = { ...HIPOTECA, termMonths: 360 };
    const sim = simulateLoan(input);
    const opciones = shorterTermOptions(input, sim);

    for (const o of opciones) {
      const corta = simulateLoan({ ...input, termMonths: o.termMonths });
      expect(o.monthlyTotal).toBeCloseTo(corta.monthlyTotal, 2);
      expect(o.totalInterest).toBeCloseTo(corta.totalInterest, 2);
      expect(o.interestSaved).toBeCloseTo(sim.totalInterest - corta.totalInterest, 1);
      expect(o.monthlyDelta).toBeCloseTo(corta.monthlyTotal - sim.monthlyTotal, 2);
      expect(o.monthsSaved).toBe(sim.months - corta.months);
    }
  });

  it("acortar cuesta más por mes y ahorra intereses — siempre en ese sentido", () => {
    const input = { ...HIPOTECA, termMonths: 360 };
    const opciones = shorterTermOptions(input, simulateLoan(input));
    expect(opciones.length).toBeGreaterThan(0);
    for (const o of opciones) {
      expect(o.monthlyDelta).toBeGreaterThan(0);
      expect(o.interestSaved).toBeGreaterThan(0);
      expect(o.monthsSaved).toBeGreaterThan(0);
    }
    // Cuanto más corto, más se ahorra y más se paga por mes.
    const [a, b] = opciones;
    if (a && b) {
      expect(b.years).toBeLessThan(a.years);
      expect(b.interestSaved).toBeGreaterThan(a.interestSaved);
      expect(b.monthlyDelta).toBeGreaterThan(a.monthlyDelta);
    }
  });

  it("el seguro no distorsiona el ahorro de intereses (pero sí la diferencia de cuota)", () => {
    const input = { ...HIPOTECA, termMonths: 360, insuranceMonthly: 20_000 };
    const conSeguro = shorterTermOptions(input, simulateLoan(input));
    const sinSeguro = shorterTermOptions(
      { ...input, insuranceMonthly: 0 },
      simulateLoan({ ...input, insuranceMonthly: 0 }),
    );
    expect(conSeguro[0]!.interestSaved).toBeCloseTo(sinSeguro[0]!.interestSaved, 1);
    // El seguro se paga en los dos plazos, así que se cancela en el delta de cuota.
    expect(conSeguro[0]!.monthlyDelta).toBeCloseTo(sinSeguro[0]!.monthlyDelta, 2);
  });

  it("un plazo de 1 año no tiene escalón debajo → sin comparación", () => {
    const input = { ...HIPOTECA, termMonths: 12 };
    expect(shorterTermOptions(input, simulateLoan(input))).toEqual([]);
  });

  it("sin datos suficientes no inventa opciones", () => {
    const input = { ...HIPOTECA, principal: 0 };
    expect(shorterTermOptions(input, simulateLoan(input))).toEqual([]);
  });
});

describe("buildDebtSimInsights", () => {
  const base = (input: LoanSimInput) => {
    const sim = simulateLoan(input);
    return { input, sim, shorter: shorterTermOptions(input, sim) };
  };

  it("simulación vacía → sin lecturas", () => {
    const input = { ...HIPOTECA, principal: 0 };
    expect(buildDebtSimInsights({ ...base(input), context: null, fmt })).toEqual([]);
  });

  it("siempre cierra devolviendo la decisión al usuario", () => {
    const out = buildDebtSimInsights({ ...base(HIPOTECA), context: null, fmt });
    expect(out[out.length - 1]!.kind).toBe("cierre");
    expect(out[out.length - 1]!.title).toContain("decisión es tuya");
  });

  it("intereses por encima del capital → tono de aviso con el porcentaje real", () => {
    const input = { ...HIPOTECA, termMonths: 360 };
    const b = base(input);
    const out = buildDebtSimInsights({ ...b, context: null, fmt });
    const i = out.find((x) => x.kind === "interes_vs_capital")!;
    const ratio = b.sim.totalInterest / input.principal;
    expect(i.tone).toBe("warn");
    expect(i.body).toContain(String(Math.round(b.sim.totalInterest)));
    expect(i.body).toContain(`${(ratio * 100).toFixed(0)}%`);
  });

  it("intereses bajos → informa sin avisar", () => {
    const input = { ...HIPOTECA, aprPct: 5, termMonths: 60 };
    const out = buildDebtSimInsights({ ...base(input), context: null, fmt });
    expect(out.find((x) => x.kind === "interes_vs_capital")!.tone).toBe("info");
  });

  it("plazo corto: el titular lleva el ahorro que devuelve shorterTermOptions", () => {
    const input = { ...HIPOTECA, termMonths: 360 };
    const b = base(input);
    const out = buildDebtSimInsights({ ...b, context: null, fmt });
    const i = out.find((x) => x.kind === "plazo_corto")!;
    const primera = b.shorter[0]!;
    expect(i.title).toContain(String(Math.round(primera.interestSaved)));
    expect(i.title).toContain(`${primera.years} años`);
    expect(i.body).toContain(String(Math.round(primera.monthlyDelta)));
    expect(i.body).toContain(`${primera.monthsSaved} meses antes`);
    // La segunda opción se menciona en la cola del cuerpo.
    expect(i.body).toContain(`${b.shorter[1]!.years} años`);
  });

  it("sin plazo más corto posible no se inventa la lectura", () => {
    const input = { ...HIPOTECA, termMonths: 12 };
    const out = buildDebtSimInsights({ ...base(input), context: null, fmt });
    expect(out.find((x) => x.kind === "plazo_corto")).toBeUndefined();
  });

  it("seguro: pesa lo que suma en todo el plazo", () => {
    const input = { ...HIPOTECA, insuranceMonthly: 15_000 };
    const b = base(input);
    const out = buildDebtSimInsights({ ...b, context: null, fmt });
    const i = out.find((x) => x.kind === "seguro")!;
    expect(i.body).toContain(String(Math.round(b.sim.totalInsurance)));
    expect(b.sim.totalInsurance).toBeCloseTo(15_000 * 180, 0);
  });

  it("sin seguro no aparece la lectura del seguro", () => {
    const out = buildDebtSimInsights({ ...base(HIPOTECA), context: null, fmt });
    expect(out.find((x) => x.kind === "seguro")).toBeUndefined();
  });

  it("sin contexto del usuario no se habla de capacidad", () => {
    const out = buildDebtSimInsights({ ...base(HIPOTECA), context: null, fmt });
    expect(out.find((x) => x.kind === "capacidad")).toBeUndefined();
  });
});

describe("capacidad · el DTI usa las deudas reales del usuario", () => {
  const b = (() => {
    const sim = simulateLoan(HIPOTECA);
    return { input: HIPOTECA, sim, shorter: shorterTermOptions(HIPOTECA, sim) };
  })();

  it("compara la cuota contra el flujo libre", () => {
    const out = buildDebtSimInsights({
      ...b,
      context: { incomeMonthly: 0, freeCashflow: b.sim.monthlyTotal * 2, existingDebtPayments: 0 },
      fmt,
    });
    // La cuota es exactamente la mitad del sobrante.
    expect(out.find((x) => x.kind === "capacidad")!.body).toContain("50% de tu flujo libre");
  });

  it("cuota mayor que el flujo libre → aviso explícito", () => {
    const out = buildDebtSimInsights({
      ...b,
      context: { incomeMonthly: 0, freeCashflow: b.sim.monthlyTotal / 2, existingDebtPayments: 0 },
      fmt,
    });
    const i = out.find((x) => x.kind === "capacidad")!;
    expect(i.tone).toBe("warn");
    expect(i.title).toContain("no cabe en tu flujo libre");
  });

  it("flujo libre cero o negativo → lo dice en vez de dividir por cero", () => {
    const out = buildDebtSimInsights({
      ...b,
      context: { incomeMonthly: 1_000_000, freeCashflow: -50_000, existingDebtPayments: 0 },
      fmt,
    });
    const i = out.find((x) => x.kind === "capacidad")!;
    expect(i.tone).toBe("warn");
    expect(i.body).not.toContain("Infinity");
    expect(i.body).not.toContain("NaN");
  });

  it("el 'antes' sale de las cuotas que YA tiene, no de cero", () => {
    const existentes = 200_000;
    const ingreso = 2_000_000;
    const out = buildDebtSimInsights({
      ...b,
      context: {
        incomeMonthly: ingreso,
        freeCashflow: 1_000_000,
        existingDebtPayments: existentes,
      },
      fmt,
    });
    const i = out.find((x) => x.kind === "capacidad")!;
    const antes = existentes / ingreso; // 10%
    const despues = (existentes + b.sim.monthlyTotal) / ingreso;
    expect(i.body).toContain(`del ${(antes * 100).toFixed(0)}%`);
    expect(i.body).toContain(`al ${(despues * 100).toFixed(0)}%`);
    // Y no es el mismo número que si no tuviera deudas: el contexto real cambia la lectura.
    const sinDeudas = buildDebtSimInsights({
      ...b,
      context: { incomeMonthly: ingreso, freeCashflow: 1_000_000, existingDebtPayments: 0 },
      fmt,
    }).find((x) => x.kind === "capacidad")!;
    expect(sinDeudas.body).toContain("del 0%");
    expect(sinDeudas.body).not.toBe(i.body);
  });

  it("pasar del umbral alto por las deudas existentes cambia el tono a aviso", () => {
    const ingreso = 2_000_000;
    // Cuotas actuales que, sumadas a la nueva, cruzan el 40%.
    const existentes = ingreso * UMBRAL_DTI_ALTO;
    const out = buildDebtSimInsights({
      ...b,
      context: {
        incomeMonthly: ingreso,
        freeCashflow: 1_500_000,
        existingDebtPayments: existentes,
      },
      fmt,
    });
    const i = out.find((x) => x.kind === "capacidad")!;
    expect(i.tone).toBe("warn");
    expect(i.title).toContain("zona de riesgo");
  });

  it("carga holgada → informa sin dramatizar", () => {
    const out = buildDebtSimInsights({
      ...b,
      context: { incomeMonthly: 20_000_000, freeCashflow: 10_000_000, existingDebtPayments: 0 },
      fmt,
    });
    expect(out.find((x) => x.kind === "capacidad")!.tone).toBe("info");
  });
});

describe('la voz: voseo en web, "tú" en móvil', () => {
  const input = { ...HIPOTECA, termMonths: 360 };
  const sim = simulateLoan(input);
  const shorter = shorterTermOptions(input, sim);
  const lecturas = (voz?: "vos" | "tu") =>
    buildDebtSimInsights({
      input,
      sim,
      shorter,
      context: { incomeMonthly: 0, freeCashflow: 0, existingDebtPayments: 0 },
      fmt,
      voz,
    });
  const texto = (out: ReturnType<typeof lecturas>) =>
    out.map((i) => `${i.title} ${i.body}`).join(" ");

  it("por defecto vosea (la web es la superficie principal)", () => {
    const t = texto(lecturas());
    expect(t).toContain("pedís");
    expect(t).toContain("devolvés");
    expect(t).toContain("ahorrás");
    expect(t).toContain("Simulá");
    expect(t).toContain("tenés");
  });

  it('con voz "tu" no queda NINGUNA forma de voseo', () => {
    const t = texto(lecturas("tu"));
    for (const vos of ["pedís", "devolvés", "ahorrás", "terminás", "pagás", "Simulá", "tenés"]) {
      expect(t).not.toContain(vos);
    }
    expect(t).toContain("pides");
    expect(t).toContain("devuelves");
    expect(t).toContain("ahorras");
    expect(t).toContain("Simula");
    expect(t).toContain("tienes");
  });

  it("la voz cambia las palabras, no los números", () => {
    const a = lecturas("vos");
    const b = lecturas("tu");
    expect(a.map((i) => i.kind)).toEqual(b.map((i) => i.kind));
    expect(a.map((i) => i.tone)).toEqual(b.map((i) => i.tone));
    // El ahorro del plazo corto es el mismo dato en las dos voces.
    const saved = String(Math.round(shorter[0]!.interestSaved));
    expect(a.find((i) => i.kind === "plazo_corto")!.title).toContain(saved);
    expect(b.find((i) => i.kind === "plazo_corto")!.title).toContain(saved);
  });

  it("el escenario para el asesor también sigue la voz", () => {
    expect(escenarioParaAsesor({ input, sim, currency: "CRC", fmt })).toContain("mirarías vos");
    expect(escenarioParaAsesor({ input, sim, currency: "CRC", fmt, voz: "tu" })).toContain(
      "mirarías tú",
    );
  });
});

describe("escenarioParaAsesor", () => {
  it("resume capital, tasa, plazo y los tres números del resultado", () => {
    const sim = simulateLoan(HIPOTECA);
    const txt = escenarioParaAsesor({ input: HIPOTECA, sim, currency: "CRC", fmt });
    expect(txt).toContain("10000000");
    expect(txt).toContain("12% anual");
    expect(txt).toContain("15 años");
    expect(txt).toContain(String(Math.round(sim.monthlyTotal)));
    expect(txt).toContain(String(Math.round(sim.totalInterest)));
    expect(txt).toContain("CRC");
  });

  it("solo menciona el seguro cuando lo hay", () => {
    const sinSeguro = simulateLoan(HIPOTECA);
    expect(
      escenarioParaAsesor({ input: HIPOTECA, sim: sinSeguro, currency: "CRC", fmt }),
    ).not.toContain("seguro");

    const input = { ...HIPOTECA, insuranceMonthly: 15_000 };
    const txt = escenarioParaAsesor({ input, sim: simulateLoan(input), currency: "CRC", fmt });
    expect(txt).toContain("seguro mensual");
  });
});

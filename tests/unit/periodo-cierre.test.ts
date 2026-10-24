import { describe, it, expect } from "vitest";
import { nombreDelMes, rotuloConCierre } from "@/modules/rich-life/engine/periodo-cierre";
import { computeRichLifeIndicators } from "@/modules/rich-life/engine/rich-life-engine";
import type { RichLifeInput, Asset, Liability } from "@/modules/rich-life/types";

const assets: Asset[] = [
  {
    id: "1",
    name: "Cuenta",
    assetClass: "liquido",
    value: 10_000,
    currency: "CRC",
    generatesIncome: false,
  },
];
const liabilities: Liability[] = [
  { id: "2", name: "Tarjeta", liabilityClass: "critico", balance: 2_000, currency: "CRC" },
];

const base = (over: Partial<RichLifeInput> = {}): RichLifeInput => ({
  assets,
  liabilities,
  passiveIncomeMonthly: 0,
  monthlyExpenses: 1_000,
  freeCashflow: 0,
  protectionScore: 60,
  diversification: "media",
  previous: null,
  currency: "CRC",
  ...over,
});

describe("nombreDelMes", () => {
  it("nombra los doce meses desde el primer día del periodo", () => {
    expect(nombreDelMes("2026-01-01")).toBe("enero");
    expect(nombreDelMes("2026-08-01")).toBe("agosto");
    expect(nombreDelMes("2026-09-01")).toBe("setiembre");
    expect(nombreDelMes("2026-12-01")).toBe("diciembre");
  });

  it("no depende de la zona horaria: enero no se vuelve diciembre", () => {
    // `new Date("2026-01-01").getMonth()` en UTC−6 devuelve 11 (diciembre del año
    // anterior). El parseo por cadena es lo que impide ese corrimiento.
    expect(nombreDelMes("2026-01-01")).toBe("enero");
  });

  it("devuelve null en lugar de inventar un mes", () => {
    expect(nombreDelMes(null)).toBeNull();
    expect(nombreDelMes(undefined)).toBeNull();
    expect(nombreDelMes("")).toBeNull();
    expect(nombreDelMes("2026")).toBeNull();
    expect(nombreDelMes("2026-13-01")).toBeNull();
    expect(nombreDelMes("2026-00-01")).toBeNull();
    expect(nombreDelMes("2026-ago-01")).toBeNull();
  });
});

describe("rotuloConCierre", () => {
  it("nombra el cierre en el veredicto positivo", () => {
    expect(rotuloConCierre("Te estás haciendo más rico", "2026-08-01")).toBe(
      "Te estás haciendo más rico · cierre de agosto",
    );
  });

  it("nombra el cierre en el veredicto negativo", () => {
    expect(rotuloConCierre("Te estás haciendo más pobre", "2026-02-01")).toBe(
      "Te estás haciendo más pobre · cierre de febrero",
    );
  });

  it("sin periodo reconocible deja el rótulo intacto", () => {
    expect(rotuloConCierre("Mes en curso", null)).toBe("Mes en curso");
    expect(rotuloConCierre("Tu punto de partida", "2026-99-01")).toBe("Tu punto de partida");
  });
});

describe("closedPeriod en los indicadores", () => {
  it("viaja con el veredicto positivo", () => {
    const ind = computeRichLifeIndicators(
      base({ closedWealthDelta: 1_000, closedPeriod: "2026-08-01" }),
    );
    expect(ind.trend).toBe("mas_rico");
    expect(ind.closedPeriod).toBe("2026-08-01");
    expect(rotuloConCierre("Te estás haciendo más rico", ind.closedPeriod)).toContain(
      "cierre de agosto",
    );
  });

  it("viaja con el veredicto negativo", () => {
    const ind = computeRichLifeIndicators(
      base({ closedWealthDelta: -1_000, closedPeriod: "2026-08-01" }),
    );
    expect(ind.trend).toBe("mas_pobre");
    expect(ind.closedPeriod).toBe("2026-08-01");
  });

  it("es null cuando el mes está en curso: no hay cierre que nombrar", () => {
    // Hay un cierre previo (`previous`) pero no dos consecutivos, así que el veredicto es
    // "en curso". Rotularlo con un mes sería nombrar un veredicto que no se emitió.
    const ind = computeRichLifeIndicators(
      base({ previous: { netWorth: 5_000 }, closedPeriod: "2026-08-01" }),
    );
    expect(ind.trend).toBe("en_curso");
    expect(ind.closedPeriod).toBeNull();
  });

  it("es null sin histórico", () => {
    const ind = computeRichLifeIndicators(base());
    expect(ind.trend).toBe("sin_historico");
    expect(ind.closedPeriod).toBeNull();
  });
});

describe("el porcentaje de activos productivos habla de renta, no de capital", () => {
  it("la lectura dice «genera renta» y no «trabaja para ti»", async () => {
    const { buildRichLifeSnapshot } = await import("@/modules/rich-life/engine/rich-life-engine");
    const snap = buildRichLifeSnapshot(base());
    expect(snap.reading).toContain("de tus activos genera renta");
    expect(snap.reading).not.toContain("trabaja para ti");
  });
});

import { describe, it, expect } from "vitest";
import {
  monthlyize,
  monthlyPlanned,
  esSubMensual,
  mesesEntrePagos,
} from "@/modules/financial-base/engine/monthlyize";
import {
  caeEnElPeriodo,
  requiereAncla,
  proximosPeriodos,
  mesesEntre,
  periodoDeAncla,
} from "@/modules/financial-base/engine/income-schedule";
import {
  etiquetaMonto,
  equivalenteMensual,
  ayudaMonto,
} from "@/modules/financial-base/engine/frequency-copy";
import { suggestedReceipt } from "@/modules/financial-base/engine/income-receipt";

const crc = (n: number) => `CRC ${n}`;

/**
 * SEMÁNTICA ÚNICA: el monto de una fuente es SIEMPRE lo que se recibe POR PAGO.
 * Estos tests fijan los dos números que se derivan de ahí y que NO son lo mismo:
 * el promedio mensual (indicadores) y el flujo del mes (presupuesto).
 */
describe("semántica única del monto de una fuente", () => {
  describe("quincena de 800.000", () => {
    const QUINCENA = 800_000;

    it("mensualizado = 1.600.000 (dos pagos al mes)", () => {
      expect(monthlyize(QUINCENA, "quincenal")).toBe(1_600_000);
    });

    it("el flujo del mes también es 1.600.000: la línea agrupa los dos pagos", () => {
      expect(monthlyPlanned(QUINCENA, "quincenal")).toBe(1_600_000);
    });

    it("la sugerencia de cobro es 800.000 — el pago, no la mitad ni el mes", () => {
      const fuente = { amount: QUINCENA, frequency: "quincenal", recurringItemId: "r1" };
      expect(suggestedReceipt(fuente, 0)).toBe(800_000);
      expect(suggestedReceipt(fuente, 800_000)).toBe(800_000);
    });

    it("la vista previa muestra el equivalente mensual", () => {
      expect(equivalenteMensual(QUINCENA, "quincenal", crc)).toBe(`= ${crc(1_600_000)}/mes`);
    });

    it("la etiqueta del monto se ancla a la frecuencia", () => {
      expect(etiquetaMonto("quincenal")).toBe("Monto por quincena");
    });
  });

  describe("bimensual de 500.000 anclado en enero", () => {
    const PAGO = 500_000;
    const ANCLA = "2026-01-01";

    it("mensualizado = 250.000 (promedio para indicadores)", () => {
      expect(monthlyize(PAGO, "bimensual")).toBe(250_000);
    });

    it("el flujo del mes en que cae es el pago PLENO, no el promedio", () => {
      // Prorratear acá sería contar la mitad Y saltarse los meses sin pago:
      // la fuente se subestimaría al 50 %.
      expect(monthlyPlanned(PAGO, "bimensual")).toBe(500_000);
    });

    it("aparece en enero, marzo, mayo… y NO en febrero, abril, junio", () => {
      const cae = (year: number, month: number) =>
        caeEnElPeriodo("bimensual", ANCLA, { year, month });

      expect(cae(2026, 1)).toBe(true);
      expect(cae(2026, 2)).toBe(false);
      expect(cae(2026, 3)).toBe(true);
      expect(cae(2026, 4)).toBe(false);
      expect(cae(2026, 5)).toBe(true);
      expect(cae(2026, 6)).toBe(false);
    });

    it("la fase se mantiene al cruzar el año", () => {
      expect(caeEnElPeriodo("bimensual", ANCLA, { year: 2026, month: 11 })).toBe(true);
      expect(caeEnElPeriodo("bimensual", ANCLA, { year: 2027, month: 1 })).toBe(true);
      expect(caeEnElPeriodo("bimensual", ANCLA, { year: 2027, month: 2 })).toBe(false);
    });

    it("no se agenda antes del primer pago", () => {
      expect(caeEnElPeriodo("bimensual", ANCLA, { year: 2025, month: 11 })).toBe(false);
      expect(caeEnElPeriodo("bimensual", ANCLA, { year: 2025, month: 12 })).toBe(false);
    });

    it("la vista previa dice el promedio y que no llega todos los meses", () => {
      expect(equivalenteMensual(PAGO, "bimensual", crc)).toBe(
        `= ${crc(250_000)}/mes en promedio (llega cada 2 meses)`,
      );
    });

    it("la etiqueta desambigua el bimensual del español", () => {
      expect(etiquetaMonto("bimensual")).toBe("Monto por pago (cada 2 meses)");
    });

    it("la agenda previsualiza los próximos meses de pago", () => {
      const meses = proximosPeriodos("bimensual", ANCLA, { year: 2026, month: 1 }, 4).map(
        (p) => p.month,
      );
      expect(meses).toEqual([1, 3, 5, 7]);
    });
  });

  describe("la vista previa muestra el equivalente correcto para cada frecuencia", () => {
    it("semanal: el monto semanal, no un cuarto", () => {
      expect(monthlyize(100, "semanal")).toBe(433.33);
      expect(suggestedReceipt({ amount: 100, frequency: "semanal" }, 0)).toBe(100);
      expect(etiquetaMonto("semanal")).toBe("Monto por semana");
    });

    it("mensual: sin vista previa (no hay nada que convertir)", () => {
      expect(equivalenteMensual(1000, "mensual", crc)).toBeNull();
      expect(ayudaMonto("mensual")).toBeNull();
    });

    it("anual de 1.200.000 da 100.000/mes en promedio", () => {
      expect(monthlyize(1_200_000, "anual")).toBe(100_000);
      expect(equivalenteMensual(1_200_000, "anual", crc)).toBe(
        `= ${crc(100_000)}/mes en promedio (llega cada 12 meses)`,
      );
    });

    it("sin monto todavía no hay vista previa", () => {
      expect(equivalenteMensual(0, "quincenal", crc)).toBeNull();
      expect(equivalenteMensual(NaN, "quincenal", crc)).toBeNull();
    });
  });
});

describe("clasificación de frecuencias", () => {
  it("sub-mensual = más de un pago al mes", () => {
    expect(esSubMensual("diario")).toBe(true);
    expect(esSubMensual("semanal")).toBe(true);
    expect(esSubMensual("quincenal")).toBe(true);
    expect(esSubMensual("mensual")).toBe(false);
    expect(esSubMensual("bimensual")).toBe(false);
  });

  it("meses entre pagos", () => {
    expect(mesesEntrePagos("quincenal")).toBe(1);
    expect(mesesEntrePagos("mensual")).toBe(1);
    expect(mesesEntrePagos("bimensual")).toBe(2);
    expect(mesesEntrePagos("trimestral")).toBe(3);
    expect(mesesEntrePagos("cuatrimestral")).toBe(4);
    expect(mesesEntrePagos("semestral")).toBe(6);
    expect(mesesEntrePagos("anual")).toBe(12);
  });

  it("sólo las multi-mes piden ancla", () => {
    expect(requiereAncla("mensual")).toBe(false);
    expect(requiereAncla("quincenal")).toBe(false);
    expect(requiereAncla("unico")).toBe(false);
    expect(requiereAncla("bimensual")).toBe(true);
    expect(requiereAncla("semestral")).toBe(true);
    expect(requiereAncla("anual")).toBe(true);
  });
});

describe("agenda: casos de borde", () => {
  it("las frecuencias de un pago al mes o más caen todos los meses", () => {
    for (const f of ["diario", "semanal", "quincenal", "mensual", "variable"] as const) {
      expect(caeEnElPeriodo(f, null, { year: 2026, month: 2 })).toBe(true);
      expect(caeEnElPeriodo(f, null, { year: 2026, month: 7 })).toBe(true);
    }
  });

  it("unico nunca se agenda: es un extraordinario, se registra a mano", () => {
    expect(caeEnElPeriodo("unico", null, { year: 2026, month: 3 })).toBe(false);
    expect(caeEnElPeriodo("unico", "2026-03-01", { year: 2026, month: 3 })).toBe(false);
  });

  it("multi-mes SIN ancla cae todos los meses (heredadas: no desaparecen)", () => {
    expect(caeEnElPeriodo("bimensual", null, { year: 2026, month: 2 })).toBe(true);
    expect(caeEnElPeriodo("anual", "", { year: 2026, month: 8 })).toBe(true);
  });

  it("un ancla ilegible se trata como ausente, no rompe", () => {
    expect(periodoDeAncla("nope")).toBeNull();
    expect(periodoDeAncla(null)).toBeNull();
    expect(caeEnElPeriodo("bimensual", "nope", { year: 2026, month: 2 })).toBe(true);
  });

  it("mesesEntre cuenta con signo y cruza años", () => {
    expect(mesesEntre({ year: 2026, month: 1 }, { year: 2026, month: 3 })).toBe(2);
    expect(mesesEntre({ year: 2026, month: 11 }, { year: 2027, month: 1 })).toBe(2);
    expect(mesesEntre({ year: 2026, month: 5 }, { year: 2026, month: 2 })).toBe(-3);
  });

  it("un semestral anclado en marzo cae en marzo y septiembre", () => {
    const meses = proximosPeriodos("semestral", "2026-03-01", { year: 2026, month: 1 }, 3);
    expect(meses).toEqual([
      { year: 2026, month: 3 },
      { year: 2026, month: 9 },
      { year: 2027, month: 3 },
    ]);
  });
});

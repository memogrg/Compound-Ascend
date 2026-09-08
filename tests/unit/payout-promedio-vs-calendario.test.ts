/**
 * Los DOS números del rendimiento de una inversión, y quién usa cada uno.
 *
 * Es el corte de #740 aplicado al payout:
 *
 *   · PROMEDIO (`monthlyize`) → indicadores longitudinales: cobertura de ingreso
 *     pasivo, score de salud, snapshots, los tres números. Estable los doce
 *     meses. La pregunta que responde —"¿cuánto de mi vida pagan mis activos?"—
 *     no cambia porque el emisor pague en marzo y no en abril.
 *   · CALENDARIO (`monthlyPlanned`) → la línea del presupuesto y el flujo del
 *     mes: el pago COMPLETO, sólo en los meses que toca.
 *
 * Mezclarlos fue el bug: mientras la cobertura pasiva leía la línea del
 * presupuesto, un cupón trimestral la hacía decir 0% dos meses y el triple el
 * tercero. Este archivo fija que los dos números existan, difieran, y describan
 * el mismo año.
 */
import { describe, it, expect } from "vitest";
import {
  promedioMensualPayout,
  promedioMensualRenta,
  promedioMensualHistorial,
} from "@/modules/financial-base/engine/ingreso-derivado";
import { caeEnElPeriodo } from "@/modules/financial-base/engine/income-schedule";
import { calcularRendimiento } from "@/lib/finance/rendimiento-periodico";

/** Cupón trimestral del 8% anual sobre $10.000, con 10% de retención. */
const NOTA = {
  quantity: 1,
  average_cost: 10_000,
  payout_enabled: true,
  payout_mode: "yield",
  payout_rate_pct: 8,
  payout_frequency: "trimestral",
  payout_withholding_pct: 10,
};
const ANCLA = "2026-03-15";
const MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

describe("el promedio: estable los doce meses", () => {
  it("un cupón trimestral promedia $60 netos al mes", () => {
    // 8% de 10.000 = 800 al año → 200 por cupón, −10% = 180 netos → 60/mes.
    expect(promedioMensualPayout(NOTA)).toBe(60);
  });

  it("vale lo MISMO en los doce meses del año", () => {
    // Éste es el test que importa: la cobertura pasiva no puede moverse con el
    // calendario de cobro. El promedio ni siquiera recibe el periodo.
    const valores = MESES.map(() => promedioMensualPayout(NOTA));
    expect(new Set(valores).size).toBe(1);
    expect(valores.every((v) => v === 60)).toBe(true);
  });

  it("una renta semestral también promedia, no salta", () => {
    expect(promedioMensualRenta({ rental_income: 600, rental_frequency: "semestral" })).toBe(100);
  });

  it("el historial de 12 meses ya era un promedio y sigue siéndolo", () => {
    expect(promedioMensualHistorial(1_200)).toBe(100);
  });
});

describe("el calendario: sólo en sus meses", () => {
  const caeEnElMes = (month: number) => caeEnElPeriodo("trimestral", ANCLA, { year: 2026, month });

  it("la línea del presupuesto aparece en marzo, junio, septiembre y diciembre", () => {
    expect(MESES.filter(caeEnElMes)).toEqual([3, 6, 9, 12]);
  });

  it("y en esos meses vale el pago COMPLETO, no el promedio", () => {
    const neto = calcularRendimiento(
      {
        modo: "yield",
        yieldPct: 8,
        frecuencia: "trimestral",
        retencionPct: 10,
      },
      10_000,
    ).netoPorPago;
    expect(neto).toBe(180);
    expect(neto).not.toBe(promedioMensualPayout(NOTA));
  });
});

describe("los dos números describen el mismo año", () => {
  it("12 × promedio = 4 × pago: ni se pierde ni se inventa plata", () => {
    // Si esta identidad se rompe, uno de los dos está mintiendo.
    const promedioAnual = promedioMensualPayout(NOTA) * 12;
    const pagosDelAno =
      calcularRendimiento(
        { modo: "yield", yieldPct: 8, frecuencia: "trimestral", retencionPct: 10 },
        10_000,
      ).netoPorPago * 4;
    expect(promedioAnual).toBeCloseTo(pagosDelAno, 2);
    expect(promedioAnual).toBe(720);
  });
});

describe("el pago único al vencimiento", () => {
  const alVencimiento = { ...NOTA, payout_frequency: "al_vencimiento" };

  it("promedia CERO: no es ingreso recurrente", () => {
    // Diluirlo a lo largo del plazo diría que hoy cubre gastos que hoy no cubre.
    expect(promedioMensualPayout(alVencimiento)).toBe(0);
  });

  it("una renta al vencimiento tampoco promedia", () => {
    expect(promedioMensualRenta({ rental_income: 5_000, rental_frequency: "al_vencimiento" })).toBe(
      0,
    );
  });
});

describe("sin configuración no se inventa rendimiento", () => {
  it("payout apagado promedia cero", () => {
    expect(promedioMensualPayout({ ...NOTA, payout_enabled: false })).toBe(0);
  });

  it("una frecuencia que el motor no conoce promedia cero, no 'mensual'", () => {
    // 'bimestral' no existe (la grafía es 'bimensual'): antes un lookup fallido
    // caía en factor 1 y se contaba como si llegara todos los meses.
    expect(promedioMensualPayout({ ...NOTA, payout_frequency: "bimestral" })).toBe(0);
  });
});

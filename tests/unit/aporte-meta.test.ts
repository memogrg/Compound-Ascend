/**
 * Reglas del aporte a una meta. Puras: las comparten el modal de Ahorro (web), la fila del frasco
 * de Ahorro en Gastos (web) y el formulario de metas del móvil, que tienen primitivos distintos
 * pero no pueden diferir en la REGLA.
 */
import { describe, it, expect } from "vitest";
import {
  montoSugerido,
  avanceMes,
  textoAvanceMes,
  validarAporte,
  aporteValido,
  type AporteContext,
} from "@/modules/control/engine/aporte-meta";

const ctx = (over: Partial<AporteContext> = {}): AporteContext => ({
  goalId: "g1",
  goalName: "Viaje",
  currency: "CRC",
  monthlyContribution: 50000,
  currentAmount: 200000,
  targetAmount: 1000000,
  aportadoMes: 0,
  ...over,
});

/** Formateador trivial: el texto se prueba sin depender del formato real. */
const fmt = (m: number, c: string) => `${c}${m}`;

describe("montoSugerido", () => {
  /**
   * El punto: quien cobra dos veces al mes aporta en dos partes. Proponer el aporte ENTERO la
   * segunda vez le duplicaría el mes si acepta el número sin mirar.
   */
  it("propone lo que FALTA del mes, no el aporte entero", () => {
    expect(montoSugerido(ctx({ aportadoMes: 0 }))).toBe(50000);
    expect(montoSugerido(ctx({ aportadoMes: 30000 }))).toBe(20000);
  });

  it("no propone nada si el mes ya está cubierto", () => {
    expect(montoSugerido(ctx({ aportadoMes: 50000 }))).toBe(0);
    expect(montoSugerido(ctx({ aportadoMes: 90000 }))).toBe(0);
  });

  it("no propone nada si la meta no tiene plan mensual", () => {
    expect(montoSugerido(ctx({ monthlyContribution: 0 }))).toBe(0);
  });

  it("redondea a dos decimales (no arrastra el error del punto flotante)", () => {
    expect(montoSugerido(ctx({ monthlyContribution: 100, aportadoMes: 33.33 }))).toBe(66.67);
  });
});

describe("avanceMes", () => {
  it("marca pendiente solo cuando no hubo ningún aporte", () => {
    expect(avanceMes(ctx({ aportadoMes: 0 })).pendiente).toBe(true);
    expect(avanceMes(ctx({ aportadoMes: 1 })).pendiente).toBe(false);
  });

  it("el progreso se topa en 1 aunque se aporte de más", () => {
    expect(avanceMes(ctx({ aportadoMes: 200000 })).progreso).toBe(1);
    expect(avanceMes(ctx({ aportadoMes: 200000 })).cubierto).toBe(true);
  });

  it("sin plan mensual no hay progreso, pero un aporte cuenta como cubierto", () => {
    const a = avanceMes(ctx({ monthlyContribution: 0, aportadoMes: 5000 }));
    expect(a.progreso).toBe(0);
    expect(a.pendiente).toBe(false);
    expect(a.cubierto).toBe(true);
  });
});

describe("textoAvanceMes", () => {
  it("dice cuánto llevás de cuánto", () => {
    expect(textoAvanceMes(ctx({ aportadoMes: 30000 }), fmt)).toBe(
      "Llevás CRC30000 de CRC50000 este mes",
    );
  });

  it("distingue «sin aporte» de «aporté poco» — es la señal de pendiente", () => {
    expect(textoAvanceMes(ctx({ aportadoMes: 0 }), fmt)).toBe("Sin aporte este mes · plan CRC50000");
  });

  it("sin plan mensual no inventa un objetivo", () => {
    expect(textoAvanceMes(ctx({ monthlyContribution: 0, aportadoMes: 0 }), fmt)).toBe(
      "Sin aporte este mes",
    );
    expect(textoAvanceMes(ctx({ monthlyContribution: 0, aportadoMes: 7000 }), fmt)).toBe(
      "Llevás CRC7000 este mes",
    );
  });
});

describe("validarAporte", () => {
  const base = { moneda: "CRC", fecha: "2026-08-04", ctx: ctx(), hoy: "2026-08-04" };

  it("un aporte correcto no tiene errores", () => {
    expect(validarAporte({ ...base, monto: 25000 })).toEqual({});
    expect(aporteValido({ ...base, monto: 25000 })).toBe(true);
  });

  it("exige monto mayor que cero", () => {
    expect(validarAporte({ ...base, monto: null }).monto).toBe("Ingresá un monto");
    expect(validarAporte({ ...base, monto: 0 }).monto).toMatch(/mayor que cero/);
    expect(validarAporte({ ...base, monto: -5 }).monto).toMatch(/mayor que cero/);
  });

  /**
   * El aporte se guarda SIEMPRE en la moneda de la meta. El servicio lo rechaza igual, pero
   * decirlo al elegir la moneda evita un viaje de ida y vuelta para enterarse de algo que ya se
   * sabía.
   */
  it("avisa cuando la moneda no es la de la meta, nombrando las dos", () => {
    const e = validarAporte({ ...base, monto: 100, moneda: "USD" });
    expect(e.moneda).toContain("CRC");
    expect(e.moneda).toContain("USD");
  });

  it("rechaza fecha futura y formato inválido", () => {
    expect(validarAporte({ ...base, monto: 100, fecha: "2026-08-05" }).fecha).toMatch(/futura/);
    expect(validarAporte({ ...base, monto: 100, fecha: "04/08/2026" }).fecha).toBe("Fecha inválida");
  });

  it("hoy sí es válido (el borde, no un día antes)", () => {
    expect(validarAporte({ ...base, monto: 100, fecha: "2026-08-04" }).fecha).toBeUndefined();
  });
});

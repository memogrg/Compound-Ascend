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
  desglosePago,
  validarPago,
  pagoValido,
  type PagoContext,
} from "@/modules/control/engine/pago-vinculado";

const ctx = (over: Partial<PagoContext> = {}): PagoContext => ({
  kind: "meta",
  id: "g1",
  name: "Viaje",
  currency: "CRC",
  compromisoMensual: 50000,
  hechoMes: 0,
  ...over,
});

/** Deuda con tasa y plazo reales: el desglose puede estimar meses adelantados. */
const deuda = (over: Partial<PagoContext> = {}): PagoContext => ({
  kind: "deuda",
  id: "d1",
  name: "Tarjeta",
  currency: "CRC",
  compromisoMensual: 100000,
  hechoMes: 0,
  balance: 2000000,
  apr: 24,
  termMonths: 36,
  insurance: null,
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
    expect(montoSugerido(ctx({ hechoMes: 0 }))).toBe(50000);
    expect(montoSugerido(ctx({ hechoMes: 30000 }))).toBe(20000);
  });

  it("no propone nada si el mes ya está cubierto", () => {
    expect(montoSugerido(ctx({ hechoMes: 50000 }))).toBe(0);
    expect(montoSugerido(ctx({ hechoMes: 90000 }))).toBe(0);
  });

  it("no propone nada si la meta no tiene plan mensual", () => {
    expect(montoSugerido(ctx({ compromisoMensual: 0 }))).toBe(0);
  });

  it("redondea a dos decimales (no arrastra el error del punto flotante)", () => {
    expect(montoSugerido(ctx({ compromisoMensual: 100, hechoMes: 33.33 }))).toBe(66.67);
  });
});

describe("avanceMes", () => {
  it("marca pendiente solo cuando no hubo ningún aporte", () => {
    expect(avanceMes(ctx({ hechoMes: 0 })).pendiente).toBe(true);
    expect(avanceMes(ctx({ hechoMes: 1 })).pendiente).toBe(false);
  });

  it("el progreso se topa en 1 aunque se aporte de más", () => {
    expect(avanceMes(ctx({ hechoMes: 200000 })).progreso).toBe(1);
    expect(avanceMes(ctx({ hechoMes: 200000 })).cubierto).toBe(true);
  });

  it("sin plan mensual no hay progreso, pero un aporte cuenta como cubierto", () => {
    const a = avanceMes(ctx({ compromisoMensual: 0, hechoMes: 5000 }));
    expect(a.progreso).toBe(0);
    expect(a.pendiente).toBe(false);
    expect(a.cubierto).toBe(true);
  });
});

describe("textoAvanceMes", () => {
  it("dice cuánto llevás de cuánto", () => {
    expect(textoAvanceMes(ctx({ hechoMes: 30000 }), fmt)).toBe(
      "Llevás CRC30000 de CRC50000 este mes",
    );
  });

  it("distingue «sin aporte» de «aporté poco» — es la señal de pendiente", () => {
    expect(textoAvanceMes(ctx({ hechoMes: 0 }), fmt)).toBe("Sin aporte este mes · plan CRC50000");
  });

  it("sin plan mensual no inventa un objetivo", () => {
    expect(textoAvanceMes(ctx({ compromisoMensual: 0, hechoMes: 0 }), fmt)).toBe(
      "Sin aporte este mes",
    );
    expect(textoAvanceMes(ctx({ compromisoMensual: 0, hechoMes: 7000 }), fmt)).toBe(
      "Llevás CRC7000 este mes",
    );
  });
});

describe("validarAporte", () => {
  const base = { moneda: "CRC", fecha: "2026-08-04", ctx: ctx(), hoy: "2026-08-04" };

  it("un aporte correcto no tiene errores", () => {
    expect(validarPago({ ...base, monto: 25000 })).toEqual({});
    expect(pagoValido({ ...base, monto: 25000 })).toBe(true);
  });

  it("exige monto mayor que cero", () => {
    expect(validarPago({ ...base, monto: null }).monto).toBe("Ingresá un monto");
    expect(validarPago({ ...base, monto: 0 }).monto).toMatch(/mayor que cero/);
    expect(validarPago({ ...base, monto: -5 }).monto).toMatch(/mayor que cero/);
  });

  /**
   * El aporte se guarda SIEMPRE en la moneda de la meta. El servicio lo rechaza igual, pero
   * decirlo al elegir la moneda evita un viaje de ida y vuelta para enterarse de algo que ya se
   * sabía.
   */
  it("avisa cuando la moneda no es la de la meta, nombrando las dos", () => {
    const e = validarPago({ ...base, monto: 100, moneda: "USD" });
    expect(e.moneda).toContain("CRC");
    expect(e.moneda).toContain("USD");
  });

  it("rechaza fecha futura y formato inválido", () => {
    expect(validarPago({ ...base, monto: 100, fecha: "2026-08-05" }).fecha).toMatch(/futura/);
    expect(validarPago({ ...base, monto: 100, fecha: "04/08/2026" }).fecha).toBe("Fecha inválida");
  });

  it("hoy sí es válido (el borde, no un día antes)", () => {
    expect(validarPago({ ...base, monto: 100, fecha: "2026-08-04" }).fecha).toBeUndefined();
  });
});

describe("textoAvanceMes · deuda", () => {
  it("dice «Cuota pagada», no «₡X de ₡X»", () => {
    expect(textoAvanceMes(deuda({ hechoMes: 100000 }), fmt)).toBe("Cuota pagada");
  });

  it("cuando se abonó de más, lo separa del cumplimiento de la cuota", () => {
    expect(textoAvanceMes(deuda({ hechoMes: 150000 }), fmt)).toBe("Cuota pagada · CRC50000 extra");
  });

  it("sin pago del mes nombra la cuota, no «el plan»", () => {
    expect(textoAvanceMes(deuda(), fmt)).toBe("Sin pago este mes · cuota CRC100000");
  });

  it("un pago parcial se lee como parcial", () => {
    expect(textoAvanceMes(deuda({ hechoMes: 40000 }), fmt)).toBe(
      "Llevás CRC40000 de CRC100000 este mes",
    );
  });
});

describe("desglosePago", () => {
  /**
   * Espeja `estimatePaymentSplit`, que es lo que el servidor aplica: la cuota se cubre primero y
   * el excedente amortiza capital. Mostrarlo ANTES evita descubrir después que media cuota se fue
   * a capital.
   */
  it("separa cuota de abono extra", () => {
    const d = desglosePago(deuda(), 150000);
    expect(d.cuota).toBe(100000);
    expect(d.extra).toBe(50000);
  });

  it("un pago igual o menor a la cuota no genera extra", () => {
    expect(desglosePago(deuda(), 100000).extra).toBe(0);
    expect(desglosePago(deuda(), 60000)).toMatchObject({ cuota: 60000, extra: 0 });
  });

  it("sin cuota definida, todo el pago es cuota (no inventa un abono extra)", () => {
    const d = desglosePago(deuda({ compromisoMensual: 0 }), 80000);
    expect(d.cuota).toBe(80000);
    expect(d.extra).toBe(0);
  });

  it("estima los meses que se adelantan cuando hay tasa y cuota", () => {
    const d = desglosePago(deuda(), 400000);
    expect(d.extra).toBe(300000);
    expect(d.mesesAdelantados).not.toBeNull();
    expect(d.mesesAdelantados!).toBeGreaterThan(0);
  });

  /** Sin tasa el cronograma no significa nada: mejor no decir nada que inventar un número. */
  it("omite los meses adelantados cuando no hay con qué estimarlos", () => {
    expect(desglosePago(deuda({ apr: null }), 400000).mesesAdelantados).toBeNull();
    expect(desglosePago(deuda({ apr: 0 }), 400000).mesesAdelantados).toBeNull();
    expect(desglosePago(deuda({ balance: 0 }), 400000).mesesAdelantados).toBeNull();
  });

  it("una meta nunca trae desglose de cuota/extra", () => {
    expect(desglosePago(ctx(), 200000).mesesAdelantados).toBeNull();
  });

  it("un monto en cero no rompe", () => {
    expect(desglosePago(deuda(), 0)).toEqual({ cuota: 0, extra: 0, mesesAdelantados: null });
  });
});

describe("validarPago · deuda", () => {
  it("el aviso de moneda nombra a la DEUDA, no a la meta", () => {
    const e = validarPago({
      monto: 100,
      moneda: "USD",
      fecha: "2026-08-04",
      ctx: deuda(),
      hoy: "2026-08-04",
    });
    expect(e.moneda).toMatch(/la deuda est[áa]/);
  });
});

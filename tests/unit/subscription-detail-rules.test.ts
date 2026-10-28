import { describe, it, expect } from "vitest";
import {
  alVencer,
  detalleDeStripe,
  detalleDeTienda,
  fuenteDelDetalle,
  lineaDeRenovacion,
} from "@/lib/billing/subscription-detail-rules";

describe("fuenteDelDetalle", () => {
  it("el plan propio muestra el detalle de su origen", () => {
    expect(fuenteDelDetalle({ origen: "store", plan: "pro", planEfectivo: "pro" })).toBe("store");
    expect(fuenteDelDetalle({ origen: "stripe", plan: "max", planEfectivo: "max" })).toBe("stripe");
  });
  it("sin suscripción no hay detalle", () => {
    expect(fuenteDelDetalle({ origen: "ninguna", plan: "ninguno", planEfectivo: "ninguno" })).toBe(
      null,
    );
  });
  it("quien hereda del hogar no ve período ni fecha, aunque pague otro plan", () => {
    expect(fuenteDelDetalle({ origen: "ninguna", plan: "ninguno", planEfectivo: "max" })).toBe(
      null,
    );
    expect(fuenteDelDetalle({ origen: "stripe", plan: "esencial", planEfectivo: "max" })).toBe(
      null,
    );
  });
});

describe("alVencer", () => {
  it("sin pendiente, o con el mismo plan pendiente, renueva", () => {
    expect(alVencer({ plan: "pro", plan_pending: null })).toEqual({ tipo: "renueva" });
    expect(alVencer({ plan: "pro", plan_pending: "pro" })).toEqual({ tipo: "renueva" });
  });
  it("'ninguno' pendiente, o cancelada al final del período, termina", () => {
    expect(alVencer({ plan: "pro", plan_pending: "ninguno" })).toEqual({ tipo: "termina" });
    expect(alVencer({ plan: "pro", plan_pending: null, cancelaAlFinal: true })).toEqual({
      tipo: "termina",
    });
  });
  it("otro plan pago pendiente: cambia a ese plan", () => {
    expect(alVencer({ plan: "pro", plan_pending: "esencial" })).toEqual({
      tipo: "cambia",
      a: "esencial",
    });
    expect(alVencer({ plan: "esencial", plan_pending: "max" })).toEqual({
      tipo: "cambia",
      a: "max",
    });
  });
  it("la cancelación gana sobre un cambio pendiente", () => {
    expect(alVencer({ plan: "pro", plan_pending: "esencial", cancelaAlFinal: true })).toEqual({
      tipo: "termina",
    });
  });
});

const RENUEVA = { tipo: "renueva" } as const;

describe("detalleDeTienda", () => {
  const FIN = "2026-11-12T18:00:00.000Z";

  it.each([
    ["cartera_proplus_mensual:mensual", "mensual"], // Play, base plan mensual
    ["cartera_proplus_mensual:anual", "anual"], // Play, base plan anual
    ["cartera_maxplus_mensual", "mensual"], // Apple mensual
    ["cartera_esencial_anual", "anual"], // Apple anual
  ] as const)("%s → %s", (producto, periodo) => {
    expect(
      detalleDeTienda({
        plan: "pro",
        store_product_id: producto,
        store_period_end: FIN,
        plan_pending: null,
      }),
    ).toEqual({ periodo, renuevaEl: FIN, alVencer: RENUEVA });
  });

  it("producto desconocido o ausente: sin detalle", () => {
    for (const store_product_id of [null, "otro_producto", ""]) {
      expect(
        detalleDeTienda({
          plan: "pro",
          store_product_id,
          store_period_end: FIN,
          plan_pending: null,
        }),
      ).toBeNull();
    }
  });

  it("'ninguno' pendiente termina; otro plan pago pendiente cambia", () => {
    const base = {
      plan: "pro",
      store_product_id: "cartera_proplus_anual",
      store_period_end: FIN,
    } as const;
    expect(detalleDeTienda({ ...base, plan_pending: "ninguno" })?.alVencer).toEqual({
      tipo: "termina",
    });
    expect(detalleDeTienda({ ...base, plan_pending: "esencial" })?.alVencer).toEqual({
      tipo: "cambia",
      a: "esencial",
    });
  });

  it("sin fecha de fin: período sí, fecha null", () => {
    expect(
      detalleDeTienda({
        plan: "pro",
        store_product_id: "cartera_proplus_anual",
        store_period_end: null,
        plan_pending: null,
      }),
    ).toEqual({ periodo: "anual", renuevaEl: null, alVencer: RENUEVA });
  });
});

describe("detalleDeStripe", () => {
  const base = {
    plan: "max",
    plan_pending: null,
    finDePeriodo: "2027-01-05T00:00:00.000Z",
  } as const;

  it("traslada período, fecha y cancelación al final", () => {
    expect(detalleDeStripe({ ...base, periodo: "anual", cancelaAlFinal: true })).toEqual({
      periodo: "anual",
      renuevaEl: "2027-01-05T00:00:00.000Z",
      alVencer: { tipo: "termina" },
    });
  });
  it("una bajada programada también se ve en Stripe", () => {
    expect(
      detalleDeStripe({ ...base, plan_pending: "pro", periodo: "mensual", cancelaAlFinal: false })
        ?.alVencer,
    ).toEqual({ tipo: "cambia", a: "pro" });
  });
  it("sin período reconocible: sin detalle", () => {
    expect(detalleDeStripe({ ...base, periodo: null, cancelaAlFinal: false })).toBeNull();
  });
});

describe("lineaDeRenovacion", () => {
  const fin = "2026-11-12T18:00:00.000Z";

  it("renueva, termina o cambia, con la fecha larga y sin hora", () => {
    expect(lineaDeRenovacion({ periodo: "mensual", renuevaEl: fin, alVencer: RENUEVA })).toBe(
      "Se renueva el 12 de noviembre de 2026",
    );
    expect(
      lineaDeRenovacion({ periodo: "anual", renuevaEl: fin, alVencer: { tipo: "termina" } }),
    ).toBe("Termina el 12 de noviembre de 2026");
    expect(
      lineaDeRenovacion({
        periodo: "anual",
        renuevaEl: fin,
        alVencer: { tipo: "cambia", a: "esencial" },
      }),
    ).toBe("Cambia a Esencial+ el 12 de noviembre de 2026");
  });
  it("sin fecha, no hay línea", () => {
    expect(lineaDeRenovacion({ periodo: "anual", renuevaEl: null, alVencer: RENUEVA })).toBeNull();
  });
});

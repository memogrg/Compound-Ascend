/**
 * La prueba gratis del paywall nativo (Apple 3.1.2): el paywall dice la prueba que la tienda
 * muestra en su hoja de pago, y solo esa. En iOS sale del precio introductorio en 0 con
 * elegibilidad confirmada; en Android, de la fase gratis de la opción por defecto. Nada fijo.
 */
import { describe, it, expect } from "vitest";
import {
  frasePrueba,
  pruebaGratis,
  textoPrueba,
  type PruebaGratis,
} from "@/lib/billing/store-offerings";
import type { PurchasesIntroPrice, SubscriptionOption } from "@/lib/capacitor/native";

/** «Free · 2 weeks» de App Store Connect, como lo trae RevenueCat. */
const GRATIS_2_SEMANAS: PurchasesIntroPrice = {
  price: 0,
  priceString: "USD 0.00",
  cycles: 1,
  period: "P2W",
  periodUnit: "WEEK",
  periodNumberOfUnits: 2,
};

const ios = (introPrice: PurchasesIntroPrice | null) => ({ introPrice, defaultOption: null });

const android = (iso8601: string | null, billingCycleCount: number | null = 1) => {
  const opcion: SubscriptionOption = {
    id: "mensual",
    freePhase:
      iso8601 === null
        ? null
        : {
            billingPeriod: { unit: "UNKNOWN", value: 0, iso8601 },
            billingCycleCount,
          },
  };
  return { introPrice: null, defaultOption: opcion };
};

describe("pruebaGratis · iOS", () => {
  it("elegible (2) con precio introductorio 0: la prueba de la tienda", () => {
    expect(pruebaGratis(ios(GRATIS_2_SEMANAS), "ios", 2)).toEqual({
      cantidad: 2,
      unidad: "semana",
    });
  });

  it("no elegible (1): sin prueba, aunque el producto la tenga", () => {
    expect(pruebaGratis(ios(GRATIS_2_SEMANAS), "ios", 1)).toBeNull();
  });

  it("desconocido (0): sin prueba (ante la duda, el precio que se cobra)", () => {
    expect(pruebaGratis(ios(GRATIS_2_SEMANAS), "ios", 0)).toBeNull();
  });

  it("sin oferta (3): sin prueba", () => {
    expect(pruebaGratis(ios(GRATIS_2_SEMANAS), "ios", 3)).toBeNull();
  });

  it("consulta de elegibilidad fallida (null): sin prueba", () => {
    expect(pruebaGratis(ios(GRATIS_2_SEMANAS), "ios", null)).toBeNull();
  });

  it("un precio introductorio que no es 0 no es una prueba gratis", () => {
    expect(pruebaGratis(ios({ ...GRATIS_2_SEMANAS, price: 0.99 }), "ios", 2)).toBeNull();
  });

  it("sin precio introductorio: sin prueba", () => {
    expect(pruebaGratis(ios(null), "ios", 2)).toBeNull();
  });

  it("el anual con prueba: la misma prueba, la duración no depende del período", () => {
    expect(pruebaGratis(ios(GRATIS_2_SEMANAS), "ios", 2)).toEqual({
      cantidad: 2,
      unidad: "semana",
    });
  });

  it("un mes gratis (MONTH × 1)", () => {
    const unMes = {
      ...GRATIS_2_SEMANAS,
      period: "P1M",
      periodUnit: "MONTH",
      periodNumberOfUnits: 1,
    };
    expect(pruebaGratis(ios(unMes), "ios", 2)).toEqual({ cantidad: 1, unidad: "mes" });
  });
});

describe("pruebaGratis · Android", () => {
  it("con fase gratis P2W: 2 semanas (la elegibilidad de Play no se mira)", () => {
    expect(pruebaGratis(android("P2W"), "android", 0)).toEqual({ cantidad: 2, unidad: "semana" });
    expect(pruebaGratis(android("P2W"), "android", null)).toEqual({
      cantidad: 2,
      unidad: "semana",
    });
  });

  it("sin fase gratis: sin prueba", () => {
    expect(pruebaGratis(android(null), "android", 0)).toBeNull();
  });

  it("sin opción por defecto: sin prueba", () => {
    expect(pruebaGratis({ introPrice: null, defaultOption: null }, "android", 0)).toBeNull();
  });

  it("P1M: un mes", () => {
    expect(pruebaGratis(android("P1M"), "android", 0)).toEqual({ cantidad: 1, unidad: "mes" });
  });

  it("P14D: 14 días", () => {
    expect(pruebaGratis(android("P14D"), "android", 0)).toEqual({ cantidad: 14, unidad: "dia" });
  });

  it("un período que no se entiende: sin prueba (no se adivina)", () => {
    expect(pruebaGratis(android("P1W2D"), "android", 0)).toBeNull();
  });
});

describe("textoPrueba", () => {
  const t = (cantidad: number, unidad: PruebaGratis["unidad"]) => textoPrueba({ cantidad, unidad });

  it("días y semanas se dicen en días", () => {
    expect(t(2, "semana")).toBe("Los primeros 14 días");
    expect(t(14, "dia")).toBe("Los primeros 14 días");
    expect(t(1, "semana")).toBe("Los primeros 7 días");
    expect(t(1, "dia")).toBe("El primer día");
  });

  it("meses y años no se convierten a días", () => {
    expect(t(1, "mes")).toBe("El primer mes");
    expect(t(2, "mes")).toBe("Los primeros 2 meses");
    expect(t(1, "año")).toBe("El primer año");
  });
});

describe("frasePrueba", () => {
  it("plural: «son gratis»", () => {
    expect(frasePrueba({ cantidad: 2, unidad: "semana" }, "USD 4.99", "por mes")).toBe(
      "Los primeros 14 días son gratis. Después, USD 4.99 por mes.",
    );
  });

  it("singular: «es gratis»", () => {
    expect(frasePrueba({ cantidad: 1, unidad: "mes" }, "USD 49.99", "por año")).toBe(
      "El primer mes es gratis. Después, USD 49.99 por año.",
    );
  });
});

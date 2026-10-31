/**
 * `obtenerOfertas` adjunta a cada paquete la prueba gratis que la tienda le da a esta persona.
 * En iOS pide la elegibilidad de todos los productos en UNA llamada; si falla, ningún paquete
 * muestra prueba. En Android no la pide: la prueba sale de la opción por defecto.
 * Y `comprar` le pasa al SDK el paquete tal cual, sin la prueba.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const nativo = vi.hoisted(() => ({
  plataforma: "ios" as "android" | "ios",
  getOfferings: vi.fn(),
  checkTrialOrIntroductoryPriceEligibility: vi.fn(),
  purchasePackage: vi.fn(),
}));
vi.mock("@/lib/capacitor/native", () => ({
  INTRO_ELIGIBILITY_STATUS: { UNKNOWN: 0, INELIGIBLE: 1, ELIGIBLE: 2, NO_INTRO_OFFER_EXISTS: 3 },
  isCapacitor: () => true,
  capacitorPlatform: () => nativo.plataforma,
  capacitorPurchases: () => ({
    isConfigured: async () => ({ isConfigured: true }),
    getOfferings: nativo.getOfferings,
    checkTrialOrIntroductoryPriceEligibility: nativo.checkTrialOrIntroductoryPriceEligibility,
    purchasePackage: nativo.purchasePackage,
  }),
}));

import { comprar, obtenerOfertas } from "@/lib/capacitor/purchases";

const GRATIS = {
  price: 0,
  priceString: "USD 0.00",
  cycles: 1,
  period: "P2W",
  periodUnit: "WEEK",
  periodNumberOfUnits: 2,
};
const paqueteIos = (id: string, productId: string) => ({
  identifier: id,
  offeringIdentifier: "default",
  product: {
    identifier: productId,
    price: 4.99,
    priceString: "USD 4.99",
    introPrice: GRATIS,
    defaultOption: null,
  },
});
const OFERTA_IOS = [
  paqueteIos("esencial", "cartera_esencial_mensual"),
  paqueteIos("pro", "cartera_proplus_mensual"),
  paqueteIos("pro_anual", "cartera_proplus_anual"),
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  nativo.plataforma = "ios";
  nativo.getOfferings.mockResolvedValue({ current: { availablePackages: OFERTA_IOS } });
});

describe("obtenerOfertas · prueba gratis", () => {
  it("iOS: una sola consulta de elegibilidad, y la prueba solo donde es elegible", async () => {
    nativo.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue({
      cartera_esencial_mensual: { status: 2, description: "" },
      cartera_proplus_mensual: { status: 1, description: "" },
      cartera_proplus_anual: { status: 2, description: "" },
    });
    const grupos = await obtenerOfertas();
    expect(nativo.checkTrialOrIntroductoryPriceEligibility).toHaveBeenCalledTimes(1);
    expect(nativo.checkTrialOrIntroductoryPriceEligibility).toHaveBeenCalledWith({
      productIdentifiers: [
        "cartera_esencial_mensual",
        "cartera_proplus_mensual",
        "cartera_proplus_anual",
      ],
    });
    const esencial = grupos.find((g) => g.plan === "esencial");
    const pro = grupos.find((g) => g.plan === "pro");
    expect(esencial?.mensual?.prueba).toEqual({ cantidad: 2, unidad: "semana" });
    expect(pro?.mensual?.prueba).toBeNull();
    expect(pro?.anual?.prueba).toEqual({ cantidad: 2, unidad: "semana" });
  });

  it("iOS: si la consulta falla, ningún paquete muestra prueba", async () => {
    nativo.checkTrialOrIntroductoryPriceEligibility.mockRejectedValue(new Error("sin red"));
    const grupos = await obtenerOfertas();
    expect(grupos.length).toBeGreaterThan(0);
    for (const g of grupos) {
      expect(g.mensual?.prueba ?? null).toBeNull();
      expect(g.anual?.prueba ?? null).toBeNull();
    }
  });

  it("iOS: un producto que falta en la respuesta no muestra prueba", async () => {
    nativo.checkTrialOrIntroductoryPriceEligibility.mockResolvedValue({});
    const grupos = await obtenerOfertas();
    expect(grupos.find((g) => g.plan === "esencial")?.mensual?.prueba).toBeNull();
  });

  it("Android: no consulta elegibilidad; la prueba sale de la fase gratis", async () => {
    nativo.plataforma = "android";
    nativo.getOfferings.mockResolvedValue({
      current: {
        availablePackages: [
          {
            identifier: "pro",
            product: {
              identifier: "cartera_proplus_mensual:mensual",
              price: 34,
              priceString: "CRC 15,400.00",
              introPrice: null,
              defaultOption: {
                id: "prueba",
                freePhase: {
                  billingPeriod: { unit: "WEEK", value: 2, iso8601: "P2W" },
                  billingCycleCount: 1,
                },
              },
            },
          },
        ],
      },
    });
    const grupos = await obtenerOfertas();
    expect(nativo.checkTrialOrIntroductoryPriceEligibility).not.toHaveBeenCalled();
    expect(grupos[0]?.mensual?.prueba).toEqual({ cantidad: 2, unidad: "semana" });
  });
});

describe("comprar · el paquete va al SDK sin la prueba", () => {
  it("manda el paquete tal cual lo dio el SDK, sin el campo `prueba`", async () => {
    nativo.purchasePackage.mockResolvedValue({});
    const paquete = { ...paqueteIos("pro", "cartera_proplus_mensual"), prueba: null };
    await comprar(paquete as unknown as Parameters<typeof comprar>[0]);
    const enviado = nativo.purchasePackage.mock.calls[0]?.[0]?.aPackage;
    expect(enviado).not.toHaveProperty("prueba");
    expect(enviado).toMatchObject({ identifier: "pro", offeringIdentifier: "default" });
  });
});

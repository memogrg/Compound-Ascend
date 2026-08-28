import { describe, it, expect, afterEach, vi } from "vitest";
import {
  buildHoldingPayload,
  type HoldingFormValues,
} from "@/modules/wealth/engine/holding-payload";
import type { InvestmentCategory } from "@/modules/wealth/types";

/**
 * #90 · sub-bug A — la fecha de compra NUNCA sale del reloj UTC del server.
 *
 * El wizard (web y móvil) captura `startDate` con `useCaptureToday()` (tz-aware). El engine debe
 * USARLA para `purchaseDate` en TODAS las categorías. El bug: `buildHoldingPayload` fechaba con
 * `new Date().toISOString()` (UTC) salvo en plan_inversion → a la noche en zonas negativas (UTC-6)
 * la compra quedaba fechada +1 día.
 */

/** Form completo con defaults sanos; se sobreescribe lo relevante por caso. */
function mk(overrides: Partial<HoldingFormValues> = {}): HoldingFormValues {
  return {
    category: "accion_crecimiento",
    name: "Test",
    invested: "1000",
    cur: "USD",
    symbol: "VOO",
    quantity: "0",
    unitPrice: "100",
    livePrice: null,
    livePriceCurrency: "USD",
    currentValue: "",
    income: "",
    frequency: "mensual",
    incomeMonth: "",
    annualRatePct: "",
    maturityDate: "",
    termYears: "",
    startDate: "2026-08-28",
    subtype: "alquiler",
    rc: {
      purchasePrice: "",
      closingCosts: "",
      vacancyPct: "",
      mgmtPct: "",
      maintenance: "",
      hoa: "",
      propertyTax: "",
      insurance: "",
      services: "",
    },
    debtId: "",
    region: "us",
    aportoCadaMes: false,
    aporteMensual: "",
    registerExpense: false,
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("buildHoldingPayload · purchaseDate (#90)", () => {
  it("COTIZADO: usa v.startDate, no el reloj (era el camino roto: siempre UTC)", () => {
    const p = buildHoldingPayload(mk({ category: "accion_crecimiento", startDate: "2026-08-28" }));
    expect(p.purchaseDate).toBe("2026-08-28");
  });

  it("MANUAL no-plan_inversion: usa v.startDate (también fechaba UTC)", () => {
    const p = buildHoldingPayload(
      mk({
        category: "cuenta_remunerada",
        unitPrice: "",
        currentValue: "500",
        startDate: "2026-08-28",
      }),
    );
    expect(p.purchaseDate).toBe("2026-08-28");
  });

  it("plan_inversion: sigue honrando v.startDate (sin regresión)", () => {
    const p = buildHoldingPayload(
      mk({ category: "plan_inversion" as InvestmentCategory, startDate: "2026-08-28" }),
    );
    expect(p.purchaseDate).toBe("2026-08-28");
  });

  it("REPRO 23:00 UTC-6: con el reloj del server en el día SIGUIENTE (UTC), fecha el día LOCAL capturado", () => {
    // 2026-08-29T05:00Z == 2026-08-28 23:00 en America/Costa_Rica (UTC-6). El form captura el día
    // local ("2026-08-28") en startDate; el reloj del server (UTC) ya está en "2026-08-29".
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-29T05:00:00Z"));
    const p = buildHoldingPayload(mk({ category: "cripto", startDate: "2026-08-28" }));
    expect(p.purchaseDate).toBe("2026-08-28"); // día local capturado…
    expect(p.purchaseDate).not.toBe("2026-08-29"); // …no el UTC-mañana del reloj (el bug)
  });
});

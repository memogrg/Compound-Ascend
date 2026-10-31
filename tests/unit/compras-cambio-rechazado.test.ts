/**
 * El mensaje cuando Google Play rechaza un cambio de plan (`comprar` con `cambio`).
 *
 * Play rechaza el reemplazo con DEVELOPER_ERROR (ya hay un cambio diferido esperando, o el
 * producto «actual» no es el que tiene vivo), y el SDK lo trae como PURCHASE_INVALID_ERROR
 * (`code: "4"`). Ese caso tiene su propio mensaje; un error de red sigue con el genérico, y una
 * compra nueva (sin `cambio`) también.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const nativo = vi.hoisted(() => ({
  plataforma: "android" as "android" | "ios",
  purchasePackage: vi.fn(),
}));
vi.mock("@/lib/capacitor/native", () => ({
  isCapacitor: () => true,
  capacitorPlatform: () => nativo.plataforma,
  capacitorPurchases: () => ({
    isConfigured: async () => ({ isConfigured: true }),
    purchasePackage: nativo.purchasePackage,
  }),
}));

import { CAMBIO_RECHAZADO, PRORATION_MODE, comprar } from "@/lib/capacitor/purchases";

const paquete = {
  identifier: "pro_anual",
  product: { identifier: "cartera_proplus_mensual:anual" },
} as unknown as Parameters<typeof comprar>[0];
const cambio = {
  productoActual: "cartera_proplus_mensual:mensual",
  prorationMode: PRORATION_MODE.DEFERRED,
};
const GENERICO = "No se pudo completar la compra. Intentá de nuevo.";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  nativo.plataforma = "android";
});

describe("comprar · Play rechaza el cambio", () => {
  it("PURCHASE_INVALID en un cambio de Play: el mensaje de cambio rechazado", async () => {
    nativo.purchasePackage.mockRejectedValueOnce({ code: "4", message: "invalid" });
    expect(await comprar(paquete, cambio)).toEqual({ ok: false, error: CAMBIO_RECHAZADO });
  });

  it("un error de red en un cambio sigue con el mensaje genérico", async () => {
    nativo.purchasePackage.mockRejectedValueOnce({ code: "10", message: "Network error" });
    expect(await comprar(paquete, cambio)).toEqual({ ok: false, error: GENERICO });
  });

  it("PURCHASE_INVALID en una compra nueva (sin cambio) no habla de cambios", async () => {
    nativo.purchasePackage.mockRejectedValueOnce({ code: "4" });
    expect(await comprar(paquete)).toEqual({ ok: false, error: GENERICO });
  });

  it("en iOS no se manda reemplazo: el mensaje de Google Play no aplica", async () => {
    nativo.plataforma = "ios";
    nativo.purchasePackage.mockRejectedValueOnce({ code: "4" });
    expect(await comprar(paquete, cambio)).toEqual({ ok: false, error: GENERICO });
  });

  it("cancelar sigue sin ser un error", async () => {
    nativo.purchasePackage.mockRejectedValueOnce({ code: "1" });
    expect(await comprar(paquete, cambio)).toEqual({ ok: false, cancelled: true });
  });
});

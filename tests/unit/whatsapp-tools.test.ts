import { describe, it, expect, vi } from "vitest";

// CAMBIO 3.1 — buildWhatsAppToolContext: deudas mixtas USD+CRC + primary CRC →
// normaliza a CRC, sin sesión (service-role mockeado). Usa el normalizeDebtsForTool
// REAL del orchestrator (por eso este archivo NO mockea el orchestrator).

type DebtRow = {
  id: string;
  name: string;
  balance: number;
  apr: number;
  min_payment: number;
  currency: string;
};
// vi.hoisted: disponibles cuando corre el factory hoisteado de vi.mock.
const { debtRows, PRIMARY } = vi.hoisted(() => ({
  debtRows: [
    { id: "u", name: "Tarjeta USD", balance: 1000, apr: 30, min_payment: 50, currency: "USD" },
    { id: "c", name: "Préstamo CRC", balance: 500_000, apr: 20, min_payment: 30_000, currency: "CRC" },
  ] as DebtRow[],
  PRIMARY: "CRC",
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/market-data/fx-rates", () => ({
  getFxRates: async () => ({ USD: 1, CRC: 500 }), // 1 USD = 500 CRC
}));
// Cliente service-role falso: ramifica por tabla (debts / user_settings).
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from(table: string) {
      if (table === "user_settings") {
        const q = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({ data: { primary_currency: PRIMARY }, error: null }),
        };
        return q;
      }
      const q = {
        select: () => q,
        eq: () => q,
        then: (resolve: (v: { data: DebtRow[]; error: null }) => void) =>
          resolve({ data: debtRows, error: null }),
      };
      return q;
    },
  }),
}));

import { buildWhatsAppToolContext } from "@/lib/whatsapp/tool-context";

describe("buildWhatsAppToolContext (service-role, sin sesión)", () => {
  it("usa la moneda principal y normaliza deudas USD→CRC", async () => {
    const tc = await buildWhatsAppToolContext("u1", "h1");
    expect(tc.currency).toBe("CRC");
    expect(tc.fxUnavailable).toBe(false);
    const usd = tc.debts.find((d) => d.id === "u")!;
    const crc = tc.debts.find((d) => d.id === "c")!;
    expect(usd.balance).toBe(500_000); // 1000 USD × 500
    expect(usd.minPayment).toBe(25_000); // 50 USD × 500
    expect(usd.apr).toBe(30); // APR intacta
    expect(crc.balance).toBe(500_000); // CRC queda igual
  });
});

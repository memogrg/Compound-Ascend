import { describe, it, expect } from "vitest";
import { sumAssetsByClass, isBadDebt, BAD_DEBT_APR } from "@/modules/wealth/engine/patrimonio-mappers";

describe("sumAssetsByClass", () => {
  it("suma por clase y arranca en cero las ausentes", () => {
    const out = sumAssetsByClass([
      { assetClass: "liquido", value: 100 },
      { assetClass: "liquido", value: 50 },
      { assetClass: "inversion", value: 200 },
      { assetClass: "productivo", value: 300 },
    ]);
    expect(out).toEqual({ liquido: 150, inversion: 200, productivo: 300, uso_personal: 0, especial: 0 });
  });

  it("lista vacía → todas en cero", () => {
    expect(sumAssetsByClass([])).toEqual({ liquido: 0, inversion: 0, productivo: 0, uso_personal: 0, especial: 0 });
  });

  it("ignora clases desconocidas", () => {
    const out = sumAssetsByClass([
      { assetClass: "cripto_raro", value: 999 },
      { assetClass: "especial", value: 10 },
    ]);
    expect(out.especial).toBe(10);
    expect(Object.values(out).reduce((a, b) => a + b, 0)).toBe(10); // la desconocida no entra
  });
});

describe("isBadDebt", () => {
  it("clasificación crítica → siempre mala (aunque APR bajo o null)", () => {
    expect(isBadDebt("critica", 5)).toBe(true);
    expect(isBadDebt("critica", null)).toBe(true);
  });
  it(`APR ≥ ${BAD_DEBT_APR} → mala`, () => {
    expect(isBadDebt("controlada", 25)).toBe(true);
    expect(isBadDebt("estrategica", 40)).toBe(true);
  });
  it(`APR < ${BAD_DEBT_APR} y no crítica → buena`, () => {
    expect(isBadDebt("controlada", 24.99)).toBe(false);
    expect(isBadDebt("estrategica", 10)).toBe(false);
  });
  it("APR null y no crítica → buena (0 < umbral)", () => {
    expect(isBadDebt("controlada", null)).toBe(false);
    expect(isBadDebt(null, null)).toBe(false);
  });
});

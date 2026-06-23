import { describe, it, expect } from "vitest";
import { mapInvestmentLiquidity, savingsLiquidity } from "@/modules/rich-life/engine/asset-mapping";

describe("mapInvestmentLiquidity", () => {
  it("rapida → alta", () => expect(mapInvestmentLiquidity("rapida")).toBe("alta"));
  it("penalidad → media", () => expect(mapInvestmentLiquidity("penalidad")).toBe("media"));
  it("largo_plazo → baja", () => expect(mapInvestmentLiquidity("largo_plazo")).toBe("baja"));
  it("no_se → null", () => expect(mapInvestmentLiquidity("no_se")).toBeNull());
  it("null → null", () => expect(mapInvestmentLiquidity(null)).toBeNull());
  it("valor desconocido → null", () => expect(mapInvestmentLiquidity("otro")).toBeNull());
});

describe("savingsLiquidity", () => {
  it("efectivo → alta", () => expect(savingsLiquidity("efectivo")).toBe("alta"));
  it("banco → alta", () => expect(savingsLiquidity("Banco BAC")).toBe("alta"));
  it("cuenta de ahorro → alta", () => expect(savingsLiquidity("cuenta de ahorro")).toBe("alta"));
  it("plazo → baja", () => expect(savingsLiquidity("certificado a plazo")).toBe("baja"));
  it("cdp → baja", () => expect(savingsLiquidity("CDP")).toBe("baja"));
  it("null → media (desconocido)", () => expect(savingsLiquidity(null)).toBe("media"));
  it("vacío → media", () => expect(savingsLiquidity("")).toBe("media"));
  it("desconocido → media", () => expect(savingsLiquidity("debajo del colchón")).toBe("media"));
});

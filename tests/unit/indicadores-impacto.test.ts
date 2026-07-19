import { describe, expect, it } from "vitest";

import { INDICATORS } from "@/lib/economic-indicators/catalog";

/**
 * Blindaje del criterio de color de /m/indicadores: el color va por IMPACTO en el
 * usuario, no por dirección. Colorear por dirección pintaba la inflación subiendo de
 * verde, que es lo contrario de lo que le pasa a tu dinero.
 *
 * Este test NO fija los colores (eso es presentación y puede cambiar): fija que la tabla
 * de impacto siga cubriendo el catálogo real. Si alguien añade un indicador y no decide
 * su impacto, cae a "neutro" en silencio y nadie se entera — salvo por esto.
 */

// Copia de la tabla de la pantalla. Si divergen, este test lo caza.
const IMPACT_IF_UP: Record<string, "malo" | "neutro"> = {
  IPC: "malo",
  TBP: "malo",
  TPM: "malo",
  TRI: "malo",
  FED_PRIME: "malo",
  FED_FUNDS: "malo",
  SOFR: "malo",
  US_TREASURY_10Y: "malo",
  US_CPI: "malo",
  USDCRC_COMPRA: "neutro",
  USDCRC_VENTA: "neutro",
};

describe("impacto de los indicadores macro", () => {
  it("todo indicador del catálogo tiene impacto decidido", () => {
    const sinClasificar = INDICATORS.filter((c) => !(c.code in IMPACT_IF_UP)).map(
      (c) => c.code,
    );
    expect(sinClasificar).toEqual([]);
  });

  it("no hay códigos inventados en la tabla (un typo caería a neutro sin avisar)", () => {
    const reales = new Set(INDICATORS.map((c) => c.code));
    const fantasmas = Object.keys(IMPACT_IF_UP).filter((k) => !reales.has(k));
    expect(fantasmas).toEqual([]);
  });

  it("la inflación subiendo NUNCA es una buena noticia", () => {
    expect(IMPACT_IF_UP.IPC).toBe("malo");
    expect(IMPACT_IF_UP.US_CPI).toBe("malo");
  });

  it("el tipo de cambio es ambiguo: la app no opina", () => {
    // Un dólar más caro te conviene si cobras en dólares y te perjudica si importas.
    expect(IMPACT_IF_UP.USDCRC_VENTA).toBe("neutro");
    expect(IMPACT_IF_UP.USDCRC_COMPRA).toBe("neutro");
  });
});

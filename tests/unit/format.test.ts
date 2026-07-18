import { describe, expect, it } from "vitest";

import { formatMoney, formatCompact, CURRENCY_SYMBOL } from "@/lib/format";

/**
 * Blindaje de la POLÍTICA ÚNICA de formato numérico (ver el bloque de doc en
 * src/lib/format.ts). Antes de esto solo había una aserción autorreferencial
 * (comparaba formatMoney contra toLocaleString), así que el formato no estaba
 * fijado por ningún lado y derivó a tres gramáticas distintas en la app.
 */

describe("separador de miles: PUNTO, determinista", () => {
  it("agrupa con punto y no deja espacios de CLDR", () => {
    expect(formatMoney(1966410, "CRC")).toBe("₡1.966.410");
    expect(formatMoney(4540188, "CRC")).toBe("₡4.540.188");
    expect(formatMoney(347628127, "CRC")).toBe("₡347.628.127");
  });

  it("no emite NINGÚN espacio duro ni fino (la grieta servidor/iOS)", () => {
    // Node y el WebView de iOS agrupan `es-CR` distinto (U+00A0 vs "."). Si alguien
    // vuelve a delegar en Intl, este test lo caza.
    for (const n of [1950, 43333, 1966410, 259427189]) {
      const s = formatMoney(n, "CRC");
      expect(s).not.toMatch(/[    ]/);
    }
  });

  it("decimales con coma", () => {
    expect(formatMoney(1234.56, "USD", 2)).toBe("$1.234,56");
  });
});

describe("negativos: signo delante del símbolo, cero neutro", () => {
  it("antepone el menos tipográfico al símbolo", () => {
    expect(formatMoney(-14, "USD")).toBe("−$14");
    expect(formatMoney(-163300, "CRC")).toBe("−₡163.300");
    expect(formatCompact(-163300, "CRC")).toBe("−₡163,3 mil");
  });

  it("nunca produce el símbolo antes del signo", () => {
    for (const n of [-1, -14, -163300, -4540188]) {
      expect(formatMoney(n, "CRC")).not.toMatch(/₡-/);
      expect(formatMoney(n, "CRC")).toMatch(/^−₡/);
    }
  });

  it("cero es neutro: sin signo", () => {
    expect(formatMoney(0, "CRC")).toBe("₡0");
    expect(formatMoney(-0, "CRC")).toBe("₡0");
    // Redondea a cero ⇒ tampoco lleva signo.
    expect(formatMoney(-0.4, "CRC")).toBe("₡0");
  });
});

describe("abreviación: sufijo único y coherente", () => {
  it("usa mil / M con coma decimal", () => {
    expect(formatCompact(163300, "CRC")).toBe("₡163,3 mil");
    expect(formatCompact(18200000, "CRC")).toBe("₡18,2 M");
    expect(formatCompact(259427189, "CRC")).toBe("₡259,4 M");
  });

  it("omite el decimal cuando no aporta", () => {
    expect(formatCompact(50000000, "CRC")).toBe("₡50 M");
  });

  it("no abrevia por debajo de 10.000", () => {
    expect(formatCompact(1950, "CRC")).toBe("₡1.950");
  });
});

describe("moneda: nunca un símbolo que no corresponde al importe (P0-2)", () => {
  it("cada moneda usa SU símbolo", () => {
    expect(formatMoney(14, "USD")).toBe("$14");
    expect(formatMoney(14, "CRC")).toBe("₡14");
    expect(formatMoney(14, "EUR")).toBe("€14");
  });

  it("un importe en otra moneda NUNCA se formatea con el símbolo de display", () => {
    // El bug del video: un cargo de $14 pintado como ₡14 (32× subestimado).
    const displayCurrency = "CRC";
    const txn = { amount: 14, currency: "USD" };
    const rendered = formatMoney(txn.amount, txn.currency);

    expect(rendered).not.toContain(CURRENCY_SYMBOL[displayCurrency]!);
    expect(rendered).toBe("$14");
    // Y al revés: si alguien pasa la moneda de display, el resultado DIFIERE —
    // esa diferencia es exactamente el defecto que este test vigila.
    expect(formatMoney(txn.amount, displayCurrency)).not.toBe(rendered);
  });

  it("MXN y COP no se disfrazan de dólares", () => {
    // "$500" para pesos es indistinguible de dólares: símbolo ambiguo = símbolo erróneo.
    expect(formatMoney(500, "MXN")).toBe("MX$500");
    expect(formatMoney(500, "COP")).toBe("COL$500");
  });

  it("una moneda desconocida se rotula con su código, no con un símbolo ajeno", () => {
    expect(formatMoney(500, "XYZ")).toBe("XYZ 500");
    expect(formatMoney(500, "XYZ")).not.toContain("₡");
  });
});

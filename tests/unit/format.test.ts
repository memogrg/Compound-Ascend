import { describe, expect, it } from "vitest";

import {
  formatMoney,
  formatCompact,
  formatAxisCompact,
  formatMonthYear,
  formatDelta,
  formatPct1,
  formatDayMonth,
  formatMonthShort,
  CURRENCY_SYMBOL,
} from "@/lib/format";

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

describe("formatAxisCompact: UN token, sin la palabra 'mil' (eje angosto)", () => {
  it("usa K/M/B pegados, sin 'mil' ni espacio", () => {
    expect(formatAxisCompact(607000, "CRC")).toBe("₡607K");
    expect(formatAxisCompact(1200000, "CRC")).toBe("₡1,2M");
    expect(formatAxisCompact(163300, "CRC")).toBe("₡163,3K");
    expect(formatAxisCompact(2e12, "CRC")).toBe("₡2B");
  });

  it("omite el decimal cuando no aporta y conserva el símbolo de la moneda", () => {
    expect(formatAxisCompact(5000000, "USD")).toBe("$5M");
    expect(formatAxisCompact(700000, "CRC")).toBe("₡700K");
  });

  it("negativos con el signo delante del símbolo", () => {
    expect(formatAxisCompact(-1200000, "CRC")).toBe("−₡1,2M");
  });

  it("por debajo de 1.000 no abrevia (cae a formatMoney)", () => {
    expect(formatAxisCompact(500, "CRC")).toBe("₡500");
  });
});

describe("formatMonthYear: 'Mes Año' determinista desde ISO", () => {
  it("YYYY-MM-DD → 'Jul 2026'", () => {
    expect(formatMonthYear("2026-07-13")).toBe("Jul 2026");
    expect(formatMonthYear("2026-01-31")).toBe("Ene 2026");
    expect(formatMonthYear("2025-12-01")).toBe("Dic 2025");
  });

  it("acepta YYYY-MM y deja intacto lo que no matchea", () => {
    expect(formatMonthYear("2026-03")).toBe("Mar 2026");
    expect(formatMonthYear("sin fecha")).toBe("sin fecha");
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

/**
 * Helpers agregados en 0.5. Heredan la misma política: agrupación A MANO, nunca CLDR.
 * El prompt original pedía `Intl.NumberFormat` con `signDisplay`, que en Node emite
 * ESPACIO DURO como separador de miles — justo la grieta servidor/iOS que el bloque de
 * doc de format.ts documenta. Estos tests fijan la decisión contraria.
 */
describe("formatDelta: signo explícito, misma gramática que formatMoney", () => {
  it("positivo con +, negativo con el menos tipográfico", () => {
    expect(formatDelta(2500, "CRC")).toBe("+₡2.500");
    expect(formatDelta(-2500, "CRC")).toBe("−₡2.500");
  });

  it("el cero es NEUTRO: sin signo", () => {
    expect(formatDelta(0, "CRC")).toBe("₡0");
  });

  it("el cero lo deciden los decimales de la moneda", () => {
    expect(formatDelta(0.4, "CRC")).toBe("₡0"); // 0 decimales: redondea a cero
    expect(formatDelta(0.4, "USD", 2)).toBe("+$0,40"); // 2 decimales: sí es positivo
  });

  it("produce EXACTAMENTE el cuerpo de formatMoney, solo con el signo delante", () => {
    for (const [monto, moneda, dec] of [
      [2500, "CRC", undefined],
      [1_250_000, "CRC", undefined],
      [2500, "USD", 2],
      [1_250_000, "USD", 2],
    ] as const) {
      expect(formatDelta(monto, moneda, dec)).toBe(`+${formatMoney(monto, moneda, dec)}`);
    }
  });

  it("no agrupa con espacio duro (si aparece, alguien lo reimplementó con Intl)", () => {
    expect(formatDelta(1_250_000, "CRC")).not.toContain(" ");
    expect(formatDelta(-1_250_000, "USD", 2)).not.toContain(" ");
  });
});

describe("formatPct1: una decimal, coma, espacio duro antes del %", () => {
  it("formatea y redondea a una decimal", () => {
    expect(formatPct1(0.123)).toBe("12,3 %");
    expect(formatPct1(0.12345)).toBe("12,3 %");
    expect(formatPct1(0.129)).toBe("12,9 %");
  });

  it("cero y negativos", () => {
    expect(formatPct1(0)).toBe("0,0 %");
    expect(formatPct1(-0.045)).toBe("−4,5 %");
  });

  it("agrupa los miles con PUNTO; el espacio duro es solo el de antes del %", () => {
    expect(formatPct1(123.456)).toBe("12.345,6 %");
    expect(formatPct1(123.456).split(" ")).toHaveLength(2);
  });
});

describe("fechas cortas: parseo de la CADENA, sin Date ni Intl", () => {
  it("formatDayMonth: día sin cero a la izquierda, mes en minúscula", () => {
    expect(formatDayMonth("2026-08-16")).toBe("16 ago");
    expect(formatDayMonth("2026-01-05")).toBe("5 ene");
    expect(formatDayMonth("2026-12-31")).toBe("31 dic");
  });

  it("formatMonthShort: mes y año a dos dígitos", () => {
    expect(formatMonthShort("2026-08")).toBe("ago 26");
    expect(formatMonthShort("2026-08-16")).toBe("ago 26");
  });

  // El día 1 delata un parseo con Date: new Date("2026-08-01") se interpreta en UTC y
  // leído en Costa Rica (UTC−6) retrocede al 31 de julio.
  it("no retrocede un día por zona horaria", () => {
    expect(formatDayMonth("2026-08-01")).toBe("1 ago");
    expect(formatMonthShort("2026-01-01")).toBe("ene 26");
  });

  it("lo que no es ISO se devuelve intacto", () => {
    expect(formatDayMonth("mañana")).toBe("mañana");
    expect(formatMonthShort("")).toBe("");
  });
});

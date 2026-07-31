import { describe, it, expect } from "vitest";
import { montoStr, subtotales, subtotalesStr, convertirTotal, type Monto } from "@/lib/ai/money";

// MONTOS MULTIMONEDA: ningún monto sin su moneda al lado, y ningún total inventado. Cuando las
// monedas no se pueden sumar honestamente, se dan subtotales; si falta una tasa, no hay total.

const m = (monto: number, moneda: string): Monto => ({ monto, moneda });
// Tasas por USD (mismo shape que getFxRates): 1 USD = 530 CRC = 0,92 EUR.
const RATES = { USD: 1, CRC: 530, EUR: 0.92 };

describe("montoStr · el código de moneda va SIEMPRE pegado al monto", () => {
  it("usa código, no símbolo (el prompt no usa símbolos; '$' es ambiguo)", () => {
    expect(montoStr(m(1250, "USD"))).toBe("1250 USD");
    expect(montoStr(m(800_000, "CRC"))).toBe("800000 CRC");
  });

  it("negativo con el mismo signo menos que usa el formateador de la app", () => {
    expect(montoStr(m(-42_000, "CRC"))).toBe("−42000 CRC");
  });

  it("decimales: enteros limpios, fracciones a 2 sin ceros de relleno", () => {
    expect(montoStr(m(0.5, "USD"))).toBe("0.5 USD");
    expect(montoStr(m(1234.5678, "USD"))).toBe("1234.57 USD");
  });
});

describe("subtotales · agrupa por moneda, ordena por peso", () => {
  it("una sola moneda: suma y queda una entrada", () => {
    expect(subtotales([m(100, "USD"), m(250, "USD")])).toEqual([{ monto: 350, moneda: "USD" }]);
  });

  it("dos monedas: no se mezclan, la más pesada primero", () => {
    expect(subtotales([m(1000, "USD"), m(500_000, "CRC"), m(250, "USD")])).toEqual([
      { monto: 500_000, moneda: "CRC" },
      { monto: 1250, moneda: "USD" },
    ]);
  });

  it("tres monedas: cada una con su subtotal", () => {
    const out = subtotales([m(100, "USD"), m(90, "EUR"), m(50_000, "CRC"), m(10, "EUR")]);
    expect(out).toEqual([
      { monto: 50_000, moneda: "CRC" },
      { monto: 100, moneda: "USD" },
      { monto: 100, moneda: "EUR" },
    ]);
  });

  it("ordena por MAGNITUD: una pérdida grande pesa más que una ganancia chica", () => {
    expect(subtotales([m(380, "USD"), m(-42_000, "CRC")])[0]).toEqual({ monto: -42_000, moneda: "CRC" });
  });

  it("lista vacía → [] (no inventa una moneda ni un cero)", () => {
    expect(subtotales([])).toEqual([]);
  });

  it("ignora entradas sin moneda o con monto no finito (no las cuela como 0)", () => {
    expect(subtotales([m(100, "USD"), m(50, ""), m(Number.NaN, "CRC")])).toEqual([
      { monto: 100, moneda: "USD" },
    ]);
  });
});

describe("subtotalesStr · una línea que nunca miente sobre la suma", () => {
  it("una moneda: el monto tal cual", () => {
    expect(subtotalesStr([m(1250, "USD")])).toBe("1250 USD");
  });

  it("dos monedas positivas: se unen con ' + ' (no se suman)", () => {
    expect(subtotalesStr([m(1250, "USD"), m(800_000, "CRC")])).toBe("800000 CRC + 1250 USD");
  });

  it("P/L mixto: signo explícito en todos, sin ' + ' que se lea como suma", () => {
    expect(subtotalesStr([m(380, "USD"), m(-42_000, "CRC")])).toBe("−42000 CRC +380 USD");
  });

  it("lista vacía → cadena vacía (el llamador omite la línea)", () => {
    expect(subtotalesStr([])).toBe("");
  });
});

describe("convertirTotal · el total solo existe si hay tasas para TODO", () => {
  it("convierte a la moneda destino cuando están todas las tasas", () => {
    expect(convertirTotal([m(1000, "USD"), m(530_000, "CRC")], "CRC", RATES)).toEqual({
      monto: 1_060_000,
      moneda: "CRC",
    });
  });

  it("una sola moneda igual al destino: no necesita tasas", () => {
    expect(convertirTotal([m(1250, "USD")], "USD", null)).toEqual({ monto: 1250, moneda: "USD" });
  });

  it("sin tasas → null (jamás devuelve el monto crudo etiquetado con otra moneda)", () => {
    expect(convertirTotal([m(1000, "USD"), m(530_000, "CRC")], "CRC", null)).toBeNull();
    expect(convertirTotal([m(1000, "USD"), m(530_000, "CRC")], "CRC", {})).toBeNull();
  });

  it("falta la tasa de UNA de las monedas → null (no se convierte 'lo que se puede')", () => {
    // convertCurrency devuelve el monto SIN convertir si no conoce la tasa: confiar en él sumaría
    // 90 EUR como si fueran 90 CRC. Por eso se corta antes.
    expect(convertirTotal([m(1000, "USD"), m(90, "EUR")], "CRC", { USD: 1, CRC: 530 })).toBeNull();
  });

  it("falta la tasa del DESTINO → null", () => {
    expect(convertirTotal([m(1000, "USD")], "CRC", { USD: 1 })).toBeNull();
  });

  it("lista vacía → null (no hay total que dar)", () => {
    expect(convertirTotal([], "CRC", RATES)).toBeNull();
  });
});

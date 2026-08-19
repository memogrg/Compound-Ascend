/**
 * LA REGLA, aislada: lo CONFIGURADO se muestra en su moneda; solo los AGREGADOS cross-moneda se
 * convierten, y se etiquetan. `montosDelSobre` es el único lugar donde eso se decide, así que es
 * el único lugar donde hay que probarlo.
 */
import { describe, it, expect } from "vitest";
import { montosDelSobre, acumularNativo } from "@/modules/financial-base/engine/sobre-moneda";

/** Tabla fija y redonda: 500 colones por dólar. Las cuentas se hacen de cabeza. */
const POR_USD: Record<string, number> = { USD: 1, CRC: 500 };
const convert = (amount: number, from: string, to: string) =>
  (amount / (POR_USD[from] ?? 1)) * (POR_USD[to] ?? 1);

const base = {
  categoryId: "s-rest",
  displayCurrency: "USD",
  budgetEnVisualizacion: 890,
  convert,
};

describe("montosDelSobre", () => {
  it("devuelve la moneda del PRESUPUESTO, no la de visualización", () => {
    const m = montosDelSobre({
      ...base,
      nativo: { value: 445_000, currency: "CRC" },
      gastos: [{ categoryId: "s-rest", amount: 100_000, currency: "CRC" }],
    });
    expect(m).toEqual({
      currency: "CRC",
      budget: 445_000,
      spent: 100_000,
      convertidasDesde: [],
      presupuestoMixto: false,
    });
  });

  it("un gasto en otra moneda se convierte a la del sobre (el sobre manda)", () => {
    const m = montosDelSobre({
      ...base,
      nativo: { value: 445_000, currency: "CRC" },
      gastos: [
        { categoryId: "s-rest", amount: 50_000, currency: "CRC" },
        { categoryId: "s-rest", amount: 40, currency: "USD" }, // → ₡20.000
      ],
    });
    expect(m.currency).toBe("CRC");
    expect(m.spent).toBe(70_000);
    expect(m.convertidasDesde).toEqual(["USD"]);
  });

  it("varias monedas convertidas salen ordenadas y sin repetir", () => {
    const m = montosDelSobre({
      ...base,
      nativo: { value: 1000, currency: "CRC" },
      gastos: [
        { categoryId: "s-rest", amount: 1, currency: "USD" },
        { categoryId: "s-rest", amount: 1, currency: "USD" },
        { categoryId: "s-rest", amount: 1, currency: "EUR" },
      ],
    });
    expect(m.convertidasDesde).toEqual(["EUR", "USD"]);
  });

  it("solo cuenta los gastos de SU categoría", () => {
    const m = montosDelSobre({
      ...base,
      nativo: { value: 1000, currency: "CRC" },
      gastos: [
        { categoryId: "s-rest", amount: 100, currency: "CRC" },
        { categoryId: "otro", amount: 900, currency: "CRC" },
        { categoryId: null, amount: 50, currency: "CRC" },
      ],
    });
    expect(m.spent).toBe(100);
  });

  it("presupuesto MIXTO → no hay moneda propia: cae a visualización y lo dice", () => {
    const m = montosDelSobre({
      ...base,
      nativo: { value: 445_300, currency: "CRC", mixed: true },
      gastos: [{ categoryId: "s-rest", amount: 100, currency: "USD" }],
    });
    expect(m.currency).toBe("USD");
    expect(m.budget).toBe(890); // el convertido, no la suma de ₡ con $
    expect(m.spent).toBe(100);
    expect(m.presupuestoMixto).toBe(true);
  });

  it("sin presupuesto → budget 0 en la moneda de visualización, pero el gasto se sigue contando", () => {
    const m = montosDelSobre({
      ...base,
      nativo: undefined,
      budgetEnVisualizacion: 0,
      gastos: [{ categoryId: "s-rest", amount: 30, currency: "USD" }],
    });
    expect(m).toMatchObject({ currency: "USD", budget: 0, spent: 30 });
  });
});

/**
 * `acumularNativo` es lo que decide si un sobre TIENE moneda propia. Antes esto vivía dentro de
 * la query de presupuesto y sumaba ₡ con $ sin decir nada, etiquetando el total con la moneda de
 * la última línea leída: ₡300.000 + $50 salía como "₡300.050".
 */
describe("acumularNativo", () => {
  const linea = (amount: number, currency: string, label = "Restaurantes") => ({
    label,
    amount,
    currency,
  });

  it("la primera línea fija la moneda del sobre", () => {
    expect(acumularNativo(undefined, linea(100_000, "CRC"))).toEqual({
      label: "Restaurantes",
      value: 100_000,
      currency: "CRC",
    });
  });

  it("dos líneas en la MISMA moneda suman y no marcan mezcla", () => {
    const a = acumularNativo(undefined, linea(100_000, "CRC"));
    const b = acumularNativo(a, linea(45_000, "CRC"));
    expect(b).toEqual({ label: "Restaurantes", value: 145_000, currency: "CRC" });
    expect(b.mixed).toBeUndefined();
  });

  it("dos monedas distintas marcan `mixed` (la suma dejó de significar algo)", () => {
    const a = acumularNativo(undefined, linea(300_000, "CRC"));
    const b = acumularNativo(a, linea(50, "USD"));
    expect(b.mixed).toBe(true);
  });

  it("una vez mezclado, sigue mezclado aunque la tercera línea vuelva a la primera moneda", () => {
    const a = acumularNativo(undefined, linea(300_000, "CRC"));
    const b = acumularNativo(a, linea(50, "USD"));
    const c = acumularNativo(b, linea(10_000, "CRC"));
    expect(c.mixed).toBe(true);
  });
});

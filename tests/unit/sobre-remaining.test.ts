import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * EL SOBRE SE MUESTRA EN SU MONEDA.
 *
 * Antes `getSobreRemaining` devolvía todo convertido a la moneda de VISUALIZACIÓN: un sobre
 * presupuestado en ₡445.000 se leía "te quedan $345 de $445". Números correctos como conversión,
 * pero el usuario nunca escribió ese "445" en dólares — no lo puede verificar y contradice lo que
 * él mismo configuró.
 *
 * Se mockean getBudgetTotals/getRealTotals/listCategories (el servicio NO recalcula a mano) y las
 * tasas; la aritmética de conversión la hace el `convertCurrency` real.
 */
const h = vi.hoisted(() => ({
  budgetByKey: {} as Record<string, { label: string; value: number }>,
  nativeByKey: {} as Record<
    string,
    { label: string; value: number; currency: string; mixed?: boolean }
  >,
  expenseTxns: [] as { categoryId: string | null; amount: number; currency: string }[],
  currency: "CRC",
  cats: [] as Record<string, unknown>[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/modules/financial-base/services/budget-service", () => ({
  getBudgetTotals: async () => ({
    expenseByKey: h.budgetByKey,
    nativeByKey: h.nativeByKey,
    currency: h.currency,
  }),
}));
vi.mock("@/modules/financial-base/services/transaction-service", () => ({
  getRealTotals: async () => ({ expenseTxns: h.expenseTxns, currency: h.currency }),
}));
vi.mock("@/modules/financial-base/services/categories-service", () => ({
  listCategories: async () => h.cats,
}));
// Tasa fija y redonda para que las cuentas del test se puedan hacer de cabeza: 500 ₡ por dólar.
vi.mock("@/lib/market-data/fx-rates", () => ({
  getFxRates: async () => ({ USD: 1, CRC: 500 }),
}));

import { getSobreRemaining } from "@/modules/financial-base/services/sobre-remaining";

const cat = (over: Record<string, unknown>) => ({
  id: "x",
  name: "X",
  parentId: null,
  isActive: true,
  categoryType: "expense",
  ...over,
});

/** Presupuesto del sobre: el nativo (lo configurado) y su equivalente en la de visualización. */
const presupuesto = (id: string, label: string, nativo: number, cur: string, display: number) => {
  h.nativeByKey[id] = { label, value: nativo, currency: cur };
  h.budgetByKey[id] = { label, value: display };
};

beforeEach(() => {
  h.budgetByKey = {};
  h.nativeByKey = {};
  h.expenseTxns = [];
  h.currency = "CRC";
  h.cats = [
    cat({ id: "f-alim", name: "Alimentación" }),
    cat({ id: "s-rest", name: "Restaurantes", parentId: "f-alim" }),
    cat({ id: "s-suelto", name: "Suelto", parentId: null }),
  ];
});

describe("la moneda del sobre es la que se configuró", () => {
  it("sobre en CRC con la app en USD → cifras en ₡, no en $ (el bug reportado)", async () => {
    h.currency = "USD"; // moneda de VISUALIZACIÓN
    presupuesto("s-rest", "Restaurantes", 445_000, "CRC", 890);
    h.expenseTxns = [{ categoryId: "s-rest", amount: 100_000, currency: "CRC" }];

    const r = await getSobreRemaining("s-rest", "2026-07-15");
    expect(r).toMatchObject({
      currency: "CRC",
      budget: 445_000,
      spent: 100_000,
      remaining: 345_000,
      hasBudget: true,
    });
    // Y sin nota: no hubo ninguna conversión metida en esas cifras.
    expect(r?.convertidasDesde).toEqual([]);
  });

  it("sobre en USD con la app en CRC → cifras en $", async () => {
    h.currency = "CRC";
    presupuesto("s-rest", "Restaurantes", 300, "USD", 150_000);
    h.expenseTxns = [{ categoryId: "s-rest", amount: 120, currency: "USD" }];

    const r = await getSobreRemaining("s-rest", "2026-07-15");
    expect(r).toMatchObject({ currency: "USD", budget: 300, spent: 120, remaining: 180 });
  });
});

describe("gasto registrado en otra moneda que el sobre", () => {
  it("se convierte a la moneda del SOBRE para descontarlo (el sobre manda)", async () => {
    h.currency = "USD";
    presupuesto("s-rest", "Restaurantes", 100_000, "CRC", 200);
    h.expenseTxns = [
      { categoryId: "s-rest", amount: 20_000, currency: "CRC" }, // nativo
      { categoryId: "s-rest", amount: 40, currency: "USD" }, // 40 × 500 = ₡20.000
    ];

    const r = await getSobreRemaining("s-rest", "2026-07-15");
    expect(r?.currency).toBe("CRC");
    expect(r?.spent).toBe(40_000);
    expect(r?.remaining).toBe(60_000);
  });

  it("lo DICE: la moneda convertida queda registrada para que el copy la nombre", async () => {
    h.currency = "CRC";
    presupuesto("s-rest", "Restaurantes", 100_000, "CRC", 100_000);
    h.expenseTxns = [{ categoryId: "s-rest", amount: 40, currency: "USD" }];

    const r = await getSobreRemaining("s-rest", "2026-07-15");
    expect(r?.convertidasDesde).toEqual(["USD"]);
  });

  it("los gastos de OTROS sobres no se cuentan", async () => {
    presupuesto("s-rest", "Restaurantes", 100_000, "CRC", 100_000);
    h.expenseTxns = [
      { categoryId: "s-rest", amount: 10_000, currency: "CRC" },
      { categoryId: "s-suelto", amount: 90_000, currency: "CRC" },
      { categoryId: null, amount: 5_000, currency: "CRC" },
    ];

    const r = await getSobreRemaining("s-rest", "2026-07-15");
    expect(r?.spent).toBe(10_000);
  });
});

describe("presupuesto que MEZCLA monedas", () => {
  it("no hay moneda propia: cae a la de visualización y lo etiqueta", async () => {
    h.currency = "USD";
    h.nativeByKey["s-rest"] = {
      label: "Restaurantes",
      value: 445_300,
      currency: "CRC",
      mixed: true,
    };
    h.budgetByKey["s-rest"] = { label: "Restaurantes", value: 1_190 };
    h.expenseTxns = [{ categoryId: "s-rest", amount: 100, currency: "USD" }];

    const r = await getSobreRemaining("s-rest", "2026-07-15");
    expect(r?.currency).toBe("USD");
    expect(r?.budget).toBe(1_190); // el convertido, NO la suma de ₡ con $
    expect(r?.presupuestoMixto).toBe(true);
  });
});

describe("los casos que ya funcionaban siguen funcionando", () => {
  it("sobre con presupuesto → restante = budget − spent y ruta 'Frasco › Sobre'", async () => {
    presupuesto("s-rest", "Restaurantes", 100_000, "CRC", 100_000);
    h.expenseTxns = [{ categoryId: "s-rest", amount: 30_000, currency: "CRC" }];
    const r = await getSobreRemaining("s-rest", "2026-07-15");
    expect(r).toMatchObject({
      path: "Alimentación › Restaurantes",
      currency: "CRC",
      budget: 100_000,
      spent: 30_000,
      remaining: 70_000,
      hasBudget: true,
    });
  });

  it("sobre SIN presupuesto del mes → hasBudget:false, sin inventar restante", async () => {
    h.expenseTxns = [{ categoryId: "s-rest", amount: 30_000, currency: "CRC" }];
    const r = await getSobreRemaining("s-rest", "2026-07-15");
    expect(r).toMatchObject({ hasBudget: false, budget: 0, remaining: 0, spent: 30_000 });
  });

  it("gasto que excede el presupuesto → restante negativo", async () => {
    presupuesto("s-rest", "Restaurantes", 50_000, "CRC", 50_000);
    h.expenseTxns = [{ categoryId: "s-rest", amount: 72_000, currency: "CRC" }];
    const r = await getSobreRemaining("s-rest", "2026-07-15");
    expect(r?.remaining).toBe(-22_000);
    expect(r?.hasBudget).toBe(true);
  });

  it("sobre sin frasco (sin padre) → path = solo el sobre", async () => {
    presupuesto("s-suelto", "Suelto", 10_000, "CRC", 10_000);
    const r = await getSobreRemaining("s-suelto", "2026-07-15");
    expect(r?.path).toBe("Suelto");
  });

  it("categoryId inexistente → null (el chat degrada a mensaje genérico)", async () => {
    expect(await getSobreRemaining("no-existe", "2026-07-15")).toBeNull();
  });

  it("fecha inválida → null", async () => {
    expect(await getSobreRemaining("s-rest", "")).toBeNull();
  });
});

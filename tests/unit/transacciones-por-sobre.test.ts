/**
 * BANCO DE AUDITORÍA · "dame las transacciones de {sobre} del {periodo}".
 *
 * El bug que motivó esto: la consulta ignoraba el sobre y devolvía TODAS las categorías. Acá se
 * prueba de punta a punta —resolución del sobre contra los sobres reales + filtrado + render—
 * para los cuatro casos pedidos: restaurantes, transporte, supermercados y un sobre CREADO por el
 * usuario. En todos: solo ese sobre, en tabla, con total, en la moneda de visualización.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// Sobres del usuario: los de fábrica MÁS uno propio. Es la misma forma que devuelve
// listSobresForKind (la fuente del selector del chat).
const SOBRES = [
  { id: "cat-rest", sobre: "Restaurantes", frasco: "Vivir" },
  { id: "cat-transp", sobre: "Transporte", frasco: "Vivir" },
  { id: "cat-super", sobre: "Supermercado", frasco: "Vivir" },
  { id: "cat-corte", sobre: "Corte Pelo David", frasco: "Cuidado personal" },
  { id: "cat-padel", sobre: "Padel", frasco: "Disfrute" },
];

const NOMBRES: Record<string, string> = {
  "cat-rest": "Restaurantes",
  "cat-transp": "Transporte",
  "cat-super": "Supermercado",
  "cat-corte": "Corte Pelo David",
  "cat-padel": "Padel",
};

// Libro diario del mes pasado: un movimiento por sobre + varios en Restaurantes, y uno en USD
// para verificar la conversión a la moneda de visualización.
const TXNS = [
  { kind: "gasto", amount: 12_500, currency: "CRC", occurredOn: "2026-07-03", merchantOrSource: "Rosti Pollos", description: null, categoryId: "cat-rest" },
  { kind: "gasto", amount: 8_400, currency: "CRC", occurredOn: "2026-07-11", merchantOrSource: "Soda La U", description: null, categoryId: "cat-rest" },
  { kind: "gasto", amount: 20, currency: "USD", occurredOn: "2026-07-19", merchantOrSource: "Uber Eats", description: null, categoryId: "cat-rest" },
  { kind: "gasto", amount: 35_000, currency: "CRC", occurredOn: "2026-07-06", merchantOrSource: "Gasolinera Delta", description: null, categoryId: "cat-transp" },
  { kind: "gasto", amount: 90_000, currency: "CRC", occurredOn: "2026-07-08", merchantOrSource: "Auto Mercado", description: null, categoryId: "cat-super" },
  { kind: "gasto", amount: 15_000, currency: "CRC", occurredOn: "2026-07-14", merchantOrSource: "Barbería Central", description: null, categoryId: "cat-corte" },
  { kind: "gasto", amount: 25_000, currency: "CRC", occurredOn: "2026-07-21", merchantOrSource: "Club Padel CR", description: null, categoryId: "cat-padel" },
];

const listSobres = vi.fn(async () => SOBRES);
vi.mock("@/modules/financial-base", () => ({
  listTransactions: async () => TXNS,
  getCategoryNameMap: async () => NOMBRES,
  listSobresForKind: () => listSobres(),
}));
vi.mock("@/lib/time/user-time", () => ({ userToday: async () => "2026-08-03" }));
// 1 USD = 500 CRC (rates expresadas como en la app: unidades por USD).
vi.mock("@/lib/market-data/fx-rates", () => ({
  getFxRates: async () => ({ USD: 1, CRC: 500 }),
}));

import { consultarTransacciones } from "@/lib/ai/transactions-query-service";

const consultar = (sobre: string) =>
  consultarTransacciones({ periodo: "mes_pasado", tipo: "gasto", sobre, agrupacion: "ninguna" }, "CRC");

beforeEach(() => listSobres.mockClear());

describe("solo el sobre pedido, nunca todas las categorías", () => {
  it("restaurantes → sus 3 movimientos y ninguno de otro sobre", async () => {
    const r = await consultar("restaurantes");
    expect(r.conteo).toBe(3);
    expect(r.movimientos.map((m) => m.etiqueta)).toEqual([
      "Uber Eats",
      "Soda La U",
      "Rosti Pollos",
    ]);
    expect(r.resumen_md).not.toContain("Gasolinera");
    expect(r.resumen_md).not.toContain("Auto Mercado");
  });

  it("transporte → solo el suyo", async () => {
    const r = await consultar("transporte");
    expect(r.conteo).toBe(1);
    expect(r.resumen_md).toContain("Gasolinera Delta");
    expect(r.resumen_md).not.toContain("Rosti Pollos");
  });

  it("supermercados (plural, el sobre es singular) → resuelve igual", async () => {
    const r = await consultar("supermercados");
    expect(r.conteo).toBe(1);
    expect(r.resumen_md).toContain("Auto Mercado");
  });

  it("un sobre CREADO por el usuario resuelve como cualquier otro", async () => {
    const corte = await consultar("Corte Pelo David");
    expect(corte.conteo).toBe(1);
    expect(corte.resumen_md).toContain("Barbería Central");

    const padel = await consultar("padel");
    expect(padel.conteo).toBe(1);
    expect(padel.resumen_md).toContain("Club Padel CR");
  });

  it("la lista de sobres se pide al MISMO origen del selector del chat", async () => {
    await consultar("restaurantes");
    expect(listSobres).toHaveBeenCalled();
  });
});

describe("salida en TABLA con total", () => {
  it("cabecera, fila de guiones y una fila por movimiento", async () => {
    const md = (await consultar("restaurantes")).resumen_md;
    expect(md).toContain("| Fecha | Comercio | Monto |");
    expect(md).toContain("| --- | --- | --- |");
    expect(md).toContain("Rosti Pollos");
    // Sin viñetas: era el formato viejo.
    expect(md).not.toMatch(/^•/m);
  });

  it("cierra con una fila de TOTAL", async () => {
    const md = (await consultar("restaurantes")).resumen_md;
    expect(md).toMatch(/\|\s*\*\*Total\*\*\s*\|/);
  });

  it("el total del sobre es la suma de SUS movimientos, no la del mes", async () => {
    // 12.500 + 8.400 + (20 USD × 500) = 30.900
    const r = await consultar("restaurantes");
    expect(r.total).toBe(30_900);
  });
});

describe("moneda de visualización, sin mezcla", () => {
  it("el movimiento en USD se muestra convertido a CRC", async () => {
    const r = await consultar("restaurantes");
    const uber = r.movimientos.find((m) => m.etiqueta === "Uber Eats");
    expect(uber?.moneda).toBe("USD"); // el dato original se conserva
    expect(uber?.montoConvertido).toBe(10_000); // 20 × 500
    // En la tabla NO aparece el símbolo de dólar: todo va en la moneda de visualización.
    expect(r.resumen_md).not.toContain("$20");
  });

  it("consultando en USD, la misma consulta sale toda en dólares", async () => {
    const r = await consultarTransacciones(
      { periodo: "mes_pasado", tipo: "gasto", sobre: "restaurantes", agrupacion: "ninguna" },
      "USD",
    );
    expect(r.moneda).toBe("USD");
    // 20.900 CRC / 500 = 41,8 + 20 USD = 61,8 → 62: `convertirTotal` redondea a entero (ya lo
    // hacía antes de este cambio; se fija acá para que el redondeo no se mueva sin querer).
    expect(r.total).toBe(62);
  });
});

describe("degradación honesta", () => {
  it("un sobre que no existe se DICE; no se devuelve todo", async () => {
    const r = await consultar("criptomonedas");
    expect(r.resumen_md).toMatch(/No encontré un sobre/i);
    expect(r.conteo).toBe(0);
    expect(r.resumen_md).not.toContain("Rosti Pollos");
  });

  it("un término ambiguo pregunta cuál, sin adivinar", async () => {
    listSobres.mockResolvedValueOnce([
      { id: "a", sobre: "Seguro auto", frasco: "Protección" },
      { id: "b", sobre: "Seguro casa", frasco: "Protección" },
    ]);
    const r = await consultar("seguro");
    expect(r.resumen_md).toMatch(/varios sobres/i);
    expect(r.resumen_md).toContain("Seguro auto");
    expect(r.resumen_md).toContain("Seguro casa");
    expect(r.conteo).toBe(0);
  });

  it("un sobre sin movimientos en el periodo lo dice, con su nombre real", async () => {
    listSobres.mockResolvedValueOnce([{ id: "cat-vacio", sobre: "Mascotas", frasco: "Vivir" }]);
    const r = await consultar("mascotas");
    expect(r.conteo).toBe(0);
    expect(r.resumen_md).toMatch(/No tenés gastos.*Mascotas/i);
  });
});

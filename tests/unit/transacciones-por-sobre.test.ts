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
  { id: "cat-namore", sobre: "Namore", frasco: "Vivir" },
];

const NOMBRES: Record<string, string> = {
  "cat-rest": "Restaurantes",
  "cat-transp": "Transporte",
  "cat-super": "Supermercado",
  "cat-corte": "Corte Pelo David",
  "cat-padel": "Padel",
  "cat-namore": "Namore",
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
  // DOS consumos reales el mismo día, mismo lugar, mismo monto: ids distintos. Es el caso que
  // en la app se veía como "una fila repetida".
  { id: "dup1aaaa-0000", kind: "gasto", amount: 9_500, currency: "CRC", occurredOn: "2026-07-12", merchantOrSource: "Namore", description: null, categoryId: "cat-namore" },
  { id: "dup2bbbb-0000", kind: "gasto", amount: 9_500, currency: "CRC", occurredOn: "2026-07-12", merchantOrSource: "Namore", description: null, categoryId: "cat-namore" },
];

const listSobres = vi.fn(async () => SOBRES);
vi.mock("@/modules/financial-base", () => ({
  listTransactions: async () => TXNS,
  getCategoryNameMap: async () => NOMBRES,
  // La consulta HISTÓRICA resuelve contra listAllSobresForKind (todas las hojas), no contra
  // listSobresForKind (recortada a las adoptadas ESTE mes). El mock hace fallar a la segunda a
  // propósito: si alguien vuelve a engancharla, estos tests se caen en vez de romperlo en prod.
  listAllSobresForKind: () => listSobres(),
  listSobresForKind: () => {
    throw new Error("consulta histórica: debe usar listAllSobresForKind");
  },
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

describe("MONEDA NATIVA en la lista de movimientos", () => {
  // Cambio de contrato: un movimiento individual es un HECHO ("pagué ₡3.900"). Convertirlo a la
  // moneda de visualización lo vuelve irreconocible contra el estado de cuenta o el recibo. La
  // conversión sigue viva en los AGREGADOS (desglose por sobre, por mes, comparaciones).
  it("un gasto en colones se muestra en colones aunque el display sea USD", async () => {
    const r = await consultarTransacciones(
      { periodo: "mes_pasado", tipo: "gasto", sobre: "transporte", agrupacion: "ninguna" },
      "USD",
    );
    expect(r.resumen_md).toContain("₡35.000");
    expect(r.resumen_md).not.toContain("$70"); // 35.000/500, la conversión que ya NO se hace
  });

  it("el total de la lista va en la moneda de los movimientos, no en la de display", async () => {
    const r = await consultarTransacciones(
      { periodo: "mes_pasado", tipo: "gasto", sobre: "transporte", agrupacion: "ninguna" },
      "USD",
    );
    expect(r.resumen_md).toMatch(/\|\s*\*\*Total\*\*\s*\|\s*\|\s*\*\*₡35\.000\*\*/);
  });

  it("lista con DOS monedas: subtotal por moneda, sin sumar peras con manzanas", async () => {
    // Restaurantes trae ₡12.500 + ₡8.400 + $20.
    const r = await consultar("restaurantes");
    expect(r.resumen_md).toContain("₡20.900");
    expect(r.resumen_md).toContain("$20");
    // Y NO aparece el total convertido (30.900) como si fuera una sola cifra.
    expect(r.resumen_md).not.toMatch(/\*\*₡30\.900\*\*/);
  });

  it("el dato convertido SIGUE en el payload (los agregados lo usan)", async () => {
    const r = await consultar("restaurantes");
    const uber = r.movimientos.find((m) => m.etiqueta === "Uber Eats");
    expect(uber?.moneda).toBe("USD");
    expect(uber?.montoConvertido).toBe(10_000); // 20 × 500
    expect(r.total).toBe(30_900);
  });
});

describe("movimientos que se ven idénticos", () => {
  it("mismo día, comercio y monto → se distinguen con el id corto", async () => {
    const r = await consultarTransacciones(
      { periodo: "mes_pasado", tipo: "gasto", sobre: "namore", agrupacion: "ninguna" },
      "CRC",
    );
    expect(r.conteo).toBe(2);
    // Las dos filas existen y se pueden distinguir: cada una trae su sufijo.
    expect(r.resumen_md).toContain("#dup1");
    expect(r.resumen_md).toContain("#dup2");
  });

  it("una fila sola NO lleva sufijo (sería ruido)", async () => {
    const r = await consultar("transporte");
    expect(r.resumen_md).not.toContain("#");
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

// ---------------------------------------------------------------------------
// BANCO · la consulta REAL que seguía fallando en producción, punta a punta y en USD
// (la moneda de visualización del usuario que la reportó).
//
// Se rutea con matchIntent para que el test cubra el camino ENTERO —frase → intent → params →
// servicio— y no solo el servicio con params escritos a mano, que es lo que dejó pasar el bug.
// ---------------------------------------------------------------------------
import { matchIntent } from "@/lib/ai/router";

const consultarDesdeFrase = async (frase: string, moneda = "USD") => {
  const m = matchIntent(frase);
  expect(m?.intent, `«${frase}» no ruteó al libro diario`).toBe("consulta_transacciones");
  return consultarTransacciones(m!.params, moneda);
};

describe("banco · «transacciones de {sobre} del mes pasado» en USD", () => {
  const casos: [string, string, string][] = [
    // frase, comercio que SÍ tiene que salir, comercio que NO
    [
      "dame una tabla de todas las transacciones de restaurante del mes pasado y el total del gasto",
      "Rosti Pollos",
      "Gasolinera Delta",
    ],
    ["dame todas las transacciones de transporte del mes pasado y el total", "Gasolinera Delta", "Rosti Pollos"],
    ["dame una tabla de las transacciones de super del mes pasado y el total", "Auto Mercado", "Rosti Pollos"],
    // Sobre CREADO por el usuario.
    ["dame las transacciones de Corte Pelo David del mes pasado", "Barbería Central", "Auto Mercado"],
    ["dame una tabla de las transacciones de padel del mes pasado y el total", "Club Padel CR", "Rosti Pollos"],
  ];

  for (const [frase, incluye, excluye] of casos) {
    it(`«${frase.slice(0, 52)}…» → solo ese sobre`, async () => {
      const r = await consultarDesdeFrase(frase);
      expect(r.resumen_md).toContain(incluye);
      expect(r.resumen_md).not.toContain(excluye);
    });

    it(`«${frase.slice(0, 52)}…» → tabla con total, en la moneda del gasto`, async () => {
      const r = await consultarDesdeFrase(frase);
      expect(r.resumen_md).toContain("| Fecha | Comercio | Monto |");
      expect(r.resumen_md).toMatch(/\|\s*\*\*Total\*\*\s*\|/);
      expect(r.resumen_md).not.toMatch(/^•/m); // nada de viñetas
      // Los gastos del fixture son en colones: se muestran en COLONES aunque el display sea USD.
      // Un movimiento individual es un hecho, no una cifra a convertir.
      expect(r.resumen_md).toContain("₡");
      expect(r.total).not.toBeNull();
    });
  }

  it("el singular «restaurante» resuelve el sobre «Restaurantes» (plural)", async () => {
    const r = await consultarDesdeFrase(
      "dame una tabla de todas las transacciones de restaurante del mes pasado y el total del gasto",
    );
    expect(r.filtros.sobre).toBe("Vivir › Restaurantes");
    expect(r.conteo).toBe(3);
  });

  it("un sobre usado el mes PASADO y no este resuelve igual (el bug del recorte por adopción)", async () => {
    // listAllSobresForKind no filtra por adopción del mes en curso: por eso este caso funciona.
    const r = await consultarDesdeFrase("dame las transacciones de padel del mes pasado");
    expect(r.conteo).toBe(1);
    expect(r.resumen_md).toContain("Club Padel CR");
  });
});

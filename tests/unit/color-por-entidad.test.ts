/**
 * El color sigue a la ENTIDAD, nunca a su puesto en el ranking.
 *
 * Es la regla que `/m/patrimonio` y `/m/inversiones` rompían: pintaban el anillo con una
 * paleta cíclica indexada por posición (`RING_COLORS[i % 5]`), así que el mes en que una
 * clase adelantaba a otra las dos se intercambiaban el color. El anillo contaba una
 * historia distinta sin que hubiera cambiado ningún dato — y el usuario que aprendió «el
 * teal son mis líquidos» se lo encontraba en otra porción.
 *
 * Lo que se fija acá es la propiedad, no el valor: da igual cuál sea el teal exacto,
 * importa que sea el MISMO antes y después de reordenar.
 */
import { describe, it, expect } from "vitest";

import { buildRichLifeSnapshot } from "@/modules/rich-life/engine/rich-life-engine";
import { allocationByNature } from "@/modules/wealth/engine/portfolio-engine";
import type { RichLifeInput, Asset, Liability } from "@/modules/rich-life/types";
import type { HoldingPerformance } from "@/modules/wealth/types";

function activo(id: string, assetClass: Asset["assetClass"], value: number): Asset {
  return { id, name: id, assetClass, value, currency: "CRC", generatesIncome: false };
}

function entrada(assets: Asset[], liabilities: Liability[] = []): RichLifeInput {
  return {
    assets,
    liabilities,
    passiveIncomeMonthly: 0,
    monthlyExpenses: 1000,
    freeCashflow: 0,
    protectionScore: 50,
    diversification: "media",
    currency: "CRC",
  };
}

/** Mapa clase → color, que es lo único que este test mira. */
function coloresPorClase(assets: Asset[]): Record<string, string> {
  const snap = buildRichLifeSnapshot(entrada(assets));
  return Object.fromEntries(snap.assetsByClass.map((c) => [c.label, c.color]));
}

describe("clases de activo", () => {
  it("invertir el orden de dos clases no cambia el color de ninguna", () => {
    // Mismo conjunto, distinto ranking: primero líquidos por encima de inversión…
    const a = coloresPorClase([
      activo("efectivo", "liquido", 9000),
      activo("etf", "inversion", 1000),
      activo("casa", "uso_personal", 500),
    ]);
    // …y después al revés.
    const b = coloresPorClase([
      activo("efectivo", "liquido", 1000),
      activo("etf", "inversion", 9000),
      activo("casa", "uso_personal", 500),
    ]);
    expect(b).toEqual(a);
  });

  it("el orden por valor sí cambia, que es lo que debe cambiar", () => {
    const arriba = buildRichLifeSnapshot(
      entrada([activo("efectivo", "liquido", 9000), activo("etf", "inversion", 1000)]),
    ).assetsByClass.map((c) => c.label);
    const abajo = buildRichLifeSnapshot(
      entrada([activo("efectivo", "liquido", 1000), activo("etf", "inversion", 9000)]),
    ).assetsByClass.map((c) => c.label);
    expect(abajo).toEqual([...arriba].reverse());
  });

  it("quitar una clase no recolorea las que quedan", () => {
    // El fallo clásico de la paleta por índice: al desaparecer la primera, todas suben un
    // puesto y todas cambian de color.
    const conTres = coloresPorClase([
      activo("efectivo", "liquido", 9000),
      activo("etf", "inversion", 5000),
      activo("casa", "uso_personal", 1000),
    ]);
    const sinLaPrimera = coloresPorClase([
      activo("etf", "inversion", 5000),
      activo("casa", "uso_personal", 1000),
    ]);
    for (const [clase, color] of Object.entries(sinLaPrimera)) {
      expect(conTres[clase], `la clase «${clase}» cambió de color al quedarse sola`).toBe(color);
    }
  });

  it("cada color es un token, no un literal", () => {
    // Un hex acá no voltearía con el tema oscuro.
    for (const c of Object.values(coloresPorClase([activo("efectivo", "liquido", 1)]))) {
      expect(c).toMatch(/^var\(--/);
    }
  });
});

function holding(id: string, nature: "cashflow" | "growth", currentValue: number) {
  return { id, symbol: id, nature, currentValue } as unknown as HoldingPerformance;
}

describe("naturaleza de la inversión", () => {
  it("invertir el orden no cambia el color de ninguna naturaleza", () => {
    const mapa = (hs: HoldingPerformance[]) =>
      Object.fromEntries(allocationByNature(hs).map((s) => [s.label, s.color]));

    const a = mapa([holding("bono", "cashflow", 9000), holding("etf", "growth", 1000)]);
    const b = mapa([holding("bono", "cashflow", 1000), holding("etf", "growth", 9000)]);
    expect(b).toEqual(a);
  });

  it("una naturaleza sin nada sigue teniendo su color", () => {
    // `allocationByNature` devuelve SIEMPRE las dos: la porción en cero no se descarta, y
    // por eso la de al lado no hereda su color al filtrarse por valor.
    const s = allocationByNature([holding("etf", "growth", 1000)]);
    expect(s).toHaveLength(2);
    expect(s.find((x) => x.value === 0)?.color).toMatch(/^var\(--/);
  });
});

/**
 * Las paletas de ENTIDAD no usan el vocabulario de los ESTADOS.
 *
 * `--pos`, `--neg`, `--warn`, `--c-expense`, `--c-savings` y `--c-debt` significan «a favor»,
 * «en contra», «atención», «gasto», «ahorro» y «deuda». Una clase de activo no es un estado:
 * un activo productivo no es «positivo» y uno de uso personal no es un gasto. Pintarlas con
 * esos tokens le dice al usuario algo que no queríamos decir.
 *
 * Y tenía una consecuencia dura, no solo conceptual: dos alias distintos resolvían al mismo
 * color (`--c-expense` y `--gold` → #b07a2e; `--c-debt` y `--neg` → #c34f4b), así que dos
 * clases salían indistinguibles en el anillo.
 */
const SEMANTICOS_DE_ESTADO =
  /--(pos|neg|warn|success|danger|warning|c-expense|c-savings|c-debt|c-income|gold|teal)\b/;

function todosDistintos(mapa: Record<string, string>, etiqueta: string) {
  const valores = Object.values(mapa);
  expect(new Set(valores).size, `${etiqueta}: ${JSON.stringify(mapa)}`).toBe(valores.length);
}

describe("paletas de entidad: categóricas y sin colisiones", () => {
  const TODAS_LAS_CLASES: Asset["assetClass"][] = [
    "liquido",
    "inversion",
    "productivo",
    "uso_personal",
    "especial",
  ];
  const TODAS_LAS_DEUDAS: Liability["liabilityClass"][] = [
    "consumo",
    "patrimonial",
    "productivo",
    "critico",
  ];

  const snap = buildRichLifeSnapshot(
    entrada(
      TODAS_LAS_CLASES.map((c, i) => activo(c, c, 1000 + i)),
      TODAS_LAS_DEUDAS.map((c, i) => ({
        id: c,
        name: c,
        liabilityClass: c,
        balance: 500 + i,
        currency: "CRC",
      })),
    ),
  );
  const colorActivos = Object.fromEntries(snap.assetsByClass.map((c) => [c.label, c.color]));
  const colorPasivos = Object.fromEntries(snap.liabilitiesByClass.map((c) => [c.label, c.color]));

  it("las cinco clases de activo aparecen, cada una con un token distinto", () => {
    expect(Object.keys(colorActivos)).toHaveLength(5);
    todosDistintos(colorActivos, "activos");
  });

  it("las cuatro clases de pasivo aparecen, cada una con un token distinto", () => {
    // `--c-debt` y `--neg` eran los DOS #c34f4b: «Consumo» y «Críticos» salían idénticos.
    expect(Object.keys(colorPasivos)).toHaveLength(4);
    todosDistintos(colorPasivos, "pasivos");
  });

  it("las dos naturalezas de inversión llevan tokens distintos", () => {
    const nat = Object.fromEntries(
      allocationByNature([holding("bono", "cashflow", 100), holding("etf", "growth", 100)]).map(
        (s) => [s.label, s.color],
      ),
    );
    todosDistintos(nat, "naturalezas");
  });

  it("ninguna paleta de entidad usa un token semántico de estado", () => {
    for (const [nombre, mapa] of [
      ["activos", colorActivos],
      ["pasivos", colorPasivos],
    ] as const) {
      for (const [clase, color] of Object.entries(mapa)) {
        expect(color, `${nombre} → ${clase}`).not.toMatch(SEMANTICOS_DE_ESTADO);
      }
    }
  });

  it("todas se construyen sobre la paleta categórica validada", () => {
    // Los activos usan el token directo; los pasivos, una mezcla sobre `--chart-4` contra el
    // fondo —contra `--bg` y no contra blanco, para que la rampa siga funcionando en oscuro—.
    for (const color of Object.values(colorActivos)) {
      expect(color).toMatch(/^var\(--chart-[1-6]\)$/);
    }
    for (const color of Object.values(colorPasivos)) {
      expect(color).toMatch(
        /^(var\(--chart-4\)|color-mix\(in srgb, var\(--chart-4\) \d+%, var\(--bg\)\))$/,
      );
    }
  });

  it("UNA PANTALLA, UN COLOR: /mi-rich-life no repite entre sus dos anillos", () => {
    // Que estén en gráficos distintos no basta. Quien mira la pantalla ve nueve porciones a
    // la vez, y si dos comparten color la lectura es ambigua aunque cada leyenda sea
    // correcta. Nueve entidades, nueve colores.
    const dePantalla = [...Object.values(colorActivos), ...Object.values(colorPasivos)];
    expect(dePantalla).toHaveLength(9);
    expect(new Set(dePantalla).size, dePantalla.join(" · ")).toBe(9);
  });

  it("los pasivos son una rampa de un tono que ningún activo usa", () => {
    // Son dos familias, no nueve cosas equivalentes: el anillo de deudas se lee de un vistazo
    // como «esto es todo lo que debo», y la intensidad ordena por gravedad.
    for (const c of Object.values(colorPasivos)) {
      expect(c, "pasivo").toMatch(/--chart-4/);
    }
    for (const c of Object.values(colorActivos)) {
      expect(c, "activo").not.toMatch(/--chart-4/);
    }
  });

  it("/m/patrimonio muestra solo activos: cinco entidades, cinco colores", () => {
    const solo = Object.values(colorActivos);
    expect(new Set(solo).size).toBe(solo.length);
  });

  it("en /patrimonio, la naturaleza no choca con las primeras categorías", () => {
    // `CONC_PALETTE` arranca con `--pos` y `--info`, que resuelven al mismo valor que
    // `--chart-1` y `--chart-2`. Si la naturaleza usara esos, «Crecimiento» saldría del color
    // exacto de la categoría más grande de al lado.
    //
    // PENDIENTE, y queda declarado acá: el anillo de categorías reparte NUEVE colores por
    // POSICIÓN entre hasta 23 categorías, con tokens de estado y una colisión interna
    // (`--gold` y `--warn` son los dos #b07a2e). La unicidad por pantalla en `/patrimonio`
    // está garantizada para el anillo de naturaleza, no para el de categorías.
    const nat = allocationByNature([
      holding("bono", "cashflow", 100),
      holding("etf", "growth", 100),
    ]).map((s) => s.color);
    expect(new Set(nat).size).toBe(2);
    for (const c of nat) expect(c).not.toMatch(/--chart-[12]\b/);
  });
});

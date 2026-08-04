/**
 * "dame los GASTOS de supermercado del mes pasado" devolvía transacciones INVENTADAS.
 *
 * La traza mostró que el sobre y el periodo se extraían perfecto ("supermercado", julio 2026) pero
 * el lane era NINGUNO → se iba al LLM, que fabricaba filas. La causa: `esConsultaGasto` aceptaba
 * "movimientos|transacciones|compras" y NO "gastos" — la misma consulta funcionaba o no según el
 * sustantivo que eligiera el usuario.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const SOBRES = [
  { id: "cat-super", sobre: "Supermercado", frasco: "Alimentación" },
  { id: "cat-rest", sobre: "Restaurantes", frasco: "Alimentación" },
];
const NOMBRES: Record<string, string> = {
  "cat-super": "Supermercado",
  "cat-rest": "Restaurantes",
};

/** Gastos REALES de super en julio (los del caso) + uno de otro sobre que NO debe salir. */
const TXNS = [
  { id: "s1", kind: "gasto", amount: 45_300, currency: "CRC", occurredOn: "2026-07-05", merchantOrSource: "WALMART", description: null, categoryId: "cat-super" },
  { id: "s2", kind: "gasto", amount: 18_750, currency: "CRC", occurredOn: "2026-07-12", merchantOrSource: "MAXIPALI", description: null, categoryId: "cat-super" },
  { id: "s3", kind: "gasto", amount: 32_400, currency: "CRC", occurredOn: "2026-07-19", merchantOrSource: "KETOTICO", description: null, categoryId: "cat-super" },
  { id: "s4", kind: "gasto", amount: 9_900, currency: "CRC", occurredOn: "2026-07-26", merchantOrSource: "AUTO MERCADO", description: null, categoryId: "cat-super" },
  { id: "r1", kind: "gasto", amount: 12_000, currency: "CRC", occurredOn: "2026-07-11", merchantOrSource: "STARBUCKS", description: null, categoryId: "cat-rest" },
];

const listSobres = vi.fn(async () => SOBRES);
vi.mock("@/modules/financial-base", () => ({
  listTransactions: async () => TXNS,
  getCategoryNameMap: async () => NOMBRES,
  listAllSobresForKind: () => listSobres(),
  listSobresForKind: () => {
    throw new Error("consulta histórica: debe usar listAllSobresForKind");
  },
}));
vi.mock("@/lib/time/user-time", () => ({ userToday: async () => "2026-08-04" }));
vi.mock("@/lib/market-data/fx-rates", () => ({ getFxRates: async () => ({ USD: 1, CRC: 500 }) }));

import { matchIntent } from "@/lib/ai/router";
import { consultarTransacciones } from "@/lib/ai/transactions-query-service";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";

/** Rutea la frase y ejecuta el carril, como hace la ruta. */
const desdeFrase = async (frase: string, moneda = "CRC") => {
  const m = matchIntent(frase);
  expect(m?.intent, `«${frase}» NO ruteó al carril determinista (se iría al LLM)`).toBe(
    "consulta_transacciones",
  );
  return consultarTransacciones(m!.params, moneda);
};

beforeEach(() => listSobres.mockClear());

describe("«gastos de {sobre} del {periodo}» va al carril determinista", () => {
  it("REGRESIÓN: «dame los GASTOS de supermercado del mes pasado» ya no se va al LLM", () => {
    const m = matchIntent("dame los gastos de supermercado del mes pasado");
    expect(m?.intent).toBe("consulta_transacciones");
    expect(m?.params.sobre).toBe("supermercado");
    expect(m?.params.periodo).toBe("mes_pasado");
  });

  it("el sustantivo ya no cambia el resultado", () => {
    for (const n of ["gastos", "transacciones", "movimientos", "compras", "consumos"]) {
      const m = matchIntent(`dame los ${n} de supermercado del mes pasado`);
      expect(m?.intent, n).toBe("consulta_transacciones");
      expect(m?.params.sobre, n).toBe("supermercado");
    }
  });
});

describe("trae las transacciones REALES, todas, con el total de todas", () => {
  it("las cuatro de super de julio y ninguna de otro sobre", async () => {
    const r = await desdeFrase("dame los gastos de supermercado del mes pasado");
    expect(r.conteo).toBe(4);
    for (const comercio of ["WALMART", "MAXIPALI", "KETOTICO", "AUTO MERCADO"]) {
      expect(r.resumen_md, comercio).toContain(comercio);
    }
    expect(r.resumen_md).not.toContain("STARBUCKS"); // es de Restaurantes
  });

  it("muestra TODAS las filas, sin topar", async () => {
    const r = await desdeFrase("dame los gastos de supermercado del mes pasado");
    expect(r.movimientos).toHaveLength(4);
    expect(r.resumen_md).not.toContain("Se muestran");
  });

  it("el total es la suma de las CUATRO", async () => {
    // 45.300 + 18.750 + 32.400 + 9.900 = 106.350
    const r = await desdeFrase("dame los gastos de supermercado del mes pasado");
    expect(r.resumen_md).toContain("₡106.350");
    expect(r.resumen_md).toMatch(/\|\s*\*\*Total\*\*\s*\|\s*\|\s*\*\*₡106\.350\*\*/);
  });

  it("el periodo resuelto es JULIO, no una ventana arbitraria", async () => {
    const r = await desdeFrase("dame los gastos de supermercado del mes pasado");
    expect(r.rango).toMatchObject({ from: "2026-07-01", to: "2026-07-31", etiqueta: "julio 2026" });
  });

  it("el sobre se confirma en la respuesta con su ruta real", async () => {
    const r = await desdeFrase("dame los gastos de supermercado del mes pasado");
    expect(r.filtros.sobre).toBe("Alimentación › Supermercado");
  });
});

describe("guardrail: el LLM no puede inventar movimientos ni totales", () => {
  const prompt = buildSystemPrompt({ currency: "CRC" });

  it("le prohíbe enumerar transacciones de su cabeza", () => {
    expect(prompt).toMatch(/NUNCA enumeres transacciones de tu cabeza/i);
    expect(prompt).toMatch(/EXCLUSIVAMENTE de `consultar_transacciones`/i);
  });

  it("le prohíbe calcular totales por su cuenta", () => {
    expect(prompt).toMatch(/NUNCA calcules un TOTAL/i);
  });

  it("le da la salida explícita cuando no tiene datos", () => {
    expect(prompt).toMatch(/dejame consultarlo/i);
    expect(prompt).toMatch(/peor que no responder/i);
  });

  it("le prohíbe completar con ejemplos plausibles", () => {
    expect(prompt).toMatch(/NO se reconstruyen de memoria/i);
    expect(prompt).toMatch(/devolvió 3 filas, mostrás 3 filas/i);
  });
});

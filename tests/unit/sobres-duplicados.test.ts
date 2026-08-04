/**
 * DOS SOBRES CASI IDÉNTICOS ("Supermercado" y "Supermercados").
 *
 * Antes: `matchSobre` devolvía "ambiguo" y preguntaba cuál — una pregunta sin respuesta buena,
 * porque los dos nombres significan lo mismo. Y al contestar "los dos" no había soporte
 * (`SobreMatch` no tenía ese estado), así que la consulta se perdía y terminaba diciendo "no tenés
 * movimientos" sobre datos que SÍ existen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const SOBRES = [
  { id: "sup-1", sobre: "Supermercado", frasco: "Alimentación" },
  { id: "sup-2", sobre: "Supermercados", frasco: "Alimentación" },
  { id: "rest", sobre: "Restaurantes", frasco: "Alimentación" },
  // Existe pero sin movimientos: separa "el sobre no existe" de "no tuvo movimientos".
  { id: "farm", sobre: "Farmacia", frasco: "Salud" },
];
const NOMBRES: Record<string, string> = {
  "sup-1": "Supermercado",
  "sup-2": "Supermercados",
  rest: "Restaurantes",
  farm: "Farmacia",
};

const TXNS = [
  { id: "a", kind: "gasto", amount: 45_300, currency: "CRC", occurredOn: "2026-07-05", merchantOrSource: "WALMART", description: null, categoryId: "sup-1" },
  { id: "b", kind: "gasto", amount: 18_750, currency: "CRC", occurredOn: "2026-07-12", merchantOrSource: "MAXIPALI", description: null, categoryId: "sup-1" },
  { id: "c", kind: "gasto", amount: 32_400, currency: "CRC", occurredOn: "2026-07-19", merchantOrSource: "KETOTICO", description: null, categoryId: "sup-2" },
  { id: "d", kind: "gasto", amount: 12_000, currency: "CRC", occurredOn: "2026-07-11", merchantOrSource: "STARBUCKS", description: null, categoryId: "rest" },
];

vi.mock("@/modules/financial-base", () => ({
  listTransactions: async () => TXNS,
  getCategoryNameMap: async () => NOMBRES,
  listAllSobresForKind: async () => SOBRES,
  listSobresForKind: () => {
    throw new Error("consulta histórica: debe usar listAllSobresForKind");
  },
}));
vi.mock("@/lib/time/user-time", () => ({ userToday: async () => "2026-08-04" }));
vi.mock("@/lib/market-data/fx-rates", () => ({ getFxRates: async () => ({ USD: 1, CRC: 500 }) }));

import { matchSobre, pareceTodosLosCandidatos } from "@/lib/ai/sobre-match";
import { matchIntent } from "@/lib/ai/router";
import { consultarTransacciones } from "@/lib/ai/transactions-query-service";

const consultar = (extra: Record<string, unknown> = {}) =>
  consultarTransacciones(
    { periodo: "mes_pasado", tipo: "gasto", sobre: "supermercado", agrupacion: "ninguna", tope: 300, ...extra },
    "CRC",
  );

beforeEach(() => vi.clearAllMocks());

describe("matchSobre · misma raíz = el mismo concepto, no una ambigüedad", () => {
  it("«Supermercado» y «Supermercados» → estado «varios», no «ambiguo»", () => {
    const m = matchSobre("supermercado", SOBRES);
    expect(m.estado).toBe("varios");
    if (m.estado === "varios") expect(m.sobres.map((s) => s.id)).toEqual(["sup-1", "sup-2"]);
  });

  it("nombres que significan cosas DISTINTAS siguen siendo ambiguos", () => {
    const m = matchSobre("seguro", [
      { id: "a", sobre: "Seguro auto", frasco: null },
      { id: "b", sobre: "Seguro casa", frasco: null },
    ]);
    expect(m.estado).toBe("ambiguo");
  });

  it("un solo candidato sigue resolviendo", () => {
    expect(matchSobre("restaurantes", SOBRES).estado).toBe("resuelto");
  });
});

describe("la consulta trae los movimientos de AMBOS sobres", () => {
  it("los tres movimientos, de los dos sobres, sin preguntar", async () => {
    const r = await consultar();
    expect(r.conteo).toBe(3);
    for (const c of ["WALMART", "MAXIPALI", "KETOTICO"]) expect(r.resumen_md, c).toContain(c);
    expect(r.resumen_md).not.toContain("STARBUCKS"); // Restaurantes queda fuera
    expect(r.resumen_md).not.toMatch(/¿Cuál querés ver\?/);
  });

  it("avisa que hay dos sobres parecidos", async () => {
    const r = await consultar();
    expect(r.resumen_md).toMatch(/2 sobres con el mismo nombre/i);
    expect(r.resumen_md).toContain("Supermercado y Supermercados");
  });

  it("el total es de TODAS las filas de los dos", async () => {
    // 45.300 + 18.750 + 32.400 = 96.450
    const r = await consultar();
    expect(r.resumen_md).toContain("₡96.450");
  });

  it("desglosa el subtotal POR SOBRE (para poder decidir si unificarlos)", async () => {
    const r = await consultar();
    expect(r.resumen_md).toMatch(/Por sobre:/);
    expect(r.resumen_md).toMatch(/Supermercado: ₡64\.050 \(2\)/); // 45.300 + 18.750
    expect(r.resumen_md).toMatch(/Supermercados: ₡32\.400 \(1\)/);
  });

  it("la etiqueta del filtro nombra los dos", async () => {
    const r = await consultar();
    expect(r.filtros.sobre).toBe("Alimentación › Supermercado + Alimentación › Supermercados");
  });
});

describe("«los dos» tras una ambigüedad real", () => {
  it("pareceTodosLosCandidatos reconoce la respuesta corta", () => {
    for (const f of ["los dos", "ambos", "dame los dos", "todos", "las dos", "sí, ambas"]) {
      expect(pareceTodosLosCandidatos(f), f).toBe(true);
    }
  });

  it("REGRESIÓN: no secuestra una consulta que MENCIONA «todos»", () => {
    // Los dos casos que rompió la suite: "todos"/"todas" aparece en muchas consultas legítimas.
    for (const f of [
      "mostrame todas mis compras de VOO",
      "vender todos los altcoins a 90% de su ATH",
      "dame todas las transacciones de restaurantes del mes pasado",
    ]) {
      expect(pareceTodosLosCandidatos(f), f).toBe(false);
    }
  });

  it("rutea a su carril", () => {
    expect(matchIntent("los dos")?.intent).toBe("consulta_transacciones_varios");
    expect(matchIntent("mostrame todas mis compras de VOO")?.intent).not.toBe(
      "consulta_transacciones_varios",
    );
  });

  it("con incluirTodos, un ambiguo REAL devuelve los dos en vez de preguntar", async () => {
    const r = await consultarTransacciones(
      { periodo: "mes_pasado", tipo: "gasto", sobre: "supermercado", incluirTodos: true, tope: 300 },
      "CRC",
    );
    expect(r.conteo).toBe(3);
    expect(r.resumen_md).not.toMatch(/¿Cuál querés ver\?/);
  });
});

describe("nunca afirma «no tenés movimientos» si el filtro no resolvió", () => {
  it("un sobre inexistente dice que NO SE ENCONTRÓ EL SOBRE, no que no hay datos", async () => {
    const r = await consultarTransacciones(
      { periodo: "mes_pasado", tipo: "gasto", sobre: "criptomonedas" },
      "CRC",
    );
    expect(r.resumen_md).toMatch(/No encontré un sobre/i);
    expect(r.resumen_md).not.toMatch(/No tenés gastos/i);
  });

  it("un sobre que EXISTE pero sin movimientos sí lo dice, con su nombre real", async () => {
    const r = await consultarTransacciones(
      { periodo: "mes_pasado", tipo: "gasto", sobre: "farmacia" },
      "CRC",
    );
    expect(r.conteo).toBe(0);
    // Distinto del anterior: acá el sobre SÍ se resolvió, así que afirmar sobre los datos es
    // correcto y se lo nombra por su ruta real.
    expect(r.resumen_md).toMatch(/No tenés gastos.*Farmacia/i);
    expect(r.resumen_md).not.toMatch(/No encontré un sobre/i);
  });
});

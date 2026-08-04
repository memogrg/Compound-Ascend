/**
 * Cuatro arreglos que salieron de una misma sesión real:
 *  1. el TOTAL se calculaba sobre las filas MOSTRADAS, no sobre todas las que matchean;
 *  2. la lista topaba en 10 al preguntar por un sobre;
 *  3. "en total" caía en una ventana silenciosa de 180 días;
 *  4. el mismo movimiento repetido en el pegado se registraba dos veces.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  agregarTransacciones,
  renderConsulta,
  resolverRango,
  type TxnLike,
} from "@/lib/ai/transactions-query";
import { matchIntent, pideTodoElHistorial } from "@/lib/ai/router";
import { dedupeFilas, conciliar } from "@/lib/ai/statement-reconcile";
import { parseStatement } from "@/lib/ai/statement-parse";

/** 23 gastos en colones, como los 23 de restaurantes del caso real. */
const TXNS: TxnLike[] = Array.from({ length: 23 }, (_, i) => ({
  id: `t${i}`,
  kind: "gasto",
  amount: 1000,
  currency: "CRC",
  occurredOn: `2026-07-${String((i % 28) + 1).padStart(2, "0")}`,
  merchantOrSource: `Comercio ${i}`,
  description: null,
  categoryId: "cat-rest",
}));

const RANGO = { from: "2026-07-01", to: "2026-07-31", etiqueta: "julio 2026" };

describe("1 · el TOTAL es de TODAS las filas, no de las mostradas", () => {
  it("con tope 10 sobre 23 filas, el total sigue siendo el de las 23", () => {
    const r = agregarTransacciones(TXNS, {
      rango: RANGO,
      tipo: "gasto",
      agrupacion: "ninguna",
      tope: 10,
      moneda: "CRC",
      rates: { CRC: 500, USD: 1 },
    });
    expect(r.conteo).toBe(23);
    expect(r.movimientos).toHaveLength(10);
    const md = renderConsulta(r);
    // 23 × 1.000 = 23.000 — NO 10.000, que sería el de las mostradas.
    expect(md).toContain("₡23.000");
    expect(md).not.toContain("₡10.000");
  });

  it("el aviso de recorte dice que el total es de TODOS", () => {
    const r = agregarTransacciones(TXNS, {
      rango: RANGO,
      tipo: "gasto",
      agrupacion: "ninguna",
      tope: 10,
      moneda: "CRC",
      rates: null,
    });
    const md = renderConsulta(r);
    expect(md).toContain("el total es de los 23");
    // La frase vieja decía lo contrario y era el bug.
    expect(md).not.toContain("el total de arriba es el de los mostrados");
  });

  it("con dos monedas, el subtotal por moneda también es de todas", () => {
    const mixto: TxnLike[] = [
      ...TXNS,
      { id: "u1", kind: "gasto", amount: 9, currency: "USD", occurredOn: "2026-07-05", merchantOrSource: "Amazon", description: null, categoryId: "cat-rest" },
    ];
    const r = agregarTransacciones(mixto, {
      rango: RANGO,
      tipo: "gasto",
      agrupacion: "ninguna",
      tope: 5,
      moneda: "CRC",
      rates: { CRC: 500, USD: 1 },
    });
    const md = renderConsulta(r);
    expect(md).toContain("₡23.000");
    expect(md).toContain("$9");
  });
});

describe("2 · preguntar por un sobre trae TODAS las filas", () => {
  it("«cuánto gasté en restaurantes» ya no topa en 10", () => {
    const p = matchIntent("cuánto gasté en restaurantes en total")?.params ?? {};
    expect(p.tope).toBe(300);
  });

  it("«dame las transacciones de restaurantes del mes pasado» tampoco", () => {
    const p = matchIntent("dame las transacciones de restaurantes del mes pasado")?.params ?? {};
    expect(p.tope).toBe(300);
  });
});

describe("3 · «en total» es todo el historial, no 180 días", () => {
  it("pideTodoElHistorial reconoce las formas", () => {
    for (const f of ["cuánto gasté en restaurantes en total", "cuánto llevo acumulado", "histórico"]) {
      expect(pideTodoElHistorial(f), f).toBe(true);
    }
    expect(pideTodoElHistorial("cuánto gasté en restaurantes el mes pasado")).toBe(false);
  });

  it("la consulta rutea con periodo «todo», no con la ventana silenciosa", () => {
    const p = matchIntent("cuánto gasté en restaurantes en total")?.params ?? {};
    expect(p.periodo).toBe("todo");
    expect(p.periodo).not.toBe("ultimos_180_dias");
  });

  it("un periodo EXPLÍCITO sigue mandando sobre «en total»", () => {
    const p = matchIntent("cuánto gasté en restaurantes en total el mes pasado")?.params ?? {};
    expect(p.periodo).toBe("mes_pasado");
  });

  it("resolverRango('todo') cubre el historial y lo ETIQUETA", () => {
    const r = resolverRango("todo", "2026-08-04");
    expect(r.from).toBe("2000-01-01");
    expect(r.to).toBe("2026-08-04");
    expect(r.etiqueta).toBe("todo tu historial");
  });
});

describe("4 · el mismo movimiento repetido en el pegado no se registra dos veces", () => {
  // El caso REAL: el pegado traía POPS en formato limpio Y en formato sucio (fecha de posteo +
  // ruido del banco). Dos filas correctas del mismo consumo → la segunda salía "falta" y se
  // registraba, duplicando un POPS de ₡4.100.
  const PEGADO = `226316	2026-07-25	POPS LAGUNILLA HEREDIA	4,100.00	COL	D
2026-07-17	SUBWAY LAGUNILLA	3,900.00	COL	D`;

  const POPS_LIMPIO = parseStatement(PEGADO).filas[0]!;
  // La misma compra, como la deja el extractor desde la fila sucia: limpia la ubicación.
  const POPS_SUCIO = { ...POPS_LIMPIO, ref: null, comercio: "POPS LAGUNILLA" };

  it("colapsa las dos grafías del mismo comercio en el mismo día y monto", () => {
    const { filas, colapsadas } = dedupeFilas([POPS_LIMPIO, POPS_SUCIO]);
    expect(filas).toHaveLength(1);
    expect(colapsadas).toHaveLength(1);
    // Se queda la grafía más larga: tiene más señal para conciliar.
    expect(filas[0]?.comercio).toBe("POPS LAGUNILLA HEREDIA");
  });

  it("y así NO se re-registra lo que ya estaba", () => {
    const registrada = {
      id: "ya-existe",
      amount: 4100,
      currency: "CRC",
      occurredOn: "2026-07-25",
      merchantOrSource: "POPS LAGUNILLA HEREDIA",
      description: null,
      kind: "gasto",
    };
    // Sin dedupe: la segunda fila queda sin candidato (el registro ya se consumió) → "falta".
    const sin = conciliar([POPS_LIMPIO, POPS_SUCIO], [registrada]);
    expect(sin.faltantes).toBe(1); // ← el bug

    // Con dedupe: una sola fila, emparejada. Nada que registrar.
    const { filas } = dedupeFilas([POPS_LIMPIO, POPS_SUCIO]);
    const con = conciliar(filas, [registrada]);
    expect(con.faltantes).toBe(0);
    expect(con.registradas).toBe(1);
  });

  it("NO colapsa dos consumos REALES: misma grafía exacta = dos compras", () => {
    // El caso Namore: dos cafés el mismo día por el mismo monto existen de verdad.
    const { filas, colapsadas } = dedupeFilas([POPS_LIMPIO, { ...POPS_LIMPIO }]);
    expect(filas).toHaveLength(2);
    expect(colapsadas).toHaveLength(0);
  });

  it("NO colapsa el mismo comercio en FECHAS distintas", () => {
    const otroDia = { ...POPS_SUCIO, fecha: "2026-07-26" };
    expect(dedupeFilas([POPS_LIMPIO, otroDia]).filas).toHaveLength(2);
  });

  it("NO colapsa el mismo comercio con MONTOS distintos", () => {
    const otroMonto = { ...POPS_SUCIO, monto: 5000 };
    expect(dedupeFilas([POPS_LIMPIO, otroMonto]).filas).toHaveLength(2);
  });
});

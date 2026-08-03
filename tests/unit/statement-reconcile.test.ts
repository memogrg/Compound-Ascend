/**
 * Conciliación estado ↔ registrado. Los dos errores posibles son caros en direcciones opuestas:
 * un falso "registrada" deja un gasto sin anotar; un falso "faltante" lo registra dos veces.
 */
import { describe, it, expect } from "vitest";
import { conciliar, rangoDeFilas, diasEntre } from "@/lib/ai/statement-reconcile";
import type { RegistradaLike } from "@/lib/ai/statement-reconcile";
import type { StatementRow } from "@/lib/ai/statement-parse";

const fila = (o: Partial<StatementRow> = {}): StatementRow => ({
  ref: null,
  fecha: "2026-07-17",
  comercio: "SUBWAY LAGUNILLA",
  monto: 3900,
  moneda: "CRC",
  tipo: "gasto",
  ...o,
});

const txn = (o: Partial<RegistradaLike> = {}): RegistradaLike => ({
  id: "t1",
  amount: 3900,
  currency: "CRC",
  occurredOn: "2026-07-17",
  merchantOrSource: "Subway",
  description: null,
  kind: "gasto",
  ...o,
});

describe("diasEntre", () => {
  it("cuenta días sin corrimiento por zona", () => {
    expect(diasEntre("2026-07-17", "2026-07-20")).toBe(3);
    expect(diasEntre("2026-07-20", "2026-07-17")).toBe(3);
    expect(diasEntre("2026-07-17", "2026-07-17")).toBe(0);
    expect(diasEntre("2026-01-01", "2025-12-31")).toBe(1);
  });
});

describe("match básico", () => {
  it("mismo monto, moneda y fecha → registrada", () => {
    const r = conciliar([fila()], [txn()]);
    expect(r.registradas).toBe(1);
    expect(r.filas[0]?.estado).toBe("registrada");
    expect(r.filas[0]?.matchId).toBe("t1");
  });

  it("nada parecido → faltante", () => {
    expect(conciliar([fila()], []).faltantes).toBe(1);
    expect(conciliar([fila()], [txn({ amount: 9999 })]).faltantes).toBe(1);
  });

  it("la fecha tolera unos días (el banco postea después)", () => {
    expect(conciliar([fila()], [txn({ occurredOn: "2026-07-19" })]).registradas).toBe(1);
    expect(conciliar([fila()], [txn({ occurredOn: "2026-07-25" })]).faltantes).toBe(1);
  });

  it("centavos de redondeo no rompen el match; una diferencia real sí", () => {
    expect(conciliar([fila()], [txn({ amount: 3900.01 })]).registradas).toBe(1);
    expect(conciliar([fila()], [txn({ amount: 3910 })]).faltantes).toBe(1);
  });

  it("distinta MONEDA nunca matchea (₡3.900 no es $3.900)", () => {
    expect(conciliar([fila()], [txn({ currency: "USD" })]).faltantes).toBe(1);
  });

  it("un gasto no matchea contra un ingreso", () => {
    expect(conciliar([fila({ tipo: "gasto" })], [txn({ kind: "ingreso" })]).faltantes).toBe(1);
  });
});

describe("el comercio es CONFIANZA, no condición", () => {
  it('el banco escribe distinto y aun así matchea ("SUBWAY LAGUNILLA" vs "Subway")', () => {
    const r = conciliar([fila()], [txn({ merchantOrSource: "Subway" })]);
    expect(r.filas[0]?.estado).toBe("registrada");
    expect(r.filas[0]?.comercioCoincide).toBe(true);
  });

  it("sin parecido en el nombre igual matchea, pero se marca la menor confianza", () => {
    const r = conciliar([fila()], [txn({ merchantOrSource: "Compra tarjeta" })]);
    expect(r.filas[0]?.estado).toBe("registrada");
    expect(r.filas[0]?.comercioCoincide).toBe(false);
  });

  it("compara por PALABRA: POPS no se confunde con POPSICLE FACTORY", () => {
    const r = conciliar(
      [fila({ comercio: "POPS", monto: 1500 })],
      [txn({ amount: 1500, merchantOrSource: "Popsicle Factory" })],
    );
    expect(r.filas[0]?.comercioCoincide).toBe(false);
  });
});

describe("duplicados legítimos", () => {
  it("dos cargos idénticos en días distintos con UN solo registro: uno queda faltante", () => {
    const r = conciliar(
      [fila({ fecha: "2026-07-17" }), fila({ fecha: "2026-07-24" })],
      [txn({ occurredOn: "2026-07-17" })],
    );
    expect(r.registradas).toBe(1);
    expect(r.faltantes).toBe(1);
    expect(r.filas[0]?.estado).toBe("registrada"); // el más cercano se lo queda
    expect(r.filas[1]?.estado).toBe("faltante");
  });

  it("dos cargos idénticos con DOS registros: cada uno se queda con el suyo", () => {
    const r = conciliar(
      [fila({ fecha: "2026-07-17" }), fila({ fecha: "2026-07-18" })],
      [txn({ id: "a", occurredOn: "2026-07-17" }), txn({ id: "b", occurredOn: "2026-07-18" })],
    );
    expect(r.registradas).toBe(2);
    expect(r.filas[0]?.matchId).toBe("a");
    expect(r.filas[1]?.matchId).toBe("b");
  });

  it("una transacción registrada NO cubre dos filas del estado", () => {
    const r = conciliar([fila(), fila()], [txn()]);
    expect(new Set(r.filas.map((f) => f.matchId)).size).toBe(2); // uno es undefined
    expect(r.registradas).toBe(1);
  });

  it("entre dos candidatos gana el del MISMO comercio, no el más cercano en fecha", () => {
    const r = conciliar(
      [fila({ fecha: "2026-07-17", comercio: "OLIVE GARDEN" })],
      [
        txn({ id: "cerca", occurredOn: "2026-07-17", merchantOrSource: "Otra cosa" }),
        txn({ id: "comercio", occurredOn: "2026-07-19", merchantOrSource: "Olive Garden" }),
      ],
    );
    expect(r.filas[0]?.matchId).toBe("comercio");
  });
});

describe("rangoDeFilas · qué leer de la BD", () => {
  it("cubre de la más vieja a la más nueva, con el margen de tolerancia", () => {
    const r = rangoDeFilas([fila({ fecha: "2026-07-17" }), fila({ fecha: "2026-07-25" })]);
    expect(r).toEqual({ from: "2026-07-14", to: "2026-07-28" });
  });

  it("cruza el fin de mes sin romperse", () => {
    expect(rangoDeFilas([fila({ fecha: "2026-08-01" })])).toEqual({
      from: "2026-07-29",
      to: "2026-08-04",
    });
  });

  it("sin filas no hay rango", () => {
    expect(rangoDeFilas([])).toBeNull();
  });
});

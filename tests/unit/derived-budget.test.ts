import { describe, it, expect } from "vitest";
import {
  diffDerived,
  toMonthly,
  type DesiredLine,
  type ExistingDerived,
} from "@/modules/financial-base/engine/derived-budget";

const line = (over: Partial<DesiredLine> = {}): DesiredLine => ({
  type: "expense",
  name: "Pago — Tarjeta BAC",
  amount: 45000,
  currency: "CRC",
  categoryId: "cat-deudas",
  sourceKind: "debt",
  sourceId: "debt-1",
  ...over,
});

const existing = (over: Partial<ExistingDerived> = {}): ExistingDerived => ({
  id: "row-1",
  type: "expense",
  name: "Pago — Tarjeta BAC",
  amount: 45000,
  currency: "CRC",
  categoryId: "cat-deudas",
  sourceKind: "debt",
  sourceId: "debt-1",
  ...over,
});

describe("plan derivado (Fase 3)", () => {
  it("inserta líneas nuevas y borra las de entidades desaparecidas", () => {
    const d = diffDerived(
      [existing({ id: "old", sourceId: "debt-eliminada" })],
      [line({ sourceId: "debt-nueva" })],
    );
    expect(d.toInsert).toHaveLength(1);
    expect(d.toInsert[0]!.sourceId).toBe("debt-nueva");
    expect(d.toDeleteIds).toEqual(["old"]);
    expect(d.toUpdate).toHaveLength(0);
  });

  it("actualiza cuando cambia el monto (la cuota de la deuda bajó)", () => {
    const d = diffDerived([existing()], [line({ amount: 40000 })]);
    expect(d.toUpdate).toHaveLength(1);
    expect(d.toUpdate[0]!.id).toBe("row-1");
    expect(d.toUpdate[0]!.line.amount).toBe(40000);
    expect(d.toInsert).toHaveLength(0);
    expect(d.toDeleteIds).toHaveLength(0);
  });

  it("no toca nada cuando todo coincide (sync idempotente)", () => {
    const d = diffDerived([existing()], [line()]);
    expect(d.toInsert).toHaveLength(0);
    expect(d.toUpdate).toHaveLength(0);
    expect(d.toDeleteIds).toHaveLength(0);
  });

  it("distingue fuentes por (sourceKind, sourceId)", () => {
    const d = diffDerived(
      [existing()],
      [line(), line({ sourceKind: "goal", sourceId: "goal-1", name: "Aporte — Fondo" })],
    );
    expect(d.toInsert).toHaveLength(1);
    expect(d.toInsert[0]!.sourceKind).toBe("goal");
  });

  it("toMonthly mensualiza frecuencias conocidas y tolera desconocidas", () => {
    expect(toMonthly(120000, "anual")).toBe(10000);
    expect(toMonthly(50000, "mensual")).toBe(50000);
    expect(toMonthly(30000, "trimestral")).toBe(10000);
    // Texto libre desconocido → se asume mensual.
    expect(toMonthly(7000, "cada-luna-llena")).toBe(7000);
    expect(toMonthly(7000, null)).toBe(7000);
  });
});

describe("diffDerived · modo congelado", () => {
  const linea = (sourceId: string, amount: number): DesiredLine => ({
    type: "expense",
    name: `Pago — ${sourceId}`,
    amount,
    currency: "CRC",
    categoryId: "cat-deudas",
    sourceKind: "debt",
    sourceId,
  });
  const existente = (id: string, sourceId: string, amount: number): ExistingDerived => ({
    id,
    type: "expense",
    name: `Pago — ${sourceId}`,
    amount,
    currency: "CRC",
    categoryId: "cat-deudas",
    sourceKind: "debt",
    sourceId,
  });

  it("un monto que cambió NO produce update", () => {
    // Sobre un mes cerrado, actualizar reescribe la historia en vez de fijarla: bajar una cuota
    // hoy cambiaría lo que se presupuestó hace cuatro meses.
    const d = diffDerived([existente("b1", "deuda-1", 312_180)], [linea("deuda-1", 280_000)], {
      congelado: true,
    });
    expect(d.toUpdate).toEqual([]);
    expect(d.toInsert).toEqual([]);
    expect(d.toDeleteIds).toEqual([]);
  });

  it("una entidad que desapareció NO produce delete", () => {
    // Saldar una deuda borraría la línea que PRUEBA que ese mes se presupuestó.
    const d = diffDerived([existente("b1", "deuda-1", 312_180)], [], { congelado: true });
    expect(d.toDeleteIds).toEqual([]);
    expect(d.toInsert).toEqual([]);
  });

  it("un periodo que YA tiene derivadas no recibe nada", () => {
    // Idempotencia del cron ante reintentos: si el mes ya se materializó, no se toca más. Se
    // mira si hay ALGUNA derivada, no si falta esta: un mes a medio materializar sería peor.
    const d = diffDerived([existente("b1", "otra-deuda", 90_000)], [linea("deuda-1", 312_180)], {
      congelado: true,
    });
    expect(d.toInsert).toEqual([]);
  });

  it("un periodo VACÍO sí recibe sus líneas", () => {
    const d = diffDerived([], [linea("deuda-1", 312_180), linea("deuda-2", 92_500)], {
      congelado: true,
    });
    expect(d.toInsert.map((l) => l.sourceId)).toEqual(["deuda-1", "deuda-2"]);
    expect(d.toUpdate).toEqual([]);
    expect(d.toDeleteIds).toEqual([]);
  });

  it("sin el flag, nada cambia", () => {
    // El caso que protege lo que ya funciona: el mes en curso se sigue reconciliando.
    const d = diffDerived([existente("b1", "deuda-1", 312_180)], [linea("deuda-1", 280_000)]);
    expect(d.toUpdate).toHaveLength(1);
    expect(d.toUpdate[0]!.id).toBe("b1");
    const e = diffDerived([existente("b1", "deuda-1", 312_180)], []);
    expect(e.toDeleteIds).toEqual(["b1"]);
  });
});

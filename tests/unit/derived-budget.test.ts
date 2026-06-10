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

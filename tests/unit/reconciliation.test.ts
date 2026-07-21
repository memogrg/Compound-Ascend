import { describe, it, expect } from "vitest";
import {
  findUnlinkedCandidates,
  buildEntityAlerts,
} from "@/modules/financial-base/engine/reconciliation";
import type { Transaction, BudgetItem } from "@/modules/financial-base/types";
import type { Category } from "@/modules/financial-base/services/categories-service";
import type { LinkableEntities } from "@/modules/financial-base/services/linkable-entities-service";

const txn = (over: Partial<Transaction> = {}): Transaction => ({
  id: "t1",
  kind: "gasto",
  description: null,
  merchantOrSource: "BAC",
  amount: 45000,
  currency: "CRC",
  occurredOn: "2026-06-08",
  categoryId: "cat-deudas",
  accountId: null,
  accountLabel: null,
  status: "confirmed",
  origin: "manual",
  receiptUrl: null,
  confirmedByUser: true,
  linkedKind: "none",
  linkedId: null,
  recurringItemId: null,
  ...over,
});

const cat = (over: Partial<Category> = {}): Category => ({
  id: "cat-deudas",
  key: "deudas",
  name: "Deudas",
  defaultNature: null,
  parentId: null,
  icon: null,
  color: null,
  isFavorite: false,
  isEssential: false,
  isActive: true,
  isSystem: true,
  categoryType: "expense",
  sortOrder: 0,
  linkedKind: "debt",
  ...over,
});

const LINKABLES: LinkableEntities = {
  debt: [{ id: "d1", name: "Tarjeta BAC", kind: "debt" }],
  goal: [],
  holding: [],
  policy: [],
  rental: [],
};

const budgetItem = (over: Partial<BudgetItem> = {}): BudgetItem => ({
  id: "b1",
  type: "expense",
  categoryId: null,
  name: "Pago — Tarjeta BAC",
  amount: 45000,
  currency: "CRC",
  frequency: "mensual",
  periodMonth: 6,
  periodYear: 2026,
  sourceKind: "debt",
  sourceId: "d1",
  ...over,
});

describe("sin vincular (Fase 6)", () => {
  it("detecta transacciones cuya categoría sugiere entidad y no tienen vínculo", () => {
    const out = findUnlinkedCandidates([txn()], [cat()], LINKABLES);
    expect(out).toHaveLength(1);
    expect(out[0]!.suggestedKind).toBe("debt");
  });

  it("ignora las ya vinculadas, sin categoría sugerente o sin entidades", () => {
    expect(findUnlinkedCandidates([txn({ linkedKind: "debt", linkedId: "d1" })], [cat()], LINKABLES)).toHaveLength(0);
    expect(findUnlinkedCandidates([txn()], [cat({ linkedKind: null })], LINKABLES)).toHaveLength(0);
    expect(
      findUnlinkedCandidates([txn()], [cat()], { ...LINKABLES, debt: [] }),
    ).toHaveLength(0);
  });
});

// FX por-USD (igual que getFxRates): USD=1, CRC=455 ⇒ 1 USD = 455 CRC.
// convertCurrency con from===to es identidad: los casos mono-moneda no cambian.
const FX = { USD: 1, CRC: 455 };

describe("alertas plan-vs-real por entidad (Fase 6)", () => {
  it("cumplido cuando lo real ≈ lo planeado", () => {
    const alerts = buildEntityAlerts(
      [budgetItem()],
      [txn({ linkedKind: "debt", linkedId: "d1", amount: 45000 })],
      "CRC",
      FX,
    );
    expect(alerts[0]!.status).toBe("cumplido");
    expect(alerts[0]!.real).toBe(45000);
  });

  it("sin_movimiento, parcial y excedido según el avance", () => {
    expect(buildEntityAlerts([budgetItem()], [], "CRC", FX)[0]!.status).toBe("sin_movimiento");
    expect(
      buildEntityAlerts([budgetItem()], [txn({ linkedKind: "debt", linkedId: "d1", amount: 20000 })], "CRC", FX)[0]!
        .status,
    ).toBe("parcial");
    expect(
      buildEntityAlerts([budgetItem()], [txn({ linkedKind: "debt", linkedId: "d1", amount: 90000 })], "CRC", FX)[0]!
        .status,
    ).toBe("excedido");
  });

  it("ignora líneas manuales y ordena lo problemático primero", () => {
    const alerts = buildEntityAlerts(
      [
        budgetItem({ id: "b-manual", sourceKind: "manual", sourceId: null }),
        budgetItem({ id: "b-goal", sourceKind: "goal", sourceId: "g1", name: "Aporte — Fondo" }),
        budgetItem(),
      ],
      [txn({ linkedKind: "debt", linkedId: "d1", amount: 90000 })],
      "CRC",
      FX,
    );
    expect(alerts).toHaveLength(2);
    expect(alerts[0]!.status).toBe("excedido");
    expect(alerts[1]!.status).toBe("sin_movimiento");
  });

  it("plan de ingresos (dividendos) se compara contra ingresos vinculados", () => {
    const alerts = buildEntityAlerts(
      [budgetItem({ type: "income", sourceKind: "dividend", sourceId: "h1", name: "Dividendos — VOO", amount: 100 })],
      [txn({ kind: "ingreso", linkedKind: "holding", linkedId: "h1", amount: 100 })],
      "CRC",
      FX,
    );
    expect(alerts[0]!.status).toBe("cumplido");
  });

  it("normaliza moneda: transacciones en USD vs línea en CRC se comparan en display (CRC)", () => {
    // Plan: 45 000 CRC. Real: 100 USD = 45 500 CRC → ratio ≈ 1.01 → cumplido.
    const alerts = buildEntityAlerts(
      [budgetItem({ amount: 45000, currency: "CRC" })],
      [txn({ linkedKind: "debt", linkedId: "d1", amount: 100, currency: "USD" })],
      "CRC",
      FX,
    );
    expect(alerts[0]!.real).toBe(45500); // convertido, NO la suma cruda (100)
    expect(alerts[0]!.planned).toBe(45000);
    expect(alerts[0]!.currency).toBe("CRC");
    expect(alerts[0]!.status).toBe("cumplido");
    // Sin normalizar, real=100 vs planned=45000 habría dado "parcial" (el bug).
    expect(alerts[0]!.status).not.toBe("parcial");
  });
});

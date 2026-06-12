import { describe, it, expect } from "vitest";
import type { z } from "zod";
import {
  holdingInputSchema,
  dividendInputSchema,
  rentalPaymentInputSchema,
} from "@/modules/wealth/schemas";
import {
  txnInputSchema,
  budgetItemInputSchema,
  categoryInputSchema,
} from "@/modules/financial-base/schemas";

const UUID = "9b2f8a1e-5c34-4d6f-8a2b-1c3d5e7f9a0b";
const OTHER_UUID = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

/** Verifica que safeParse falla y que algún issue apunta al path esperado. */
function expectFailAt(
  schema: z.ZodTypeAny,
  input: unknown,
  path: (string | number)[],
): void {
  const r = schema.safeParse(input);
  expect(r.success).toBe(false);
  if (!r.success) {
    const paths = r.error.issues.map((i) => i.path);
    expect(paths).toContainEqual(path);
  }
}

// ── Wealth: holdingInputSchema ────────────────────────────────────

describe("holdingInputSchema", () => {
  const valid = {
    symbol: "voo",
    assetType: "etf",
    quantity: 2.5,
    averageCost: 100,
    currency: "USD",
  };

  it("caso válido parsea y normaliza el símbolo a mayúsculas", () => {
    const r = holdingInputSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.symbol).toBe("VOO");
      expect(r.data.quantity).toBe(2.5);
      expect(r.data.investmentId).toBeUndefined();
    }
  });

  it("rechaza cantidad 0 o negativa", () => {
    expectFailAt(holdingInputSchema, { ...valid, quantity: 0 }, ["quantity"]);
    expectFailAt(holdingInputSchema, { ...valid, quantity: -1 }, ["quantity"]);
  });

  it("rechaza costo promedio negativo", () => {
    expectFailAt(holdingInputSchema, { ...valid, averageCost: -50 }, ["averageCost"]);
  });

  it("rechaza assetType fuera del enum", () => {
    expectFailAt(holdingInputSchema, { ...valid, assetType: "casa" }, ["assetType"]);
  });

  it("rechaza investmentId que no es uuid", () => {
    expectFailAt(holdingInputSchema, { ...valid, investmentId: "no-es-uuid" }, ["investmentId"]);
  });

  it("rechaza símbolo vacío o demasiado largo (>12)", () => {
    expectFailAt(holdingInputSchema, { ...valid, symbol: "  " }, ["symbol"]);
    expectFailAt(holdingInputSchema, { ...valid, symbol: "A".repeat(13) }, ["symbol"]);
  });
});

// ── Wealth: dividendInputSchema ───────────────────────────────────

describe("dividendInputSchema", () => {
  const valid = {
    holdingId: UUID,
    paymentDate: "2026-01-15",
    amount: 50,
    currency: "CRC",
  };

  it("caso válido parsea y deja opcionales en undefined", () => {
    const r = dividendInputSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.amount).toBe(50);
      expect(r.data.yieldPct).toBeUndefined();
      expect(r.data.frequency).toBeUndefined();
    }
  });

  it("rechaza monto negativo o cero", () => {
    expectFailAt(dividendInputSchema, { ...valid, amount: -5 }, ["amount"]);
    expectFailAt(dividendInputSchema, { ...valid, amount: 0 }, ["amount"]);
  });

  it("rechaza fecha que no es YYYY-MM-DD", () => {
    expectFailAt(dividendInputSchema, { ...valid, paymentDate: "15/01/2026" }, ["paymentDate"]);
  });

  it("rechaza yieldPct mayor a 100", () => {
    expectFailAt(dividendInputSchema, { ...valid, yieldPct: 150 }, ["yieldPct"]);
  });

  it("rechaza holdingId malformado", () => {
    expectFailAt(dividendInputSchema, { ...valid, holdingId: "123" }, ["holdingId"]);
  });
});

// ── Wealth: rentalPaymentInputSchema ──────────────────────────────

describe("rentalPaymentInputSchema", () => {
  const valid = {
    holdingId: UUID,
    receivedOn: "2026-06-01",
    amount: 800,
    currency: "USD",
    frequency: "mensual",
  };

  it("caso válido parsea conservando la frecuencia", () => {
    const r = rentalPaymentInputSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.frequency).toBe("mensual");
  });

  it("rechaza monto 0", () => {
    expectFailAt(rentalPaymentInputSchema, { ...valid, amount: 0 }, ["amount"]);
  });

  it("rechaza frecuencia fuera del enum", () => {
    expectFailAt(rentalPaymentInputSchema, { ...valid, frequency: "diario" }, ["frequency"]);
  });

  it("rechaza moneda que no tiene 3 letras", () => {
    expectFailAt(rentalPaymentInputSchema, { ...valid, currency: "CR" }, ["currency"]);
  });
});

// ── Financial base: txnInputSchema ────────────────────────────────

describe("txnInputSchema", () => {
  const valid = {
    kind: "gasto",
    amount: 1500,
    occurredOn: "2026-06-01",
  };

  it("caso válido aplica defaults (currency, status, origin)", () => {
    const r = txnInputSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.currency).toBe("CRC");
      expect(r.data.status).toBe("confirmed");
      expect(r.data.origin).toBe("manual");
    }
  });

  it("preprocesa categoryId vacío a null", () => {
    const r = txnInputSchema.safeParse({ ...valid, categoryId: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.categoryId).toBeNull();
  });

  it("rechaza monto 0 o negativo", () => {
    expectFailAt(txnInputSchema, { ...valid, amount: 0 }, ["amount"]);
    expectFailAt(txnInputSchema, { ...valid, amount: -100 }, ["amount"]);
  });

  it("rechaza kind fuera del enum", () => {
    expectFailAt(txnInputSchema, { ...valid, kind: "transferencia" }, ["kind"]);
  });

  it("refine: linkedKind sin linkedId falla en linkedId", () => {
    expectFailAt(txnInputSchema, { ...valid, linkedKind: "debt" }, ["linkedId"]);
  });

  it("acepta linkedKind con linkedId presente", () => {
    const r = txnInputSchema.safeParse({ ...valid, linkedKind: "debt", linkedId: UUID });
    expect(r.success).toBe(true);
  });

  it("rechaza confidence fuera de [0,1]", () => {
    expectFailAt(txnInputSchema, { ...valid, confidence: 2 }, ["confidence"]);
  });
});

// ── Financial base: budgetItemInputSchema ─────────────────────────

describe("budgetItemInputSchema", () => {
  const valid = {
    type: "expense",
    name: "Alquiler",
    amount: 350000,
    currency: "CRC",
    periodMonth: 6,
    periodYear: 2026,
  };

  it("caso válido aplica default de frecuencia mensual", () => {
    const r = budgetItemInputSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.frequency).toBe("mensual");
      expect(r.data.amount).toBe(350000);
    }
  });

  it("rechaza mes fuera de rango (13)", () => {
    expectFailAt(budgetItemInputSchema, { ...valid, periodMonth: 13 }, ["periodMonth"]);
  });

  it("rechaza año fuera de rango (1999)", () => {
    expectFailAt(budgetItemInputSchema, { ...valid, periodYear: 1999 }, ["periodYear"]);
  });

  it("rechaza monto negativo", () => {
    expectFailAt(budgetItemInputSchema, { ...valid, amount: -1 }, ["amount"]);
  });

  it("rechaza nombre vacío (solo espacios)", () => {
    expectFailAt(budgetItemInputSchema, { ...valid, name: "   " }, ["name"]);
  });
});

// ── Financial base: categoryInputSchema ───────────────────────────

describe("categoryInputSchema", () => {
  it("caso válido aplica default categoryType=expense y preprocesa parentId vacío", () => {
    const r = categoryInputSchema.safeParse({ name: "  Comida  ", parentId: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.name).toBe("Comida"); // trim
      expect(r.data.categoryType).toBe("expense");
      expect(r.data.parentId).toBeNull();
    }
  });

  it("acepta parentId uuid válido", () => {
    const r = categoryInputSchema.safeParse({ name: "Sub", parentId: OTHER_UUID });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.parentId).toBe(OTHER_UUID);
  });

  it("rechaza nombre demasiado largo (>60)", () => {
    expectFailAt(categoryInputSchema, { name: "a".repeat(61) }, ["name"]);
  });

  it("rechaza categoryType fuera del enum", () => {
    expectFailAt(categoryInputSchema, { name: "X", categoryType: "raro" }, ["categoryType"]);
  });

  it("rechaza parentId malformado", () => {
    expectFailAt(categoryInputSchema, { name: "X", parentId: "abc" }, ["parentId"]);
  });
});

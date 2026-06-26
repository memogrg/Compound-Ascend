import { describe, it, expect } from "vitest";
import { toPendingAction, dedupKey } from "@/lib/ingestion/normalize";
import type { RawMovement } from "@/lib/ingestion/types";

const movement = (over: Partial<RawMovement> = {}): RawMovement => ({
  kind: "gasto",
  amount: 12500,
  currency: "CRC",
  occurredOn: "2026-06-26",
  merchant: "Automercado",
  description: "Compra supermercado",
  sourceKind: "whatsapp_notification",
  bankCode: "BAC",
  confidence: 0.9,
  externalRef: null,
  rawText: "BAC: compra por CRC 12,500 en AUTOMERCADO",
  ...over,
});

describe("toPendingAction", () => {
  it("mapea un RawMovement al shape PendingAction (origin/source = notification)", () => {
    const pa = toPendingAction(movement());
    expect(pa).toEqual({
      kind: "gasto",
      description: "Compra supermercado",
      amount: 12500,
      currency: "CRC",
      occurredOn: "2026-06-26",
      merchant: "Automercado",
      origin: "notification",
      source: "notification",
    });
  });

  it("conserva ingreso y merchant null", () => {
    const pa = toPendingAction(movement({ kind: "ingreso", merchant: null }));
    expect(pa.kind).toBe("ingreso");
    expect(pa.merchant).toBeNull();
  });
});

describe("dedupKey", () => {
  it("usa externalRef cuando existe", () => {
    expect(dedupKey(movement({ externalRef: "txn-abc-123" }))).toBe("txn-abc-123");
  });

  it("es estable para el mismo movimiento (hash determinista)", () => {
    expect(dedupKey(movement())).toBe(dedupKey(movement()));
  });

  it("normaliza el comercio (case/espacios) → misma clave", () => {
    expect(dedupKey(movement({ merchant: "Automercado" }))).toBe(
      dedupKey(movement({ merchant: "  automercado  " })),
    );
  });

  it("distingue movimientos distintos (monto, fecha, banco o comercio)", () => {
    const base = dedupKey(movement());
    expect(dedupKey(movement({ amount: 99 }))).not.toBe(base);
    expect(dedupKey(movement({ occurredOn: "2026-06-25" }))).not.toBe(base);
    expect(dedupKey(movement({ bankCode: "BNCR" }))).not.toBe(base);
    expect(dedupKey(movement({ merchant: "Otro" }))).not.toBe(base);
  });
});

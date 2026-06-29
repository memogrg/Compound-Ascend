import { describe, it, expect } from "vitest";
import {
  mapProposalRow,
  proposalToTxnInput,
  type PendingProposalView,
} from "@/modules/financial-base/services/ingest-proposals-view";

const ROW = {
  id: "p1",
  kind: "gasto" as const,
  amount: 6900,
  currency: "CRC",
  occurred_on: "2026-06-27",
  merchant: "HELADOS MOYO",
  card_last4: "2062",
  confidence: 0.95,
};

describe("ingest-proposals-view · mapProposalRow", () => {
  it("resuelve la etiqueta de tarjeta por last4 dentro de la cuenta", () => {
    const v = mapProposalRow(ROW, [{ last4: "2062", label: "Mastercard personal", holder_name: null }]);
    expect(v.cardLabel).toBe("Mastercard personal");
    expect(v.occurredOn).toBe("2026-06-27");
    expect(v.cardLast4).toBe("2062");
    expect(v.amount).toBe(6900);
  });

  it("last4 sin tarjeta registrada -> cardLabel null (pero conserva last4)", () => {
    const v = mapProposalRow(ROW, [{ last4: "9999", label: "Otra", holder_name: null }]);
    expect(v.cardLabel).toBeNull();
    expect(v.cardLast4).toBe("2062");
  });
});

describe("ingest-proposals-view · proposalToTxnInput", () => {
  const base: PendingProposalView = {
    id: "p1",
    kind: "gasto",
    amount: 6900,
    currency: "CRC",
    occurredOn: "2026-06-27",
    merchant: "HELADOS MOYO",
    cardLast4: "2062",
    cardLabel: "Mastercard personal",
    confidence: 0.95,
  };

  it("mapea a payload de transacción con descripción 'comercio · tarjeta'", () => {
    const t = proposalToTxnInput(base);
    expect(t.kind).toBe("gasto");
    expect(t.amount).toBe(6900);
    expect(t.currency).toBe("CRC");
    expect(t.occurredOn).toBe("2026-06-27");
    expect(t.merchantOrSource).toBe("HELADOS MOYO");
    expect(t.description).toBe("HELADOS MOYO · Mastercard personal");
    expect(t.origin).toBe("imported");
    expect(t.source).toBe("email");
    expect(t.status).toBe("confirmed");
    expect(t.confidence).toBe(0.95);
  });

  it("sin comercio ni tarjeta -> sin merchantOrSource y descripción por kind", () => {
    const t = proposalToTxnInput({ ...base, merchant: null, cardLabel: null });
    expect(t.merchantOrSource).toBeUndefined();
    expect(t.description).toBe("Gasto");
  });

  it("ingreso sin detalle -> descripción 'Ingreso'", () => {
    const t = proposalToTxnInput({ ...base, kind: "ingreso", merchant: null, cardLabel: null });
    expect(t.kind).toBe("ingreso");
    expect(t.description).toBe("Ingreso");
  });
});

/**
 * Copy compartido web+móvil para eliminar una transacción huérfana. La parte que
 * importa: el aviso DIFERENCIA vinculada vs no, y degrada al tipo si no hay nombre.
 */
import { describe, it, expect } from "vitest";
import { isLinkedOrphan, orphanDeletionWarning } from "@/modules/financial-base/engine/orphan-delete";
import type { OrphanLine } from "@/modules/financial-base/engine/expense-jars";

const line = (over: Partial<OrphanLine>): OrphanLine => ({
  id: over.id ?? "t1",
  name: over.name ?? "Compra",
  amount: over.amount ?? 115,
  nativeAmount: over.nativeAmount ?? 115,
  currency: over.currency ?? "CRC",
  reason: over.reason ?? "sin_categoria",
  linkedKind: over.linkedKind,
  linkedId: over.linkedId ?? null,
  linkedName: over.linkedName ?? null,
});

describe("isLinkedOrphan", () => {
  it("vinculada (linkedKind real) → true", () => {
    expect(isLinkedOrphan(line({ linkedKind: "goal" }))).toBe(true);
  });
  it("'none' o ausente → false", () => {
    expect(isLinkedOrphan(line({ linkedKind: "none" }))).toBe(false);
    expect(isLinkedOrphan(line({}))).toBe(false);
  });
});

describe("orphanDeletionWarning", () => {
  it("vinculada CON nombre → advierte reversión y nombra la entidad", () => {
    const msg = orphanDeletionWarning(
      line({ linkedKind: "goal", linkedName: "Beauty Fernanda" }),
      "₡115",
    );
    expect(msg).toContain("REVERTIRÁ");
    expect(msg).toContain("Beauty Fernanda");
    expect(msg).toContain("₡115");
    expect(msg).toContain("no se puede deshacer");
  });

  it("vinculada SIN nombre (entidad muerta) → degrada al tipo, no dice undefined", () => {
    const msg = orphanDeletionWarning(line({ linkedKind: "goal", linkedName: null }), "₡115");
    expect(msg).toContain("REVERTIRÁ");
    expect(msg).toContain("el acumulado de tu sobre"); // sustantivo genérico del tipo
    expect(msg).not.toContain("«»");
    expect(msg).not.toContain("undefined");
  });

  it("deuda vinculada → sustantivo del ledger correcto", () => {
    const msg = orphanDeletionWarning(line({ linkedKind: "debt", linkedName: "Tarjeta" }), "₡500");
    expect(msg).toContain("el saldo de tu deuda");
    expect(msg).toContain("Tarjeta");
  });

  it("NO vinculada → confirmación simple, sin hablar de reversión", () => {
    const msg = orphanDeletionWarning(line({ name: "Suelto" }), "₡50");
    expect(msg).toContain("Suelto");
    expect(msg).toContain("total gastado baja");
    expect(msg).not.toContain("REVERTIRÁ");
  });
});

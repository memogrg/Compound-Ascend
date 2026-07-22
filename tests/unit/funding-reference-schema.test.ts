import { describe, it, expect } from "vitest";
import { goalInputSchema } from "@/modules/control/schemas";
import { policyInputSchema } from "@/modules/wealth/schemas";

/**
 * Referencia "dónde está el dinero": campo INFORMATIVO libre.
 *  · savings_goals reusa la columna `stored_in` (storedIn en el input).
 *  · insurance_policies usa `funding_reference` (fundingReference).
 * Aquí se valida la capa de entrada (el schema): el servicio escribe la columna con
 * `input.storedIn ?? null` / `input.fundingReference ?? null` (cubierto por typecheck),
 * así que "vacío → null" en persistencia se apoya en que el schema lo deja opcional/nullable.
 */
describe("goalInputSchema · storedIn (referencia del ahorro)", () => {
  const base = { name: "Ahorro", currency: "CRC" };

  it("preserva el texto de referencia", () => {
    expect(goalInputSchema.parse({ ...base, storedIn: "BAC ahorros ···1234" }).storedIn).toBe(
      "BAC ahorros ···1234",
    );
  });

  it("opcional: ausente → undefined (el servicio lo persiste como null)", () => {
    expect(goalInputSchema.parse({ ...base }).storedIn).toBeUndefined();
  });

  it("nullable: null explícito (vacío) se acepta", () => {
    expect(goalInputSchema.parse({ ...base, storedIn: null }).storedIn).toBeNull();
  });
});

describe("policyInputSchema · fundingReference (referencia de la póliza)", () => {
  const base = { policyType: "vida" as const, currency: "CRC" };

  it("preserva el texto de referencia", () => {
    expect(policyInputSchema.parse({ ...base, fundingReference: "BAC ···1234" }).fundingReference).toBe(
      "BAC ···1234",
    );
  });

  it("opcional: ausente → undefined (el servicio lo persiste como null)", () => {
    expect(policyInputSchema.parse({ ...base }).fundingReference).toBeUndefined();
  });

  it("nullable: null explícito (vacío) se acepta", () => {
    expect(policyInputSchema.parse({ ...base, fundingReference: null }).fundingReference).toBeNull();
  });
});

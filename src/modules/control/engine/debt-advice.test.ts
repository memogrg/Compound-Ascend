import { describe, it, expect } from "vitest";
import { buildDebtAdvice } from "@/modules/control/engine/debt-advice";

const base = { archetypeLabel: "Liberador de Deudas", dominantValue: "tranquilidad" };

describe("buildDebtAdvice", () => {
  it("sin perfil (sin archetypeLabel) → null", () => {
    expect(buildDebtAdvice({ debts: [{ name: "X", balance: 100, apr: 30 }] })).toBeNull();
  });

  it("sin deudas activas → accent 'pos'", () => {
    const a = buildDebtAdvice({ ...base, debts: [] });
    expect(a?.accent).toBe("pos");
    expect(a?.title).toContain("Sin deudas activas");
    expect(a?.body).toContain("tranquilidad");
  });

  it("deudas con balance 0 → se tratan como sin deudas (pos)", () => {
    const a = buildDebtAdvice({ ...base, debts: [{ name: "Saldada", balance: 0, apr: 40 }] });
    expect(a?.accent).toBe("pos");
  });

  it("alguna en atraso ('31_60') → accent 'neg' con el nombre", () => {
    const a = buildDebtAdvice({
      ...base,
      debts: [
        { name: "Visa", balance: 5000, apr: 45, delinquency: "31_60" },
        { name: "Carro", balance: 8000, apr: 12, delinquency: "no" },
      ],
    });
    expect(a?.accent).toBe("neg");
    expect(a?.title).toContain("Visa");
  });

  it("varias deudas al día → recomienda la de mayor APR (accent 'warn')", () => {
    const a = buildDebtAdvice({
      ...base,
      debts: [
        { name: "Hipoteca", balance: 100000, apr: 8 },
        { name: "Tarjeta", balance: 3000, apr: 50 },
        { name: "Personal", balance: 5000, apr: 22 },
      ],
    });
    expect(a?.accent).toBe("warn");
    expect(a?.body).toContain("Tarjeta");
    expect(a?.body).toContain("50%");
  });

  it("cierre por arquetipo: protector → fondo de emergencia", () => {
    const a = buildDebtAdvice({
      archetypeLabel: "Protector Prudente",
      debts: [{ name: "Tarjeta", balance: 3000, apr: 50 }],
    });
    expect(a?.body).toContain("fondo de emergencia");
  });
});

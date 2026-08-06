import { describe, it, expect } from "vitest";
import {
  buildBaseProtectionChecklist,
  type ProtectionChecklistInput,
} from "@/modules/wealth/engine/protection-checklist";

const base: ProtectionChecklistInput = {
  coverageByType: [],
  hasEmergencyFund: false,
  hasPeaceFund: false,
};

describe("buildBaseProtectionChecklist", () => {
  it("devuelve las 5 protecciones base en orden canónico", () => {
    const items = buildBaseProtectionChecklist(base);
    expect(items.map((i) => i.key)).toEqual([
      "auto",
      "vida",
      "medico",
      "fondo_emergencia",
      "fondo_paz",
    ]);
    // Sin nada: todo ✗.
    expect(items.every((i) => !i.covered)).toBe(true);
  });

  it("marca cubierto por PolicyType y suma la cobertura; 'médico' agrupa la familia de salud", () => {
    const items = buildBaseProtectionChecklist({
      ...base,
      coverageByType: [
        { type: "vehiculo", coverage: 15000 },
        { type: "gastos_mayores", coverage: 40000 },
        { type: "gastos_menores", coverage: 10000 },
      ],
    });
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(byKey.auto).toMatchObject({ covered: true, coverage: 15000 });
    expect(byKey.medico).toMatchObject({ covered: true, coverage: 50000 }); // 40k + 10k
    expect(byKey.vida!.covered).toBe(false);
  });

  it("cobertura 0 no cuenta como cubierto", () => {
    const items = buildBaseProtectionChecklist({
      ...base,
      coverageByType: [{ type: "vida", coverage: 0 }],
    });
    expect(items.find((i) => i.key === "vida")).toMatchObject({ covered: false, coverage: 0 });
  });

  it("los fondos salen de los flags (sin cobertura numérica)", () => {
    const items = buildBaseProtectionChecklist({
      ...base,
      hasEmergencyFund: true,
      hasPeaceFund: false,
    });
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(byKey.fondo_emergencia).toEqual({
      key: "fondo_emergencia",
      label: "Fondo de emergencia",
      covered: true,
      coverage: null,
    });
    expect(byKey.fondo_paz!.covered).toBe(false);
  });
});

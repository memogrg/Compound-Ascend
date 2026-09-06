import { describe, it, expect } from "vitest";
import { naturalezaDeLinea } from "@/modules/financial-base/engine/base-engine";

/**
 * La naturaleza decide en qué cubeta cae cada colón del presupuesto, y de esas
 * cubetas salen la tasa de ahorro, el peso de deuda y el de esenciales. Que una
 * línea caiga en "misceláneo" no es un detalle cosmético: la saca del cálculo.
 */
describe("naturalezaDeLinea", () => {
  it("las derivadas se clasifican por lo que SON, no por su categoría", () => {
    // syncDerivedBudget las escribe con category_id null: si no fuera por
    // source_kind, los aportes a metas caerían en misceláneo y la tasa de
    // ahorro daría 0 % con el usuario ahorrando cada mes.
    expect(naturalezaDeLinea({ sourceKind: "goal", categoryNature: null })).toBe("ahorro");
    expect(naturalezaDeLinea({ sourceKind: "debt", categoryNature: null })).toBe("financiero");
    expect(naturalezaDeLinea({ sourceKind: "policy", categoryNature: null })).toBe("proteccion");
  });

  it("el origen derivado gana sobre la categoría", () => {
    expect(naturalezaDeLinea({ sourceKind: "goal", categoryNature: "estilo_vida" })).toBe("ahorro");
  });

  it("una línea manual usa la naturaleza de su categoría", () => {
    expect(naturalezaDeLinea({ sourceKind: "manual", categoryNature: "esencial" })).toBe(
      "esencial",
    );
    expect(naturalezaDeLinea({ sourceKind: null, categoryNature: "estilo_vida" })).toBe(
      "estilo_vida",
    );
  });

  it("una hoja propia o fork (sin naturaleza) hereda la del grupo padre", () => {
    // Personalizar una categoría no debe sacarla del cálculo.
    expect(
      naturalezaDeLinea({ sourceKind: "manual", categoryNature: null, parentNature: "proteccion" }),
    ).toBe("proteccion");
  });

  it("la categoría propia gana sobre el padre cuando sí tiene naturaleza", () => {
    expect(
      naturalezaDeLinea({
        sourceKind: "manual",
        categoryNature: "ahorro",
        parentNature: "esencial",
      }),
    ).toBe("ahorro");
  });

  it("sin ninguna señal cae en misceláneo", () => {
    expect(naturalezaDeLinea({})).toBe("miscelaneo");
    expect(naturalezaDeLinea({ sourceKind: "recurring", categoryNature: null })).toBe("miscelaneo");
  });

  it("una naturaleza desconocida no se propaga: cae en misceláneo", () => {
    // La BD podría traer un valor viejo o escrito a mano; no debe inventar una
    // cubeta que el motor no conoce.
    expect(naturalezaDeLinea({ categoryNature: "inventada" })).toBe("miscelaneo");
  });
});

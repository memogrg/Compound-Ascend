import { describe, expect, it } from "vitest";

import { selectLibertad } from "@/modules/dashboard/engine/home-cards";

/**
 * Estado por hito de la ficha Libertad (Inicio · carrusel). El motor de patrimonio ya
 * capa los avances a 1; aquí sólo se verifica la CAPA DE PRESENTACIÓN que `selectLibertad`
 * añade: el "valor actual" (investableWealth) y el estado alcanzado/en curso/pendiente.
 * No se toca el cálculo de patrimonio.
 */

// Reporte parcial mínimo que consume selectLibertad (el resto de PatrimonioReport no importa).
type LibertadReport = Parameters<typeof selectLibertad>[0];

const base: LibertadReport = {
  hitoAlcanzado: "seguridad",
  progresoSeguridad: 1,
  progresoIndependencia: 0.67,
  numeroDeSeguridad: 50_000_000,
  numeroDeIndependencia: 497_000_000,
  numeroDeLibertad: null,
  progresoLibertad: 0,
  investableWealth: 333_000_000,
};

describe("selectLibertad · estado por hito", () => {
  it("expone el valor actual (investableWealth) como cifra titular", () => {
    const c = selectLibertad(base);
    expect(c.actual).toBe(333_000_000);
  });

  it("en Independencia: Partida y Seguridad alcanzados, Independencia en curso, Libertad pendiente", () => {
    const c = selectLibertad(base);
    expect(c.hitos.map((h) => h.key)).toEqual(["ninguno", "seguridad", "independencia", "libertad"]);
    expect(c.hitos.map((h) => h.state)).toEqual(["done", "done", "current", "pending"]);
  });

  it("cada hito lleva su monto objetivo; Libertad sin meta definida queda en 0", () => {
    const c = selectLibertad(base);
    expect(c.hitos[1]?.amount).toBe(50_000_000);
    expect(c.hitos[2]?.amount).toBe(497_000_000);
    expect(c.hitos[3]?.amount).toBe(0); // numeroDeLibertad null → sin meta
  });

  it("un solo hito en curso: el PRIMER pct<1 (los siguientes son pendientes, no en curso)", () => {
    const c = selectLibertad(base);
    expect(c.hitos.filter((h) => h.state === "current")).toHaveLength(1);
    expect(c.hitos.find((h) => h.state === "current")?.key).toBe("independencia");
  });

  it("nada alcanzado aún: Seguridad es el hito en curso; el resto, pendiente", () => {
    const c = selectLibertad({
      ...base,
      hitoAlcanzado: "ninguno",
      progresoSeguridad: 0.4,
      progresoIndependencia: 0,
      investableWealth: 20_000_000,
    });
    expect(c.hitos.map((h) => h.state)).toEqual(["done", "current", "pending", "pending"]);
    expect(c.actual).toBe(20_000_000);
  });

  it("todos los hitos alcanzados: no hay ninguno en curso", () => {
    const c = selectLibertad({
      ...base,
      hitoAlcanzado: "libertad",
      progresoIndependencia: 1,
      numeroDeLibertad: 900_000_000,
      progresoLibertad: 1,
      investableWealth: 950_000_000,
    });
    expect(c.hitos.map((h) => h.state)).toEqual(["done", "done", "done", "done"]);
    expect(c.hitos.some((h) => h.state === "current")).toBe(false);
  });

  it("los avances se capan a 1 (un pct>1 no rompe el 100%)", () => {
    const c = selectLibertad({ ...base, progresoIndependencia: 1.4 });
    expect(c.hitos[2]?.pct).toBe(1);
    expect(c.hitos[2]?.state).toBe("done");
  });
});

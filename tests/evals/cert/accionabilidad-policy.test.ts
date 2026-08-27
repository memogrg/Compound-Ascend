import { describe, it, expect } from "vitest";
import { applyAccionabilidadPolicy } from "./rubric";
import type { RubricScores } from "./types";

/**
 * Política determinista de accionabilidad (Paso 3.8/3.9). Cierra el hueco del juez que NA-eaba tanto
 * turnos no-acción como turnos accionables: acá la marca por-probe manda en ambas direcciones.
 */
const mk = (accionabilidad: RubricScores["accionabilidad"]): RubricScores => ({
  relevancia: 4,
  personalizacion: 4,
  prioridad: 4,
  accionabilidad,
  consulta_apropiada: "NA",
  proactividad: 4,
  confrontacion_calida: "NA",
  conciencia_temporal: 4,
  explicacion_y_tono: 4,
});

describe("applyAccionabilidadPolicy", () => {
  it("turno NO-acción (expectsAction=false) → NA, sin importar lo que dijo el juez", () => {
    const r = mk(5);
    applyAccionabilidadPolicy(r, false);
    expect(r.accionabilidad).toBe("NA");
  });
  it("turno accionable con NA-del-juez → 1 (cierre ausente), NO se excluye", () => {
    const r = mk("NA");
    applyAccionabilidadPolicy(r, true);
    expect(r.accionabilidad).toBe(1);
  });
  it("turno accionable SIN flag (undefined) con NA-del-juez → también 1", () => {
    const r = mk("NA");
    applyAccionabilidadPolicy(r, undefined);
    expect(r.accionabilidad).toBe(1);
  });
  it("turno accionable con score numérico del juez → intacto", () => {
    const r = mk(3);
    applyAccionabilidadPolicy(r, true);
    expect(r.accionabilidad).toBe(3);
  });
});

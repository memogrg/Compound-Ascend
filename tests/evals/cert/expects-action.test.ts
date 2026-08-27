import { describe, it, expect } from "vitest";
import {
  ADVERSARIAL,
  HIGHLIGHTS,
  LONGITUDINAL,
  GENERICO,
  PROACTIVIDAD,
  CONSISTENCIA,
  CONFRONTACION,
  type Probe,
} from "./prompts";

/**
 * LOCK de la clasificación de NA (Paso 3.8): accionabilidad = NA SOLO en los turnos genuinamente
 * NO-acción (adversarial + highlights). Este test fija la lista exacta para que no pueda driftear:
 * si alguien marca un turno accionable como expectsAction=false (para inflar el promedio), o desmarca
 * uno de estos, el test falla. La marca es sobre lo que el turno AMERITA, no la respuesta.
 */
const isNA = (p: Probe) => p.expectsAction === false;

describe("expectsAction — clasificación LOCKEADA del NA de accionabilidad", () => {
  it("adversarial: los 2 probes son NO-acción (frenar/reconducir)", () => {
    expect(ADVERSARIAL.every(isNA)).toBe(true);
    expect(ADVERSARIAL.length).toBe(2);
  });
  it("highlights: los 3 probes son NO-acción (reconocimiento puro)", () => {
    expect(HIGHLIGHTS.every(isNA)).toBe(true);
    expect(HIGHLIGHTS.length).toBe(3);
  });
  it("longitudinal / generico / consistencia: SÍ ameritan acción (no NA)", () => {
    for (const p of [LONGITUDINAL, GENERICO, CONSISTENCIA]) expect(isNA(p)).toBe(false);
  });
  it("proactividad / confrontacion: SÍ ameritan acción (no NA)", () => {
    expect(PROACTIVIDAD.some(isNA)).toBe(false);
    expect(CONFRONTACION.some(isNA)).toBe(false);
  });
  it("EXACTAMENTE 5 probes son NO-acción en todo el set (2 adversarial + 3 highlights)", () => {
    const all: Probe[] = [
      ...ADVERSARIAL,
      ...HIGHLIGHTS,
      ...PROACTIVIDAD,
      ...CONFRONTACION,
      LONGITUDINAL,
      GENERICO,
      CONSISTENCIA,
    ];
    expect(all.filter(isNA).length).toBe(5);
  });
});

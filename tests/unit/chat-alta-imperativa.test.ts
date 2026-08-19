/**
 * ALTA IMPERATIVA EN EL CHAT — los dos bugs de la frase exacta que los destapó:
 *
 *   "Agrega un gasto a transporte de vehículo de 37747 el día 2 de agosto"
 *
 *  1. Se contestaba como BÚSQUEDA ("No tenés gastos en transporte de vehículo de 37747 el día 2
 *     registrados"): el mensaje trae la palabra "gasto" y un mes, así que un carril de consulta lo
 *     matcheaba antes de que el carril de acción llegara a verlo. Ahora el ORDEN de alta gana
 *     siempre sobre cualquier carril de consulta.
 *  2. La fecha se ignoraba (`occurredOn` era hoy, fijo). Ahora sale del mensaje.
 *
 * Los dos se prueban en el mismo archivo porque son la misma frase: el carril tiene que ganar Y
 * fechar bien; ganar y fechar mal seguiría mandando el gasto al mes equivocado.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { detectCreateAction, esOrdenDeAltaDeMovimiento } from "@/lib/ai/action-lane";
import { matchIntent } from "@/lib/ai/router";

const FRASE = "Agrega un gasto a transporte de vehículo de 37747 el día 2 de agosto";
const OPTS = { currency: "USD", today: "2026-08-18", holdings: [] };

describe("precedencia: el ORDEN de alta le gana a todo carril de consulta", () => {
  it("la frase exacta ya NO cae en un carril de consulta", () => {
    // null = el router no la reclama y `tryRouteQuery` sigue al carril de acción.
    expect(matchIntent(FRASE)).toBeNull();
  });

  it("la reconoce como orden de alta", () => {
    expect(esOrdenDeAltaDeMovimiento(FRASE)).toBe(true);
  });

  it("una PREGUNTA sobre gastos sigue siendo consulta, no alta", () => {
    expect(esOrdenDeAltaDeMovimiento("¿cuánto gasté en transporte este mes?")).toBe(false);
    expect(matchIntent("¿cuánto gasté la semana pasada?")?.intent).toBe("consulta_transacciones");
  });

  it("sin monto no hay orden de alta: la ambigüedad la resuelve el LLM", () => {
    expect(esOrdenDeAltaDeMovimiento("agregá un gasto de transporte")).toBe(false);
  });

  it("el lenguaje de análisis nunca es un alta, ni en imperativo", () => {
    expect(esOrdenDeAltaDeMovimiento("recortá mis gastos de 5000")).toBe(false);
  });
});

describe("la propuesta que arma el carril de acción", () => {
  const r = detectCreateAction(FRASE, OPTS);

  it("propone REGISTRAR, no buscar", () => {
    expect(r?.action?.type).toBe("create_transaction");
    expect(r?.reply).toMatch(/registrar/i);
    expect(r?.reply).not.toMatch(/no ten[eé]s/i);
  });

  it("usa la fecha DICHA, no la de hoy", () => {
    expect(r?.action?.payload).toMatchObject({ occurredOn: "2026-08-02" });
    expect(r?.reply).toContain("2 de agosto de 2026");
  });

  it("el monto es el importe, no el número de la fecha", () => {
    expect(r?.action?.payload).toMatchObject({ amount: 37747, kind: "gasto", currency: "USD" });
  });

  it("la descripción es el destino del gasto, sin el monto pegado", () => {
    expect((r?.action?.payload as Record<string, unknown>).description).toBe(
      "transporte de vehículo",
    );
  });
});

describe("la fecha que no se pudo interpretar se DICE (no se ignora en silencio)", () => {
  const r = detectCreateAction("Agrega un gasto de 5000 en el súper el 31 de febrero", OPTS);

  it("cae a hoy pero lo avisa, con la frase del usuario", () => {
    expect(r?.action?.payload).toMatchObject({ occurredOn: "2026-08-18" });
    expect(r?.reply).toMatch(/no entend[ií] la fecha/i);
    expect(r?.reply).toContain("31 de febrero");
  });

  it("el texto dicho viaja a la tarjeta para poder corregirlo ahí", () => {
    expect((r?.action?.payload as Record<string, unknown>).dateText).toContain("31 de febrero");
  });
});

describe("sin fecha en el mensaje, hoy sigue siendo el default", () => {
  it('"gasté 5000 en el súper" → hoy, sin aviso', () => {
    const r = detectCreateAction("gasté 5000 en el súper", OPTS);
    expect(r?.action?.payload).toMatchObject({ occurredOn: "2026-08-18", amount: 5000 });
    expect(r?.reply).not.toMatch(/no entend/i);
  });

  it('"ayer" se resuelve contra el hoy del PERFIL', () => {
    const r = detectCreateAction("anotá un gasto de 3000 en restaurantes ayer", OPTS);
    expect(r?.action?.payload).toMatchObject({ occurredOn: "2026-08-17" });
  });
});

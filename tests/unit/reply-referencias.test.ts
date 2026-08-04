/**
 * RESPONDER A UN MENSAJE resuelve las referencias contra lo CITADO.
 *
 * El bug: con cita, la ruta apagaba TODOS los carriles deterministas
 * (`matched = user && !quote ? matchIntent(...) : null`). Responder al bloque de transacciones
 * pegadas con "¿estas están registradas?" dejaba de conciliar y contestaba con todo el mes.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { pareceReferenciaACitado, annotateReply, quoteBloque } from "@/lib/ai/chat-quote";
import { matchIntent } from "@/lib/ai/router";

const BLOQUE = `246276  2026-07-17  CAFE SIMONETA  9,200.00  COL  D
246277  2026-07-18  STARBUCKS  12,000.00  COL  D
246281  2026-07-20  POPS  1,500.00  COL  D`;

describe("pareceReferenciaACitado · cuándo el pedido está en lo citado", () => {
  it("los pronombres que apuntan hacia atrás", () => {
    for (const f of [
      "¿estas están registradas?",
      "¿esto ya lo tengo?",
      "¿estos gastos están anotados?",
      "revisá esos",
      "lo de arriba, ¿está?",
      "¿y eso?",
      "¿esa lista está completa?",
    ]) {
      expect(pareceReferenciaACitado(f), f).toBe(true);
    }
  });

  it("un pedido AUTOSUFICIENTE no es una referencia", () => {
    for (const f of [
      "dame las transacciones de restaurantes de julio",
      "¿cuánto gasté el mes pasado?",
      "¿cómo va mi fondo de emergencia?",
    ]) {
      expect(pareceReferenciaACitado(f), f).toBe(false);
    }
  });
});

describe("el ruteo de la referencia cae sobre el texto CITADO", () => {
  // Es lo que hace la ruta: si el mensaje actual no matchea y es una referencia a un mensaje del
  // usuario, se rutea el contenido citado.
  const rutearComoLaRuta = (actual: string, citado: string) =>
    matchIntent(actual) ?? (pareceReferenciaACitado(actual) ? matchIntent(citado) : null);

  it("reply al bloque + «¿estas están registradas?» → concilia el bloque CITADO", () => {
    const m = rutearComoLaRuta("¿estas están registradas?", BLOQUE);
    expect(m?.intent).toBe("conciliar_estado");
    // Y concilia EXACTAMENTE el bloque citado, no el mes entero.
    expect(m?.params.texto).toBe(BLOQUE);
  });

  it("«¿esto ya lo tengo anotado?» sobre el mismo bloque, igual", () => {
    expect(rutearComoLaRuta("¿esto ya lo tengo anotado?", BLOQUE)?.intent).toBe("conciliar_estado");
  });

  it("un pedido autosuficiente NO se deja pisar por la cita", () => {
    // Aunque haya cita, el mensaje actual manda: pide restaurantes, no concilia el bloque.
    const m = rutearComoLaRuta("dame las transacciones de restaurantes de julio", BLOQUE);
    expect(m?.intent).toBe("consulta_transacciones");
    expect(m?.params.sobre).toBe("restaurantes");
  });

  it("sin referencia y sin match, no se rutea la cita (escala al LLM con el contexto)", () => {
    expect(rutearComoLaRuta("¿y al 4%?", BLOQUE)).toBeNull();
  });
});

describe("REGRESIÓN: el router sigue andando con cita", () => {
  // El bug era apagar los carriles cuando había cita. Estos matchean por el mensaje ACTUAL y
  // tienen que seguir haciéndolo, exista o no una cita en el turno.
  it("las consultas de siempre no dependen de la cita", () => {
    expect(matchIntent("dame las transacciones de transporte del mes pasado")?.intent).toBe(
      "consulta_transacciones",
    );
    expect(matchIntent("dale, registralas")?.intent).toBe("confirmar_alta_estado");
    expect(matchIntent(BLOQUE)?.intent).toBe("conciliar_estado");
  });

  it("«registrá un gasto…» sigue SIN pasar por matchIntent: es del action lane", () => {
    // No es una regresión: el alta de gastos la resuelve detectCreateAction, no el router de
    // intents. Se fija acá para que quede claro por qué este caso da null.
    expect(matchIntent("registrá un gasto de 5000 en super")).toBeNull();
  });
});

describe("la cita que va al prompt CONSERVA la estructura", () => {
  it("quoteBloque no aplana los saltos de línea", () => {
    expect(quoteBloque(BLOQUE, 1200)).toBe(BLOQUE);
    expect(quoteBloque(BLOQUE, 1200).split("\n")).toHaveLength(3);
  });

  it("recorta largo pero sigue sin aplanar", () => {
    const out = quoteBloque(BLOQUE, 60);
    expect(out.endsWith("…")).toBe(true);
    expect(out).toContain("\n");
  });

  it("annotateReply mete el bloque con sus filas, no en un renglón", () => {
    // Antes usaba quoteExcerpt, que colapsa \s+ y dejaba el estado de cuenta como una sola línea:
    // el modelo perdía la estructura de filas que es justo lo que se le pide leer.
    const out = annotateReply("¿estas están registradas?", { role: "user", content: BLOQUE });
    expect(out).toContain("CAFE SIMONETA");
    expect(out).toContain("STARBUCKS");
    expect(out.split("\n").length).toBeGreaterThan(4);
  });

  it("y sigue diciendo a QUÉ se responde y de quién era", () => {
    const out = annotateReply("¿y al 4%?", {
      role: "assistant",
      content: "Tu número de independencia es ₡253.650.941.",
    });
    expect(out).toContain("RESPONDIENDO");
    expect(out).toContain("tuyo (el asesor)");
    expect(out).toContain("₡253.650.941"); // el número citado llega íntegro al prompt
    expect(out.trimEnd().endsWith("¿y al 4%?")).toBe(true);
  });
});

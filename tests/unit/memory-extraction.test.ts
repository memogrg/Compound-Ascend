/**
 * EL EXTRACTOR, de punta a punta (con el modelo mockeado).
 *
 * `memory-facts` prueba las piezas; acá se prueba que ENSAMBLADAS hagan lo prometido: que lo que
 * la persona contó de su vida quede guardado, que una cifra NO quede guardada aunque el modelo la
 * devuelva, y que al modelo ni siquiera se le muestre lo que dijo el asistente.
 *
 * El provider se mockea con `vi.mock` sobre `@/lib/ai/providers/gemini`, que es de donde
 * `memory-extraction` toma `createGeminiProvider`. Se guarda lo que se le mandó para poder afirmar
 * sobre el PROMPT, no solo sobre el resultado.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

/** Lo último que se le mandó al modelo (system + mensajes). */
let ultimaLlamada: { system: string; messages: { role: string; content: string }[] } | null = null;
/** Lo próximo que el modelo va a "contestar". */
let respuestaDelModelo = "[]";
/** Si el provider existe (null simula "sin GEMINI_API_KEY"). */
let hayProvider = true;

vi.mock("@/lib/ai/providers/gemini", () => ({
  createGeminiProvider: () =>
    hayProvider
      ? {
          chat: async (args: { system: string; messages: { role: string; content: string }[] }) => {
            ultimaLlamada = { system: args.system, messages: args.messages };
            return { text: respuestaDelModelo, tokensIn: 10, tokensOut: 10 };
          },
        }
      : null,
}));

import { extractFactsFromDay } from "@/lib/ai/memory-extraction";

beforeEach(() => {
  ultimaLlamada = null;
  respuestaDelModelo = "[]";
  hayProvider = true;
});

const DIA_TIPICO = [
  { role: "user" as const, content: "hola, mi esposa se llama Fernanda" },
  { role: "assistant" as const, content: "Qué bueno. ¿Fernanda también aporta al fondo?" },
  { role: "user" as const, content: "sí. ayer gasté ₡50.000 en el súper" },
  { role: "assistant" as const, content: "Registrado. Tu esposa Fernanda es contadora, ¿verdad?" },
];

describe("extractFactsFromDay · qué se guarda y qué no", () => {
  it("guarda el hecho personal que contó la persona", async () => {
    respuestaDelModelo = JSON.stringify([
      { fact: "Su esposa se llama Fernanda", category: "familia" },
    ]);
    const out = await extractFactsFromDay(DIA_TIPICO);
    expect(out).toEqual([{ fact: "Su esposa se llama Fernanda", category: "familia" }]);
  });

  it("NO guarda una cifra, aunque el modelo desobedezca el prompt y la devuelva", async () => {
    // Este es el caso que la guarda de código existe para atajar: el prompt lo prohíbe, pero la
    // prohibición no puede depender de que el modelo obedezca. Una cifra memorizada queda stale y
    // el asesor la recitaría como verdad.
    respuestaDelModelo = JSON.stringify([
      { fact: "Su esposa se llama Fernanda", category: "familia" },
      { fact: "Gastó ₡50.000 en el súper", category: "otro" },
      { fact: "Gana $3,200 al mes", category: "trabajo" },
    ]);
    const out = await extractFactsFromDay(DIA_TIPICO);
    expect(out).toHaveLength(1);
    expect(out[0]!.fact).toBe("Su esposa se llama Fernanda");
  });

  it("al modelo NO se le muestra nada dicho por el asistente", async () => {
    await extractFactsFromDay(DIA_TIPICO);
    const enviado = ultimaLlamada!.messages[0]!.content;
    expect(enviado).toContain("mi esposa se llama Fernanda");
    // Ni la pregunta del asesor ni —sobre todo— su suposición ("es contadora"), que si entrara
    // se guardaría como un hecho que la persona nunca dijo.
    expect(enviado).not.toContain("contadora");
    expect(enviado).not.toContain("¿Fernanda también aporta");
  });

  it("el prompt le prohíbe explícitamente cifras, inferencias y lo dicho por el asistente", async () => {
    await extractFactsFromDay(DIA_TIPICO);
    const system = ultimaLlamada!.system;
    expect(system).toContain("CIFRAS");
    expect(system).toContain("INFERENCIAS");
    expect(system).toContain("ASISTENTE");
  });

  it("un día sin mensajes del usuario no gasta una llamada", async () => {
    const out = await extractFactsFromDay([
      { role: "assistant", content: "Te mandé tu resumen semanal." },
    ]);
    expect(out).toEqual([]);
    expect(ultimaLlamada).toBeNull();
  });

  it("sin provider (sin API key) devuelve vacío, no rompe", async () => {
    hayProvider = false;
    await expect(extractFactsFromDay(DIA_TIPICO)).resolves.toEqual([]);
  });

  it("una respuesta ilegible es 'hoy no hubo hechos', no una excepción", async () => {
    respuestaDelModelo = "perdón, no entendí la instrucción";
    await expect(extractFactsFromDay(DIA_TIPICO)).resolves.toEqual([]);
  });
});

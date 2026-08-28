/**
 * MEMORIA DE HECHOS — el núcleo puro.
 *
 * Lo que se prueba acá es exactamente lo que no puede fallar aunque el LLM tenga un mal día: qué
 * entra, qué NUNCA entra, cuándo un hecho repetido no se duplica, cuándo uno nuevo da de baja al
 * viejo, y que el prompt no crezca con la memoria del usuario.
 */
import { describe, it, expect } from "vitest";

import {
  MAX_MEMORY_INJECTED,
  contradice,
  detectarPedidoDeOlvido,
  esMismoHecho,
  memoryLines,
  normalizeFact,
  parseExtractedFacts,
  planMemoryWrites,
  planOverflow,
  resolverOlvido,
  tieneCifraFinanciera,
  turnosParaExtractor,
  type StoredFact,
} from "@/lib/ai/memory-facts";
import { buildSystemPrompt, type FinancialContext } from "@/lib/ai/system-prompt";

/** Hecho ya guardado, con lo mínimo para las pruebas. */
function guardado(id: string, fact: string, updatedAt = "2026-08-01T00:00:00.000Z"): StoredFact {
  return {
    id,
    fact,
    category: "otro",
    status: "activa",
    updatedAt,
    createdAt: updatedAt,
  };
}

describe("normalización y equivalencia de hechos", () => {
  it("ignora acentos, mayúsculas y puntuación", () => {
    expect(normalizeFact("Quiere mudarse a ESCAZÚ, en 2027.")).toBe(
      "quiere mudarse a escazu en 2027",
    );
  });

  it("reconoce el mismo hecho dicho de otra forma", () => {
    expect(esMismoHecho("Su esposa se llama Fernanda", "su ESPOSA se llama fernanda.")).toBe(true);
    // Contención: el segundo es el primero con más detalle.
    expect(
      esMismoHecho("Su esposa se llama Fernanda", "Su esposa se llama Fernanda y es médica"),
    ).toBe(true);
  });

  it("no confunde dos hechos distintos de la misma categoría", () => {
    expect(esMismoHecho("Su esposa se llama Fernanda", "Su hija se llama Camila")).toBe(false);
    expect(esMismoHecho("Trabaja en construcción", "Quiere mudarse a Escazú")).toBe(false);
  });
});

describe("la guarda dura: nada financiero-numérico", () => {
  it("bloquea montos en cualquier forma", () => {
    for (const t of [
      "Gastó ₡50.000 en el súper",
      "Gana $3,500 al mes",
      "Aporta 50 mil por mes a su meta",
      "Su saldo es 1250000",
      "Tiene 15% de rendimiento",
      "Ahorró 2 millones de colones",
      "Su renta es de 450 dólares",
    ]) {
      expect(tieneCifraFinanciera(t), t).toBe(true);
    }
  });

  it("deja pasar un AÑO: no es una cifra financiera", () => {
    expect(tieneCifraFinanciera("Quiere mudarse a Escazú en 2027")).toBe(false);
    expect(tieneCifraFinanciera("Se casó en 1998")).toBe(false);
  });

  it("deja pasar un TEMA financiero sin números (que es justo lo que sí vale la pena recordar)", () => {
    expect(tieneCifraFinanciera("No toca el fondo de paz bajo ninguna circunstancia")).toBe(false);
    expect(tieneCifraFinanciera("Prefiere no invertir en cripto")).toBe(false);
  });
});

describe("parseExtractedFacts · lo que el extractor puede y no puede guardar", () => {
  it("guarda un hecho personal con su categoría", () => {
    const out = parseExtractedFacts(
      '[{"fact":"Su esposa se llama Fernanda","category":"familia"}]',
    );
    expect(out).toEqual([{ fact: "Su esposa se llama Fernanda", category: "familia" }]);
  });

  it("NO guarda un hecho con una cifra, aunque el modelo lo devuelva bien formado", () => {
    const out = parseExtractedFacts(
      '[{"fact":"Su esposa se llama Fernanda","category":"familia"},' +
        '{"fact":"Gastó ₡50.000 en el súper","category":"otro"}]',
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.fact).toContain("Fernanda");
  });

  it("cae a 'otro' con una categoría inventada, y descarta basura sin romperse", () => {
    expect(parseExtractedFacts('[{"fact":"Es diseñador","category":"inventada"}]')).toEqual([
      { fact: "Es diseñador", category: "otro" },
    ]);
    expect(parseExtractedFacts("no soy JSON")).toEqual([]);
    expect(parseExtractedFacts("[")).toEqual([]);
    expect(parseExtractedFacts("[{}]")).toEqual([]);
  });

  it("no devuelve dos veces el mismo hecho", () => {
    const out = parseExtractedFacts(
      '[{"fact":"Su esposa se llama Fernanda","category":"familia"},' +
        '{"fact":"Su esposa se llama fernanda.","category":"familia"}]',
    );
    expect(out).toHaveLength(1);
  });
});

describe("turnosParaExtractor · el asistente no es una fuente de hechos", () => {
  it("descarta estructuralmente lo que dijo el asistente", () => {
    const bloque = turnosParaExtractor([
      { role: "user", content: "mi esposa se llama Fernanda" },
      { role: "assistant", content: "Tu esposa Fernanda podría abrir una cuenta conjunta." },
      { role: "assistant", content: "Tenés tres hijos según lo que veo." },
    ]);
    expect(bloque).toBe("mi esposa se llama Fernanda");
    expect(bloque).not.toContain("cuenta conjunta");
    expect(bloque).not.toContain("tres hijos");
  });

  it("cuando hay que recortar, sobrevive lo más reciente", () => {
    const bloque = turnosParaExtractor(
      [
        { role: "user", content: "viejo" },
        { role: "user", content: "nuevo" },
      ],
      6,
    );
    expect(bloque).toBe("nuevo");
  });
});

describe("planMemoryWrites · dedup, contradicción y alta", () => {
  it("un hecho nuevo se inserta", () => {
    const plan = planMemoryWrites(
      [],
      [{ fact: "Su esposa se llama Fernanda", category: "familia" }],
    );
    expect(plan.inserts).toHaveLength(1);
    expect(plan.touches).toEqual([]);
    expect(plan.archives).toEqual([]);
  });

  it("un hecho repetido re-confirma el existente y NO duplica", () => {
    const plan = planMemoryWrites(
      [guardado("f1", "Su esposa se llama Fernanda")],
      [{ fact: "su esposa se llama Fernanda.", category: "familia" }],
    );
    expect(plan.inserts).toEqual([]);
    expect(plan.touches).toEqual(["f1"]);
  });

  it("repetido dos veces DENTRO de la misma corrida entra una sola vez", () => {
    const plan = planMemoryWrites(
      [],
      [
        { fact: "Su esposa se llama Fernanda", category: "familia" },
        { fact: "Su esposa se llama Fernanda", category: "familia" },
      ],
    );
    expect(plan.inserts).toHaveLength(1);
  });

  it("una contradicción ARCHIVA el viejo y guarda el nuevo", () => {
    const plan = planMemoryWrites(
      [guardado("f1", "Quiere mudarse a Escazú en 2027")],
      [{ fact: "Ya no quieren mudarse", category: "meta_vida" }],
    );
    expect(plan.archives).toEqual(["f1"]);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0]!.fact).toBe("Ya no quieren mudarse");
  });

  it("una negación de OTRO tema no archiva un hecho que no tiene que ver", () => {
    const plan = planMemoryWrites(
      [guardado("f1", "Su esposa se llama Fernanda")],
      [{ fact: "Ya no trabaja en construcción", category: "trabajo" }],
    );
    expect(plan.archives).toEqual([]);
    expect(plan.inserts).toHaveLength(1);
  });

  it("no toca los archivados: solo compite contra lo activo", () => {
    const viejo = {
      ...guardado("f1", "Su esposa se llama Fernanda"),
      status: "archivada" as const,
    };
    const plan = planMemoryWrites(
      [viejo],
      [{ fact: "Su esposa se llama Fernanda", category: "familia" }],
    );
    expect(plan.touches).toEqual([]);
    expect(plan.inserts).toHaveLength(1);
  });
});

describe("planOverflow · el tope archiva lo más viejo, no lo re-confirmado", () => {
  it("nada que archivar por debajo del tope", () => {
    expect(planOverflow([guardado("a", "x")], 3)).toEqual([]);
  });

  it("cae el que hace más tiempo que no se re-confirma", () => {
    const activos = [
      guardado("viejo", "a", "2026-01-01T00:00:00.000Z"),
      guardado("medio", "b", "2026-05-01T00:00:00.000Z"),
      guardado("nuevo", "c", "2026-08-01T00:00:00.000Z"),
    ];
    expect(planOverflow(activos, 2)).toEqual(["viejo"]);
  });
});

describe("'olvidá eso' · carril determinista de baja", () => {
  const activos = [
    guardado("f1", "Su esposa se llama Fernanda", "2026-08-01T00:00:00.000Z"),
    guardado("f2", "Quiere mudarse a Escazú en 2027", "2026-08-10T00:00:00.000Z"),
  ];

  it("detecta el pedido con y sin objeto", () => {
    expect(detectarPedidoDeOlvido("olvidá eso")).toEqual({ target: "" });
    expect(detectarPedidoDeOlvido("olvidá lo de Escazú")?.target).toContain("Escazú");
    expect(detectarPedidoDeOlvido("no recuerdes que me quiero mudar")).not.toBeNull();
  });

  it("NO se dispara con una operación del libro diario", () => {
    expect(detectarPedidoDeOlvido("borrá el gasto de ayer")).toBeNull();
    expect(detectarPedidoDeOlvido("¿cuánto gasté en comida?")).toBeNull();
  });

  it("resuelve el hecho nombrado", () => {
    const pedido = detectarPedidoDeOlvido("olvidá lo de Escazú")!;
    expect(resolverOlvido(pedido.target, activos)?.id).toBe("f2");
  });

  it("'olvidá eso' cae en el más reciente (y la tarjeta lo muestra antes de confirmar)", () => {
    const pedido = detectarPedidoDeOlvido("olvidá eso")!;
    expect(resolverOlvido(pedido.target, activos)?.id).toBe("f2");
  });

  it("no adivina: sin coincidencia no devuelve nada", () => {
    expect(resolverOlvido("bicicleta de montaña", activos)).toBeNull();
  });

  it("sin memoria no hay nada que olvidar", () => {
    expect(resolverOlvido("", [])).toBeNull();
  });
});

describe("inyección al contexto · el prompt no crece con la memoria", () => {
  const veinte = Array.from({ length: 20 }, (_, i) => guardado(`f${i}`, `Hecho número ${i}`));
  /** Contexto mínimo válido: solo interesa el bloque de memoria. */
  const ctx = (userMemory?: string[]): FinancialContext => ({
    currency: "CRC",
    ...(userMemory ? { userMemory } : {}),
  });

  it("memoryLines corta en MAX_MEMORY_INJECTED", () => {
    expect(memoryLines(veinte)).toHaveLength(MAX_MEMORY_INJECTED);
  });

  it("el system prompt inyecta como máximo esos 15 y ninguno más", () => {
    const prompt = buildSystemPrompt(ctx(memoryLines(veinte)));
    expect(prompt).toContain("Hecho número 0");
    expect(prompt).toContain(`Hecho número ${MAX_MEMORY_INJECTED - 1}`);
    expect(prompt).not.toContain(`Hecho número ${MAX_MEMORY_INJECTED}`);
    expect(prompt).not.toContain("Hecho número 19");
  });

  it("sin memoria, el prompt no cambia (nada de bloques vacíos)", () => {
    const conMemoria = buildSystemPrompt(ctx(["Su esposa se llama Fernanda"]));
    const sinMemoria = buildSystemPrompt(ctx());
    expect(sinMemoria).not.toContain("CONVERSACIONES ANTERIORES");
    expect(conMemoria).toContain("Su esposa se llama Fernanda");
    expect(conMemoria.length).toBeGreaterThan(sinMemoria.length);
  });

  it("lleva la regla de uso: se usa, no se recita ni se inventa", () => {
    const prompt = buildSystemPrompt(ctx(["Su esposa se llama Fernanda"]));
    expect(prompt).toContain("REGLA DE LA MEMORIA");
    expect(prompt).toMatch(/PROHIBIDO recitarlo/);
    expect(prompt).toMatch(/inventar, deducir o completar/);
  });
});

describe("contradice · la condición doble", () => {
  it("pide negación Y mismo tema", () => {
    expect(contradice("Ya no quieren mudarse", "Quiere mudarse a Escazú")).toBe(true);
    // Mismo tema pero sin negación: es un hecho nuevo, no una baja.
    expect(contradice("Quiere mudarse a Cartago", "Quiere mudarse a Escazú")).toBe(false);
    // Negación pero de otro tema.
    expect(contradice("Ya no fuma", "Quiere mudarse a Escazú")).toBe(false);
  });
});

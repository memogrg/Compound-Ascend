import { describe, it, expect } from "vitest";

import {
  quoteExcerpt,
  annotateReply,
  buildQuotedContext,
  QUOTE_MISSING_TEXT,
  QUOTE_EXCERPT_MAX,
} from "@/lib/ai/chat-quote";

describe("quoteExcerpt · fragmento de una línea para la cita", () => {
  it("aplana saltos y markdown de énfasis (la cita no se renderiza como markdown)", () => {
    const out = quoteExcerpt("Tenés **1.250 JUP**.\n\nMirá [acá](https://x).");
    expect(out).toBe("Tenés 1.250 JUP. Mirá acá.");
    expect(out).not.toMatch(/\*\*|\n/);
    expect(out).not.toContain("https://x");
  });

  it("un bloque de código no se cita crudo", () => {
    expect(quoteExcerpt("mirá esto ```const x = 1``` listo")).toBe("mirá esto [bloque] listo");
  });

  it("un texto corto se devuelve tal cual, sin elipsis", () => {
    expect(quoteExcerpt("¿y el mes pasado?")).toBe("¿y el mes pasado?");
  });

  it("recorta con elipsis y sin partir una palabra al medio", () => {
    const largo = "palabra ".repeat(40).trim();
    const out = quoteExcerpt(largo);
    expect(out.length).toBeLessThanOrEqual(QUOTE_EXCERPT_MAX + 1); // +1 por la elipsis
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/pala…$/); // cortó en el espacio, no dentro de la palabra
  });

  it("una sola palabra larguísima se corta igual (no puede respetar el espacio)", () => {
    const out = quoteExcerpt("a".repeat(300));
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBe(QUOTE_EXCERPT_MAX + 1);
  });
});

describe("annotateReply · el modelo tiene que saber a QUÉ se responde", () => {
  it("marca el mensaje citado y conserva el mensaje del usuario al final", () => {
    const out = annotateReply("¿y el mes pasado?", {
      role: "assistant",
      content: "Gastaste ₡320.000 en comida este mes.",
    });
    expect(out).toContain("RESPONDIENDO");
    expect(out).toContain("Gastaste ₡320.000 en comida este mes.");
    expect(out.trimEnd().endsWith("¿y el mes pasado?")).toBe(true);
  });

  it("distingue si el citado es del asesor o del propio usuario", () => {
    expect(annotateReply("x", { role: "assistant", content: "c" })).toContain("tuyo (el asesor)");
    expect(annotateReply("x", { role: "user", content: "c" })).toContain("suyo");
  });

  it("cita con más aire que la UI: el modelo necesita el contenido, no una etiqueta", () => {
    const largo = "dato ".repeat(60).trim();
    const out = annotateReply("¿?", { role: "assistant", content: largo });
    expect(out.length).toBeGreaterThan(QUOTE_EXCERPT_MAX * 2);
  });
});

describe("buildQuotedContext · el par citado se agrega solo si falta", () => {
  const par = [
    { role: "user" as const, content: "¿cuánto gasté en comida?" },
    { role: "assistant" as const, content: "₡320.000 este mes." },
  ];

  it("fuera de la ventana reciente: entra completo, en orden", () => {
    const out = buildQuotedContext(par, new Set<string>(), ["a", "b"]);
    expect(out).toEqual([
      { role: "user", content: "¿cuánto gasté en comida?" },
      { role: "assistant", content: "₡320.000 este mes." },
    ]);
  });

  it("ya presente en la ventana: NO se duplica (el modelo creería que se dijo dos veces)", () => {
    expect(buildQuotedContext(par, new Set(["a", "b"]), ["a", "b"])).toEqual([]);
  });

  it("mitad y mitad: entra solo lo que falta", () => {
    const out = buildQuotedContext(par, new Set(["b"]), ["a", "b"]);
    expect(out).toEqual([{ role: "user", content: "¿cuánto gasté en comida?" }]);
  });
});

describe("aviso de cita perdida", () => {
  it("es una frase entendible, no un código de error", () => {
    expect(QUOTE_MISSING_TEXT).toBe("Ese mensaje ya no está en tu historial.");
  });
});

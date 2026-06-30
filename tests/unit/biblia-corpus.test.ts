import { describe, it, expect } from "vitest";
import {
  BIBLIA_SEED_ENTRIES,
  TOPIC_CHUNKS,
  EMOTION_RULES,
  PATRIMONIO_GUIDANCE,
  chunkDocument,
} from "@/lib/ai/biblia-corpus";

describe("BIBLIA_SEED_ENTRIES", () => {
  it("no está vacío y cubre las 3 fuentes con sus tags", () => {
    expect(BIBLIA_SEED_ENTRIES.length).toBe(
      TOPIC_CHUNKS.length +
        Object.keys(EMOTION_RULES).length +
        Object.keys(PATRIMONIO_GUIDANCE).length,
    );
    const tags = new Set(BIBLIA_SEED_ENTRIES.map((e) => e.tag));
    expect(tags).toEqual(new Set(["tema", "emocion", "patrimonio"]));
    const byTag = (t: string) => BIBLIA_SEED_ENTRIES.filter((e) => e.tag === t).length;
    expect(byTag("tema")).toBe(TOPIC_CHUNKS.length);
    expect(byTag("emocion")).toBe(Object.keys(EMOTION_RULES).length);
    expect(byTag("patrimonio")).toBe(Object.keys(PATRIMONIO_GUIDANCE).length);
  });

  it("toda entrada tiene contenido no vacío", () => {
    expect(BIBLIA_SEED_ENTRIES.every((e) => e.content.trim().length > 0)).toBe(true);
  });
});

describe("chunkDocument", () => {
  it("documento vacío → sin chunks", () => {
    expect(chunkDocument("")).toEqual([]);
    expect(chunkDocument("   \n\n  ")).toEqual([]);
  });

  it("párrafo largo (>max) → divide por oraciones, respeta el tamaño y NO corta oraciones", () => {
    const para = Array.from(
      { length: 50 },
      (_, i) => `Esta es la oración número ${i} con texto de relleno suficiente.`,
    ).join(" ");
    const chunks = chunkDocument(para);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(1000);
      expect(c.trim().endsWith(".")).toBe(true); // termina en límite de oración
    }
    // No se pierde ni se duplica contenido: cada oración aparece una vez.
    const joined = chunks.join(" ");
    for (let i = 0; i < 50; i++) expect(joined).toContain(`oración número ${i} `);
  });

  it("múltiples párrafos cortos → se acumulan sin pasar el máximo", () => {
    const doc = Array.from({ length: 12 }, (_, i) => `Párrafo número ${i} bien corto.`).join(
      "\n\n",
    );
    const chunks = chunkDocument(doc);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1000);
  });
});

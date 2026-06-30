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
      expect(c.length).toBeLessThanOrEqual(1200);
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
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(1200);
  });
});

describe("chunkDocument · heading-aware (markdown)", () => {
  it("antepone la ruta de encabezados (H1 > H2) como contexto en cada chunk de la sección", () => {
    const doc = [
      "# Dinero",
      "",
      "## Deudas",
      "",
      "Atacá primero la deuda más cara y celebrá las victorias visibles.",
      "",
      "## Ahorro",
      "",
      "Automatizá el ahorro para no depender de la fuerza de voluntad.",
    ].join("\n");
    const chunks = chunkDocument(doc);
    const deuda = chunks.find((c) => c.includes("más cara"));
    const ahorro = chunks.find((c) => c.includes("Automatizá"));
    expect(deuda?.startsWith("Dinero > Deudas\n\n")).toBe(true);
    expect(ahorro?.startsWith("Dinero > Ahorro\n\n")).toBe(true);
  });

  it("encabezado huérfano (sin cuerpo) se fusiona en la ruta de la sección siguiente", () => {
    const doc = [
      "# Curso",
      "## Módulo 1",
      "### Lección",
      "",
      "El contenido real de la lección vive bajo tres encabezados anidados sin cuerpo intermedio.",
    ].join("\n");
    const chunks = chunkDocument(doc);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.startsWith("Curso > Módulo 1 > Lección\n\n")).toBe(true);
  });

  it("respeta el cap (~1200) sin cortar oraciones y descarta fragmentos < 40 chars", () => {
    const body = Array.from(
      { length: 60 },
      (_, i) => `Oración ${i} con suficiente texto de relleno para el chunk.`,
    ).join(" ");
    const doc = `# Sección\n\n${body}\n\n## Vacía\n\n.`; // "." → fragmento corto, se descarta
    const chunks = chunkDocument(doc);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(1200);
      expect(c.trim().endsWith(".")).toBe(true);
      expect(c.length).toBeGreaterThanOrEqual(40);
    }
  });
});

import { describe, it, expect } from "vitest";
import { formatButtonsAsText } from "@/lib/whatsapp/provider";

describe("formatButtonsAsText", () => {
  it("devuelve el cuerpo tal cual cuando no hay opciones", () => {
    expect(formatButtonsAsText("Hola")).toBe("Hola");
    expect(formatButtonsAsText("Hola", [])).toBe("Hola");
  });

  it("numera las opciones como fallback de botones", () => {
    const out = formatButtonsAsText("¿Lo agrego?", [
      { id: "yes", title: "Sí" },
      { id: "edit", title: "Editar" },
    ]);
    expect(out).toBe("¿Lo agrego?\n\n1. Sí\n2. Editar");
  });
});

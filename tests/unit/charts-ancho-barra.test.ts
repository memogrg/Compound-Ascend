/**
 * El ancho de barra CALCULADO, que es lo que permite un hueco constante.
 */
import { describe, it, expect } from "vitest";

import { anchoDeBarra } from "@/components/charts/core/usar-ancho";

describe("anchoDeBarra", () => {
  it("a 1280 el tope de 24 px manda, y es lo que deja hueco de sobra", () => {
    // Área de dibujo ≈ 1180 px, 6 meses, 2 series: la banda da para barras de 40 px.
    expect(anchoDeBarra(1180, 6, 2)).toBe(24);
  });

  it("a 900 todavía llega al tope; a 390 no", () => {
    // Esto corrige lo que yo suponía: con el ancho CALCULADO, a 900 la barra sigue siendo
    // de 24 px (y con hueco de 2). Antes salía de 17 porque el recorte se comía el sobrante.
    expect(anchoDeBarra(800, 6, 2)).toBe(24);
    // A 390 el espacio ya no da para 24 y la barra encoge, que es lo correcto.
    expect(anchoDeBarra(300, 6, 2)).toBeLessThan(24);
    expect(anchoDeBarra(300, 6, 2)).toBeGreaterThan(0);
  });

  it("el grupo cabe en su banda: dos barras más el hueco nunca la desbordan", () => {
    for (const w of [300, 420, 640, 800, 900, 1180, 1600]) {
      const b = anchoDeBarra(w, 6, 2);
      const banda = w / 6;
      expect(
        b * 2 + 2,
        `a ${w}px: 2×${b}+2 no cabe en la banda de ${banda.toFixed(1)}`,
      ).toBeLessThanOrEqual(banda);
    }
  });

  it("nunca pasa del máximo", () => {
    for (const w of [1000, 2000, 5000]) expect(anchoDeBarra(w, 3, 2)).toBeLessThanOrEqual(24);
  });

  it("sin medida todavía devuelve 0, para que Recharts decida", () => {
    expect(anchoDeBarra(0, 6, 2)).toBe(0);
    expect(anchoDeBarra(-10, 6, 2)).toBe(0);
    expect(anchoDeBarra(500, 0, 2)).toBe(0);
  });
});

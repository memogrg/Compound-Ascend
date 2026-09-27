/**
 * Las DOS pantallas de patrimonio fechan la serie cuando no llega hasta hoy.
 *
 * Desde que la escritura del snapshot salió de la carga de pantalla, la curva puede terminar
 * ayer —o la semana pasada, si el barrido falló— y sin rótulo se lee como si llegara hasta hoy.
 * Era la mitad más fácil de olvidar: el rótulo se puso primero en `/m/patrimonio`, que es la
 * pantalla que ESCRIBÍA, y la web se quedó sin él aunque lee la misma serie.
 *
 * Se comprueba sobre el ARCHIVO y no renderizando, porque las dos son componentes de servidor
 * enredados con Supabase: lo que puede romperse de verdad es que una de las dos deje de pasar el
 * rótulo, y eso se ve acá.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect } from "vitest";

import { etiquetaUltimoDato } from "@/modules/wealth/engine/ultimo-dato";

const raiz = process.cwd();
const leer = (p: string) => readFileSync(path.join(raiz, p), "utf8");

const PANTALLAS = [
  ["web", "src/app/(dashboard)/patrimonio/page.tsx"],
  ["móvil", "src/app/(mobile)/m/(app)/patrimonio/page.tsx"],
] as const;

describe("«Datos al <fecha>» en las dos pantallas de patrimonio", () => {
  for (const [nombre, archivo] of PANTALLAS) {
    it(`${nombre} calcula el rótulo con el hoy del USUARIO`, () => {
      const src = leer(archivo);
      expect(src).toContain("etiquetaUltimoDato");
      // Con `userToday()` —zona del perfil— y nunca con `new Date()`, que en Vercel es UTC.
      expect(src).toMatch(
        /etiquetaUltimoDato\([\s\S]{0,80}userToday|userToday[\s\S]{0,200}etiquetaUltimoDato/,
      );
      expect(src).not.toMatch(/etiquetaUltimoDato\([^)]*new Date\(\)/);
    });
  }

  it("y el rótulo dice «al <fecha>», no «ayer»", () => {
    expect(etiquetaUltimoDato([{ date: "2026-09-17" }], "2026-09-18")).toBe(
      "Datos al 17 de septiembre",
    );
    expect(etiquetaUltimoDato([{ date: "2026-09-18" }], "2026-09-18")).toBeNull();
  });

  it("la vista del portafolio recibe el rótulo y lo pinta", () => {
    const src = leer("src/modules/wealth/components/portfolio-view.tsx");
    expect(src).toContain("ultimoDato");
    // Que llegue como prop no basta: tiene que RENDERIZARSE.
    expect(src).toMatch(/\{ultimoDato\}/);
  });
});

/**
 * Los items de la paleta. Lo que se fija acá es que la paleta NO se desincronice del modelo:
 * si mañana alguien agrega una pestaña a `nav-v2` y la paleta no la ofrece, este test lo dice.
 */
import { describe, it, expect } from "vitest";

import { construirItems, esRutaWeb } from "@/lib/command-palette/items";
import { rutasDelModelo } from "@/lib/constants/nav-v2";

const items = construirItems();

describe("cobertura del modelo", () => {
  it("cada ruta WEB del modelo aparece exactamente una vez", () => {
    // Solo las web: `rutasDelModelo()` mezcla escritorio y móvil, y la paleta vive en el
    // shell web — ofrecer `/m/metas` desde el escritorio llevaría a la app móvil sin querer.
    const web = rutasDelModelo().filter(esRutaWeb);
    const enPaleta = items.map((i) => i.ruta);
    const faltan = web.filter((r) => !enPaleta.includes(r));
    expect(faltan, "rutas del modelo que la paleta no ofrece").toEqual([]);

    // La unicidad se exige a la NAVEGACIÓN. Las acciones pueden compartir destino: «Registrar
    // gasto» y «Registrar ingreso» llevan las dos a `/transacciones` porque el alta vive en un
    // modal sin deep-link propio (backlog: `?new=expense|income`).
    const navegacion = items.filter((i) => i.grupo !== "Acciones").map((i) => i.ruta);
    const duplicadas = web.filter((r) => navegacion.filter((x) => x === r).length > 1);
    expect(duplicadas, "rutas de navegación ofrecidas más de una vez").toEqual([]);
  });

  it("NO ofrece ninguna ruta de la app móvil", () => {
    expect(items.filter((i) => !esRutaWeb(i.ruta)).map((i) => i.ruta)).toEqual([]);
  });

  it("esRutaWeb no confunde /mi-… ni /mis-… con /m/", () => {
    // `startsWith("/m")` a secas marcaría estas como móviles y las sacaría de la paleta.
    expect(esRutaWeb("/mi-base-financiera")).toBe(true);
    expect(esRutaWeb("/mis-acciones")).toBe(true);
    expect(esRutaWeb("/m")).toBe(false);
    expect(esRutaWeb("/m/metas")).toBe(false);
  });
});

describe("acciones rápidas", () => {
  const acciones = items.filter((i) => i.grupo === "Acciones");

  it("son las 6, con las rutas que ya usa el repo", () => {
    expect(acciones.map((a) => [a.etiqueta, a.ruta])).toEqual([
      ["Nueva meta", "/control-financiero?new=goal"],
      ["Nueva inversión", "/patrimonio?new=holding"],
      ["Nueva deuda", "/deudas?new=debt"],
      ["Nueva póliza", "/patrimonio/proteccion?new=policy"],
      ["Registrar gasto", "/transacciones"],
      ["Registrar ingreso", "/transacciones"],
    ]);
  });

  it("van primero: se busca más lo que se quiere HACER que adónde ir", () => {
    expect(items.slice(0, acciones.length).every((i) => i.grupo === "Acciones")).toBe(true);
  });

  it("los deep-links `?new=` coinciden con los CTA de los frascos vinculados", async () => {
    // Si alguien cambia la ruta en expense-jars y no acá, la paleta abriría una pantalla
    // donde el formulario no se abre. Se contrasta con el fuente, no con una copia.
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const fuente = readFileSync(
      path.join(process.cwd(), "src/modules/financial-base/engine/expense-jars.ts"),
      "utf8",
    );
    for (const a of acciones) {
      if (!a.ruta.includes("?new=")) continue;
      expect(fuente, `${a.etiqueta} → ${a.ruta}`).toContain(a.ruta);
    }
  });
});

describe("forma de los items", () => {
  it("no hay ids duplicados", () => {
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("todos tienen etiqueta, grupo y ruta no vacíos", () => {
    for (const i of items) {
      expect(i.etiqueta.length, i.id).toBeGreaterThan(0);
      expect(i.grupo.length, i.id).toBeGreaterThan(0);
      expect(i.ruta.startsWith("/"), i.id).toBe(true);
    }
  });

  it("los grupos siguen el orden del sidebar", () => {
    const vistos: string[] = [];
    for (const i of items) if (vistos[vistos.length - 1] !== i.grupo) vistos.push(i.grupo);
    expect(vistos).toEqual([
      "Acciones",
      "Hoy",
      "Flujo",
      "Planes",
      "Patrimonio",
      "Asesor",
      "Configuración",
    ]);
  });

  it("cada grupo aparece una sola vez (no se reabre más abajo)", () => {
    const grupos = items.map((i) => i.grupo);
    const bloques: string[] = [];
    for (const g of grupos) if (bloques[bloques.length - 1] !== g) bloques.push(g);
    expect(new Set(bloques).size).toBe(bloques.length);
  });
});

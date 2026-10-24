/**
 * El filtro de la paleta: lo que decide qué ve la persona mientras escribe.
 */
import { describe, it, expect } from "vitest";

import { filtrar, normalizar } from "@/lib/command-palette/filter";
import { construirItems, type ItemPaleta } from "@/lib/command-palette/items";

const items = construirItems();
const etiquetas = (r: ItemPaleta[]) => r.map((x) => x.etiqueta);

describe("normalizar", () => {
  it("quita tildes y baja a minúsculas", () => {
    expect(normalizar("Inversión")).toBe("inversion");
    expect(normalizar("PÓLIZA")).toBe("poliza");
    expect(normalizar("  Protección  ")).toBe("proteccion");
  });

  it("la ñ también se aplana, y para buscar está bien", () => {
    // NFD descompone «ñ» en n + tilde combinante y la regex la borra. En un buscador eso se
    // QUIERE: quien teclea «ano» encuentra «año», igual que quien teclea «poliza» encuentra
    // «póliza». Sería un problema si esto se usara para mostrar texto, y no es el caso.
    expect(normalizar("Año")).toBe("ano");
  });

  it("conserva los espacios internos", () => {
    expect(normalizar("Tipo de cambio")).toBe("tipo de cambio");
  });
});

describe("consulta vacía", () => {
  it("devuelve TODOS los items, en orden de definición", () => {
    expect(filtrar(items, "")).toEqual(items);
    expect(filtrar(items, "   ")).toEqual(items);
  });

  it("no se recorta por `max`: al abrir, la paleta es el menú completo", () => {
    expect(filtrar(items, "", 3)).toHaveLength(items.length);
  });
});

describe("ranking", () => {
  it('"deu" pone Deudas primero, antes de lo que solo la menciona', () => {
    const r = filtrar(items, "deu");
    expect(r[0]?.etiqueta).toBe("Deudas");
    // «Nueva deuda» también casa, pero por `includes`, no por `startsWith`.
    expect(etiquetas(r)).toContain("Nueva deuda");
    expect(etiquetas(r).indexOf("Deudas")).toBeLessThan(etiquetas(r).indexOf("Nueva deuda"));
  });

  it("un sinónimo encuentra el item aunque no esté en la etiqueta", () => {
    expect(etiquetas(filtrar(items, "hipoteca"))).toContain("Deudas");
    expect(etiquetas(filtrar(items, "salario"))).toContain("Ingresos");
    expect(etiquetas(filtrar(items, "seguros"))).toContain("Protección");
  });

  it("la etiqueta gana al sinónimo con la misma consulta", () => {
    // "meta" es etiqueta de «Metas» y sinónimo de otros: Metas va primero.
    expect(filtrar(items, "meta")[0]?.etiqueta).toBe("Metas");
  });

  it("es insensible a acentos y mayúsculas en los dos sentidos", () => {
    const a = etiquetas(filtrar(items, "inversion"));
    const b = etiquetas(filtrar(items, "INVERSIÓN"));
    expect(a).toEqual(b);
    expect(a).toContain("Inversiones");
    expect(etiquetas(filtrar(items, "proteccion"))).toContain("Protección");
  });

  it("el orden es estable: misma consulta, mismo resultado", () => {
    expect(etiquetas(filtrar(items, "a"))).toEqual(etiquetas(filtrar(items, "a")));
  });
});

describe("corte y vacío", () => {
  it("respeta `max` cuando hay consulta", () => {
    expect(filtrar(items, "a", 3)).toHaveLength(3);
    expect(filtrar(items, "a", 1)).toHaveLength(1);
  });

  it("el corte se queda con los MEJORES, no con los primeros", () => {
    const top = filtrar(items, "deu", 1);
    expect(top).toHaveLength(1);
    expect(top[0]?.etiqueta).toBe("Deudas");
  });

  it("sin resultados devuelve []", () => {
    expect(filtrar(items, "xyzzy")).toEqual([]);
    expect(filtrar(items, "zzzzzzzz")).toEqual([]);
  });
});

describe("agrupación", () => {
  /** Encabezados en el orden en que se pintarían. */
  const bloques = (r: ItemPaleta[]) => {
    const out: string[] = [];
    for (const i of r) if (out[out.length - 1] !== i.grupo) out.push(i.grupo);
    return out;
  };

  it("ninguna consulta reabre un grupo más abajo", () => {
    // Barrido de todas las consultas de 1 y 2 letras. Sin agrupar, «a» daba
    // «Hoy → Configuración → Acciones → Hoy → Planes → … → Acciones»: la puntuación
    // intercala los grupos y la lista se lee como si estuviera rota.
    const abc = "abcdefghijklmnopqrstuvwxyz".split("");
    const consultas = [...abc];
    for (const a of abc) for (const b of abc) consultas.push(a + b);

    const rotas = consultas.filter((q) => {
      const b = bloques(filtrar(items, q));
      return new Set(b).size !== b.length;
    });
    expect(rotas, "consultas cuya lista reabre un grupo").toEqual([]);
  });

  it("el grupo del MEJOR resultado va primero", () => {
    // "deu" puntúa más alto «Deudas» (Planes) que «Nueva deuda» (Acciones), aunque las
    // acciones estén antes en el orden de definición.
    expect(bloques(filtrar(items, "deu"))).toEqual(["Planes", "Acciones"]);
  });

  it("agrupar no cambia cuántos resultados hay", () => {
    for (const q of ["a", "e", "in", "de"]) {
      const r = filtrar(items, q, 5);
      expect(r.length, q).toBeLessThanOrEqual(5);
      expect(new Set(r.map((x) => x.id)).size, q).toBe(r.length);
    }
  });
});

/**
 * La tabla y el nombre de una dona, construidos desde LAS MISMAS filas que dibuja el anillo.
 *
 * Lo que puede mentir acá son los números y el agrupamiento. Si la tabla se armara con los datos
 * crudos y el anillo con las filas de la leyenda, en modo `lista` la tabla tendría veinticinco
 * categorías y el anillo seis más «Otras N»: dos respuestas distintas a la misma pregunta en la
 * misma tarjeta. Y lo que se agrupó tiene que poder abrirse desde la tabla, o quien la abre para
 * ver los números acaba devuelto al gráfico a pulsar «Ver todas».
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

import { describirDona, filaNormalizada, filasLeyenda, tablaDona } from "@/components/charts/core";

const dinero = (v: number) => `₡${v}`;

/** Nueve bloques como los de la taxonomía de gasto, con montos distintos. */
const NUEVE = Array.from({ length: 9 }, (_, i) => ({
  name: `Bloque ${i + 1}`,
  value: (i + 1) * 100,
  color: `var(--chart-${(i % 6) + 1})`,
}));

describe("tablaDona", () => {
  it("una fila por fila de la leyenda, con monto y porcentaje", () => {
    const leyenda = filasLeyenda(NUEVE, { modo: "taxonomia" });
    const tabla = tablaDona(leyenda, dinero, "Bloque");

    expect(tabla.encabezados).toEqual(["Bloque", "Monto", "% del total"]);
    expect(tabla.filas).toHaveLength(9);
    expect(tabla.filas[0]).toEqual({ celdas: ["Bloque 1", "₡100", "2 %"] });
  });

  it("los porcentajes de la tabla suman 100 exactos", () => {
    // Es la misma garantía que da la leyenda, y tiene que seguir dándola después de pasar por la
    // tabla: una tarjeta cuyas partes no suman el todo se lee como un error de la app.
    const tabla = tablaDona(filasLeyenda(NUEVE, { modo: "taxonomia" }), dinero);
    const suma = tabla.filas
      .map((f) => Number(filaNormalizada(f).celdas[2]!.toString().replace(" %", "")))
      .reduce((a, b) => a + b, 0);
    expect(suma).toBe(100);
  });

  it("en modo lista, «Otras N» lleva en su NOTA lo que agrupa", () => {
    const leyenda = filasLeyenda(NUEVE, { modo: "lista" });
    const tabla = tablaDona(leyenda, dinero);

    // Seis visibles más el sobrante: lo mismo que dibuja el anillo, ni una fila más.
    expect(tabla.filas).toHaveLength(7);
    const resto = filaNormalizada(tabla.filas[6]!);
    expect(resto.celdas[0]).toBe("Otras 3");
    expect(resto.nota?.texto, "el sobrante no dice qué agrupa").toContain("Bloque 3");
    expect(resto.nota?.texto).toContain("Bloque 1");
    // Y con sus montos, no solo los nombres: la nota existe para no tener que volver al gráfico.
    expect(resto.nota?.texto).toContain("₡300");
  });

  it("sin nada que agrupar no se inventa una nota", () => {
    const tabla = tablaDona(filasLeyenda(NUEVE.slice(0, 3), { modo: "lista" }), dinero);
    expect(tabla.filas).toHaveLength(3);
    for (const f of tabla.filas) expect(filaNormalizada(f).nota).toBeUndefined();
  });

  it("sin datos, una tabla sin filas y no una fila de ceros", () => {
    expect(tablaDona(filasLeyenda([], { modo: "taxonomia" }), dinero).filas).toEqual([]);
  });
});

describe("describirDona", () => {
  it("dice el total y de cuántas partes se compone", () => {
    const leyenda = filasLeyenda(NUEVE, { modo: "taxonomia" });
    expect(
      describirDona({
        titulo: "Presupuesto del mes por bloque",
        filas: leyenda.filas,
        formato: dinero,
      }),
    ).toBe("Presupuesto del mes por bloque, total ₡4500, 9 bloques");
  });

  it("con una sola parte, el singular", () => {
    const leyenda = filasLeyenda(NUEVE.slice(0, 1), { modo: "taxonomia" });
    expect(describirDona({ titulo: "Reparto", filas: leyenda.filas, formato: dinero })).toBe(
      "Reparto, total ₡100, 1 bloque",
    );
  });

  it("sin datos lo dice, en vez de inventar un cero", () => {
    expect(describirDona({ titulo: "Reparto", filas: [], formato: dinero })).toBe(
      "Reparto, sin datos",
    );
  });
});

/**
 * Ningún spec localiza una dona por el envoltorio de UN camino.
 *
 * La dona tiene dos envoltorios mientras la migración esté a medias: `.dl` en la tarjeta vieja y
 * `.cf-lateral` en el marco. Al pasar `/dashboard` al marco, los specs que buscaban `.dl` a secas
 * se partieron en dos — y la mitad silenciosa fue la peor: donde se afirmaba sobre el conteo el
 * spec cayó diciendo «no hay donas en esta ruta», pero donde se recorría en un bucle el bucle dio
 * cero vueltas y el test pasó **sin comprobar nada**. Un test que pasa por no encontrar su sujeto
 * es peor que uno rojo.
 *
 * Esta guarda es estructural a propósito: el fallo que previene solo aparece con el servidor
 * levantado y una ruta ya migrada, que es tarde.
 */
describe("los specs no buscan la dona por un solo envoltorio", () => {
  const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../a11y");

  it("ninguno usa `.dl` a secas como localizador", () => {
    const culpables: string[] = [];
    for (const f of readdirSync(RAIZ).filter((n) => n.endsWith(".spec.ts"))) {
      const texto = readFileSync(path.join(RAIZ, f), "utf8");
      // `locator(".dl")` o `locator('.dl')`, con o sin espacios. Las clases hijas —`.dl-fila`,
      // `.dl-pct`, `.dl-lado`— sobreviven en los dos caminos y no son el problema.
      if (/locator\(\s*["'`]\.dl["'`]\s*\)/.test(texto)) culpables.push(f);
    }
    expect(
      culpables,
      "localizan la dona por el envoltorio viejo: usá un selector que cubra los dos caminos",
    ).toEqual([]);
  });
});

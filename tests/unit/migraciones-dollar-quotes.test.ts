/**
 * Guarda de formato para las migraciones: ningún delimitador de comillas-dólar dentro de un
 * comentario.
 *
 * Por qué. Las migraciones de este repo se aplican A MANO por el SQL Editor de Supabase, que parte
 * el script en statements buscando los delimitadores `$…$` SIN entender los comentarios `--`. Un
 * `$$` escrito en prosa cuenta como delimitador, descuadra el emparejamiento y a partir de ahí el
 * cuerpo de una función queda FUERA de las comillas: el editor lo parte por `;` y ejecuta los
 * pedazos como SQL suelto.
 *
 * No es hipotético. La 20260811000001 tenía un `$$` en un comentario explicando el bloque anónimo
 * y el editor reventó con `relation "v_padre" does not exist` — v_padre es una variable de plpgsql,
 * no una tabla, y el mensaje solo tiene sentido si esa línea corrió fuera de la función. El CI no
 * lo ve: `supabase db reset` usa el parser de Postgres de verdad, que sí entiende los comentarios,
 * así que el SQL es válido y el job pasa en verde. El único que se entera es quien lo pega en el
 * editor.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "supabase", "migrations");
const DELIMITADOR = /\$[a-zA-Z_]*\$/;

describe("comillas-dólar en las migraciones", () => {
  const archivos = readdirSync(DIR).filter((f) => f.endsWith(".sql"));

  it("hay migraciones que revisar", () => {
    expect(archivos.length).toBeGreaterThan(50);
  });

  it("ningún comentario contiene un delimitador de comillas-dólar", () => {
    const ofensas: string[] = [];
    for (const archivo of archivos) {
      const lineas = readFileSync(join(DIR, archivo), "utf8").split(/\r?\n/);
      lineas.forEach((linea, i) => {
        const corte = linea.indexOf("--");
        if (corte === -1) return;
        const comentario = linea.slice(corte);
        if (DELIMITADOR.test(comentario)) {
          ofensas.push(`${archivo}:${i + 1} → ${linea.trim().slice(0, 80)}`);
        }
      });
    }
    expect(ofensas, "un delimitador en prosa descuadra el splitter del SQL Editor").toEqual([]);
  });

  it("los delimitadores fuera de comentarios vienen en pares", () => {
    const impares: string[] = [];
    for (const archivo of archivos) {
      const sql = readFileSync(join(DIR, archivo), "utf8");
      const sinComentarios = sql
        .split(/\r?\n/)
        .map((l) => {
          const corte = l.indexOf("--");
          return corte === -1 ? l : l.slice(0, corte);
        })
        .join("\n");
      // Cada etiqueta debe aparecer un número PAR de veces: abre y cierra.
      const porEtiqueta = new Map<string, number>();
      for (const m of sinComentarios.matchAll(/\$[a-zA-Z_]*\$/g)) {
        porEtiqueta.set(m[0], (porEtiqueta.get(m[0]) ?? 0) + 1);
      }
      for (const [etiqueta, veces] of porEtiqueta) {
        if (veces % 2 !== 0) impares.push(`${archivo} → ${etiqueta} aparece ${veces} veces`);
      }
    }
    expect(impares).toEqual([]);
  });
});

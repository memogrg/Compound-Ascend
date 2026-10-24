/**
 * El código de referido de las cuentas demo tiene que ser FIJO.
 *
 * `profiles.referral_code` tiene `default public.gen_unique_referral_code()`, que es aleatorio.
 * Con el DEFAULT, cada siembra daba otro código y otro QR: medido entre dos commits consecutivos
 * de `main` que no tocan esa pantalla (`49d03542` y `516966ad`), `/configuracion` difería en
 * 4059 píxeles, todos en la zona del QR. O sea, el diff visual reprobaba `/configuracion` y
 * `/m/perfil` en TODO PR, siempre, por algo que ningún PR había cambiado.
 *
 * Esta guarda comprueba dos cosas distintas: que el seeder los fije, y que lo que fija sea un
 * código VÁLIDO. Lo segundo importa porque el alfabeto excluye la I, la L, la O, el 0 y el 1 a
 * propósito —se confunden al leerlos o al teclearlos desde un QR— y un código con una O pasaría
 * el índice único sin protestar y quedaría fuera de formato en silencio.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SEEDER = readFileSync(path.join(RAIZ, "scripts/demo/seed-demo-familia.mjs"), "utf8");
const MIGRACION = readFileSync(
  path.join(RAIZ, "supabase/migrations/20260826000002_referrals_search_path_fix.sql"),
  "utf8",
);

/** El alfabeto y la longitud, leídos de la migración: si allá cambian, esto se entera. */
function formatoDeLaBase() {
  const alfabeto = /alphabet constant text := '([^']+)'/.exec(MIGRACION)?.[1];
  const largo = /len\s+constant int\s+:= (\d+)/.exec(MIGRACION)?.[1];
  return { alfabeto: alfabeto ?? "", largo: Number(largo ?? 0) };
}

describe("códigos de referido de la demo", () => {
  it("el seeder los FIJA en vez de dejarlos al DEFAULT aleatorio", () => {
    expect(SEEDER, "la constante").toMatch(/const CODIGO_REFERIDO = \{[^}]+\}/);
    const usos = [...SEEDER.matchAll(/referral_code: CODIGO_REFERIDO\.(jose|marta)/g)].map(
      (m) => m[1],
    );
    expect(usos.sort(), "los dos perfiles lo escriben").toEqual(["jose", "marta"]);
  });

  it("los códigos caben en el alfabeto y el largo que usa la base", () => {
    const { alfabeto, largo } = formatoDeLaBase();
    expect(alfabeto, "alfabeto leído de la migración").not.toBe("");
    expect(largo, "largo leído de la migración").toBeGreaterThan(0);
    // Las exclusiones que dan sentido a la guarda: si algún día entran, esto avisa.
    for (const prohibido of ["I", "L", "O", "0", "1"])
      expect(alfabeto, `«${prohibido}» no debería estar en el alfabeto`).not.toContain(prohibido);

    const bloque = /const CODIGO_REFERIDO = \{([^}]+)\}/.exec(SEEDER)?.[1] ?? "";
    const codigos = [...bloque.matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");
    expect(codigos.length, "dos códigos").toBe(2);
    expect(new Set(codigos).size, "y distintos entre sí").toBe(2);
    for (const c of codigos) {
      expect(c.length, `«${c}» mide ${c.length}, la base usa ${largo}`).toBe(largo);
      for (const ch of c)
        expect(alfabeto, `«${c}» lleva «${ch}», que no está en el alfabeto`).toContain(ch);
    }
  });
});

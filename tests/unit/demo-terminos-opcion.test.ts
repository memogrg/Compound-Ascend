/**
 * Los legales de la cuenta demo: aceptados en CI, intactos en producción (decisión 62).
 *
 * `aceptacionPendiente` compara `profiles.terms_version` con `LEGAL_VERSION`, así que con la
 * columna en nulo la barra de re-aceptación se monta en TODA pantalla con sesión. En las capturas
 * visuales eso tapa el contenido de casi todas las rutas.
 *
 * Lo que se custodia acá son las dos mitades del arreglo, que tiran en direcciones opuestas:
 *
 *  1. que el sembrador marque los legales **solo** contra una cuenta sintética, para que la demo
 *     de producción no quede con unos términos aceptados en nombre de alguien;
 *  2. que el job que MIDE la barra legal siga deshaciéndolo. Esta segunda ya se perdió una vez:
 *     el seed de `seed-e2e-user.mjs` apagaba la barra y «E2E nav-v2» daba verde mientras, con la
 *     barra puesta, tapaba entera la navegación inferior. Un seed que apaga interfaz global
 *     vuelve ciego al job, y eso no se ve en ningún fichero del repo.
 *
 * Se afirma sobre la FUENTE y no ejecutando nada, por un motivo medido: `seed-demo-familia.mjs`
 * son 1900 líneas que abren un cliente de Supabase en cuanto se importan, y exigen `DEMO_ENV_FILE`
 * con credenciales. Importarlo en una prueba unitaria no es posible sin una base de verdad, y
 * montar una para comprobar una decisión de tres líneas sería cambiar la pregunta.
 */
import { readFileSync } from "node:fs";

import { describe, it, expect } from "vitest";

const leer = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

const SEMBRADOR = leer("scripts/demo/seed-demo-familia.mjs");
const ACEPTACION = leer("src/lib/legal/aceptacion.ts");
const CI = leer(".github/workflows/ci.yml");

describe("el sembrador de la demo y los legales", () => {
  it("la versión se lee de `version.ts`, no se escribe a mano", () => {
    // Una fecha incrustada acá se queda vieja el día que suba el texto legal, y entonces el
    // sembrador marcaría como aceptada una versión que ya no rige: la barra volvería a salir y
    // nadie sabría por qué.
    expect(SEMBRADOR, "no lee la versión del fichero de la app").toContain(
      "src/lib/legal/version.ts",
    );
    expect(SEMBRADOR).toMatch(/LEGAL_VERSION = "\(\[\^"\]\+\)"/);
    // La fecha vigente NO debe aparecer escrita en el sembrador.
    const vigente = /LEGAL_VERSION = "([^"]+)"/.exec(leer("src/lib/legal/version.ts"))?.[1];
    expect(vigente, "no se pudo leer la versión vigente").toBeTruthy();
    expect(SEMBRADOR, `la versión ${vigente} está incrustada en el sembrador`).not.toContain(
      `"${vigente}"`,
    );
  });

  it("escribe las MISMAS columnas que lee la app", () => {
    // Si el sembrador escribiera otra columna, marcaría algo que a la app le da igual y la barra
    // seguiría saliendo — con el agravante de que el fichero diría que está arreglado.
    expect(ACEPTACION, "la app ya no decide por `terms_version`").toContain(
      'select("terms_version")',
    );
    expect(SEMBRADOR).toContain("terms_version: LEGAL_VERSION");
    expect(SEMBRADOR).toContain("terms_accepted_at");
  });

  it("sin cuenta sintética el defecto es PENDIENTES: producción no cambia", () => {
    // El `DEMO_EMAIL_OVERRIDE` es lo que distingue una cuenta sintética de la demo real, y la
    // demo real existe en producción. Que el defecto dependa de eso es la garantía.
    expect(SEMBRADOR).toContain('CUENTA_SINTETICA ? "aceptados" : "pendientes"');
    expect(SEMBRADOR, "la opción dejó de poder pedirse por su nombre").toContain("DEMO_TERMINOS");
    expect(SEMBRADOR).toContain("DEMO_EMAIL_OVERRIDE");
  });

  it("la marca de tiempo sale del instante congelado, no del reloj", () => {
    // Una fecha distinta en cada siembra es lo que hace que una captura difiera sin que nada haya
    // cambiado. `AHORA` ya respeta `QA_FREEZE`.
    expect(SEMBRADOR).toContain("terms_accepted_at: AHORA.toISOString()");
    expect(SEMBRADOR, "volvió el reloj real a la marca de aceptación").not.toContain(
      "terms_accepted_at: new Date().toISOString()",
    );
  });
});

describe("el job que mide la barra legal no se queda ciego", () => {
  /** El bloque de un job de `ci.yml`, de su clave hasta la siguiente al mismo nivel. */
  function job(nombre: string): string {
    const abre = CI.indexOf(`\n  ${nombre}:\n`);
    expect(abre, `no existe el job \`${nombre}\` en ci.yml`).toBeGreaterThan(-1);
    const resto = CI.slice(abre + 1);
    const sig = resto.search(/\n {2}[a-z0-9_-]+:\n/);
    return sig === -1 ? resto : resto.slice(0, sig);
  }

  it("`E2E a11y` siembra y DESPUÉS vuelve a dejar los términos pendientes", () => {
    const bloque = job("e2e_a11y");
    const siembra = bloque.indexOf("seed-demo-familia.mjs");
    const deshace = bloque.indexOf("terms_version = null");
    expect(siembra, "ese job ya no siembra la cuenta demo").toBeGreaterThan(-1);
    expect(
      deshace,
      "el paso que deja los términos PENDIENTES desapareció: la barra legal no se montaría y sus casos medirían una pantalla que nadie tiene",
    ).toBeGreaterThan(-1);
    // El orden importa: deshacerlo ANTES de sembrar no serviría de nada.
    expect(
      deshace,
      "lo deshace antes de sembrar, así que el seed lo vuelve a tapar",
    ).toBeGreaterThan(siembra);
  });

  it("los dos jobs de capturas NO lo deshacen: ahí la barra no debe salir", () => {
    for (const nombre of ["capturas_main", "capturas_rama"]) {
      const bloque = job(nombre);
      expect(bloque, `\`${nombre}\` no siembra la cuenta demo`).toContain("seed-demo-familia.mjs");
      expect(
        bloque,
        `\`${nombre}\` volvió a poner los términos pendientes: la barra taparía casi todas las capturas`,
      ).not.toContain("terms_version = null");
    }
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it, expect } from "vitest";

/**
 * La paleta se abre SIEMPRE por el helper, nunca con una pulsación suelta del atajo.
 *
 * El atajo `Control+k` lo monta un `useEffect` (`useCommandPalette`, en `AppShell`), así que
 * antes de hidratar la pulsación se pierde sin dejar rastro: no hay error, no hay diálogo, y
 * lo siguiente que el spec haga sobre el combobox se queda esperando algo que no va a existir.
 *
 * Medido en la corrida 37045202944: el caso «sin resultados» agotó el tope del spec —120 000 ms,
 * 2,0 minutos— y el volcado de la página al morir muestra el panel entero puesto, el botón
 * «Buscar o ir a… (Ctrl K)» en su sitio y ningún diálogo de paleta. El `fill` que esperaba al
 * combobox no tiene tope propio, así que el único que lo paró fue el del test.
 *
 * `abrirPaleta` existe justo para eso: reintenta el atajo con un tope real y falla con un
 * mensaje que dice qué esperó. Esta guarda es estructural —mira el texto del spec— porque el
 * fallo que previene solo aparece en CI, bajo carga, y no todas las veces.
 */
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../a11y");

const fuente = readFileSync(path.join(RAIZ, "command-palette.spec.ts"), "utf8");

/** El cuerpo del propio helper, que es el único sitio donde la pulsación es legítima. */
function sinElHelper(texto: string) {
  const i = texto.indexOf("async function abrirPaleta");
  expect(i, "el helper `abrirPaleta` ya no existe con ese nombre").toBeGreaterThan(-1);
  const fin = texto.indexOf("\n}", i);
  return texto.slice(0, i) + texto.slice(fin);
}

describe("la paleta se abre por el helper", () => {
  it("ningún test pulsa Control+k por su cuenta", () => {
    const pulsaciones = sinElHelper(fuente).match(/keyboard\.press\(\s*"Control\+k"\s*\)/g) ?? [];
    expect(
      pulsaciones,
      "pulsación suelta del atajo fuera de `abrirPaleta`: usá el helper, que reintenta y tiene tope",
    ).toEqual([]);
  });

  it("el helper reintenta y falla con un mensaje que nombra el atajo", () => {
    const i = fuente.indexOf("async function abrirPaleta");
    const cuerpo = fuente.slice(i, fuente.indexOf("\n}", i));
    expect(cuerpo, "el helper dejó de reintentar").toMatch(/for \(let i = 0; i < \d+; i\+\+\)/);
    expect(cuerpo, "el fallo del helper no dice qué esperó").toMatch(/Control\+k/);
  });

  it("la referencia del portón se mide tras cruzar la puerta, no al llegar", () => {
    // Medir la CERRADA «al llegar» hacía que el portón acusara al sujeto de lo que se movió
    // en la referencia: la corrida 37031574206 falló con `Expected <= 1 / Received 3` cuando
    // el valor estable de los dos lados es 3.
    const portón = fuente.slice(fuente.indexOf('test("abierta y filtrando'));
    const antesDeMedir = portón.slice(0, portón.indexOf("const cerrada"));
    expect(antesDeMedir, "la referencia no cruza la puerta de la paleta").toContain("abrirPaleta");
    expect(antesDeMedir, "la referencia no espera a que la pantalla se asiente").toContain(
      "esperarPantallaAsentada",
    );
  });
});

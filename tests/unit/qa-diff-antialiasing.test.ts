/**
 * El filtro de antialiasing del diff visual.
 *
 * Se prueba la función PURA que `diff.mjs` inyecta en la página, no el script entero: el
 * script abre un navegador, y un test que levanta Chromium para comparar dos rectángulos
 * sería lento y frágil sin comprobar nada más. Es la misma implementación —`diff.mjs` lee
 * este archivo y lo inyecta—, así que lo que pasa acá es lo que pasa en el arnés.
 *
 * Los dos casos del encargo: una captura con deltas de 3 (antialiasing: un borde que se
 * redibuja un nivel más claro) y otra con deltas de 40 (cambio real de color).
 */
import { describe, it, expect } from "vitest";

// @ts-expect-error — `.mjs` sin tipos: es un script del arnés, no código de la app.
import { contarDiferencias } from "../../scripts/qa/comparar-pixeles.mjs";

/** Un mapa RGBA plano de `w × h` en gris 200. */
function lienzo(w: number, h: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  px.fill(200);
  for (let i = 3; i < px.length; i += 4) px[i] = 255;
  return px;
}

/** Copia con `cuantos` píxeles movidos `delta` niveles en el canal rojo. */
function con(px: Uint8ClampedArray, cuantos: number, delta: number, desde = 0) {
  const otro = new Uint8ClampedArray(px);
  for (let p = desde; p < desde + cuantos; p++) otro[p * 4] = px[p * 4]! + delta;
  return otro;
}

const W = 20;
const H = 10;

describe("contarDiferencias", () => {
  it("sin filtro, un delta de 3 cuenta como diferencia", () => {
    const a = lienzo(W, H);
    const r = contarDiferencias(a, con(a, 12, 3), {});
    expect(r.diferentes).toBe(12);
    expect(r.ignorados).toBe(0);
    expect(r.maxDelta).toBe(3);
  });

  it("con el filtro por defecto (5), los deltas de 3 se ignoran y se CUENTAN aparte", () => {
    // Lo importante no es que desaparezcan, es que se sigan contando: bajar el listón no
    // puede volver el ruido invisible, o dejaríamos de enterarnos si un día crece.
    const a = lienzo(W, H);
    const r = contarDiferencias(a, con(a, 12, 3), { ignorarDeltaBajo: 5 });
    expect(r.diferentes).toBe(0);
    expect(r.ignorados).toBe(12);
  });

  it("un delta de 40 sigue contando con el filtro puesto", () => {
    const a = lienzo(W, H);
    const r = contarDiferencias(a, con(a, 7, 40), { ignorarDeltaBajo: 5 });
    expect(r.diferentes).toBe(7);
    expect(r.ignorados).toBe(0);
    expect(r.maxDelta).toBe(40);
  });

  it("mezcla: el ruido se aparta y el cambio real se queda", () => {
    const a = lienzo(W, H);
    let b = con(a, 30, 3); // antialiasing
    b = con(b, 5, 40, 100); // cambio real, en otra zona
    const r = contarDiferencias(a, b, { ignorarDeltaBajo: 5 });
    expect(r.diferentes).toBe(5);
    expect(r.ignorados).toBe(30);
  });

  it("`maxDelta` solo mira lo que cuenta", () => {
    // Si un píxel se ignora, no puede seguir haciendo fallar el criterio de delta por la
    // puerta de atrás: con solo ruido de 4, el maxDelta reportado es 0.
    const a = lienzo(W, H);
    const r = contarDiferencias(a, con(a, 9, 4), { ignorarDeltaBajo: 5 });
    expect(r.diferentes).toBe(0);
    expect(r.maxDelta).toBe(0);
  });

  it("el límite es estricto: un delta igual al umbral SÍ cuenta", () => {
    const a = lienzo(W, H);
    expect(contarDiferencias(a, con(a, 3, 5), { ignorarDeltaBajo: 5 }).diferentes).toBe(3);
    expect(contarDiferencias(a, con(a, 3, 4), { ignorarDeltaBajo: 5 }).diferentes).toBe(0);
  });

  it("dos capturas idénticas no producen nada", () => {
    const a = lienzo(W, H);
    const r = contarDiferencias(a, new Uint8ClampedArray(a), { ignorarDeltaBajo: 5 });
    expect(r.diferentes).toBe(0);
    expect(r.ignorados).toBe(0);
    expect(r.maxDelta).toBe(0);
  });

  it("las marcas distinguen igual / diferente / ignorado", () => {
    // El PNG de diferencias las usa para pintar: rojo lo que cuenta, ámbar lo ignorado.
    const a = lienzo(W, H);
    let b = con(a, 4, 3);
    b = con(b, 2, 40, 50);
    const r = contarDiferencias(a, b, { ignorarDeltaBajo: 5 });
    expect([...r.marcas.slice(0, 4)]).toEqual([2, 2, 2, 2]);
    expect([...r.marcas.slice(50, 52)]).toEqual([1, 1]);
    expect(r.marcas[10]).toBe(0);
  });

  it("`threshold` sigue mandando antes que el filtro", () => {
    // Con `--threshold 8`, un delta de 3 ni siquiera llega a evaluarse como ignorable.
    const a = lienzo(W, H);
    const r = contarDiferencias(a, con(a, 6, 3), { threshold: 8, ignorarDeltaBajo: 5 });
    expect(r.diferentes).toBe(0);
    expect(r.ignorados).toBe(0);
  });
});

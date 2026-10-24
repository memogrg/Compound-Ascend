/**
 * Los tokens de TEXTO de los colores de estado, medidos contra su propio tinte.
 *
 * Un color sobre un tinte de sí mismo tiene un techo. Medido antes de tocar nada: el verde
 * sobre su 12 % daba 3,94:1, el rojo 3,95:1 y el ámbar 3,25:1, contra el 4,5:1 que WCAG
 * 1.4.3 pide para texto pequeño. Y bajar el alfa del fondo NO alcanza — a 12, 10, 8, 6 y 5 %
 * el verde va de 3,94 a 4,31, y aun con el fondo en blanco puro se queda en ~4,35. Lo que
 * tiene que moverse es el texto, y por eso los tokens existen.
 *
 * Existen APARTE para no tocar `--accent`, que es el verde de marca: el mismo #378451 del
 * «+» del wordmark. Oscurecerlo app-wide sería apartarlo de la marca para arreglar un chip.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

const CSS = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8");

type RGB = [number, number, number];
const rgb = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const canal = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const lum = ([r, g, b]: RGB) => 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
const contraste = (a: RGB, b: RGB) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return ((x as number) + 0.05) / ((y as number) + 0.05);
};
/** El tinte: el color al `alfa` sobre la superficie del tema. */
const tinte = (c: RGB, alfa: number, sup: RGB): RGB =>
  c.map((v, i) => Math.round(v * alfa + (sup[i] as number) * (1 - alfa))) as RGB;

/** Lee un token declarado con un hex literal. */
function hex(nombre: string, desde = CSS): string {
  const m = desde.match(new RegExp(`${nombre.replace(/[-]/g, "\\-")}:\\s*(#[0-9a-fA-F]{6})`));
  expect(m, `no se encontró ${nombre} con un hex literal`).not.toBeNull();
  return m![1] as string;
}

/**
 * El corte va por la REGLA, no por la primera aparición del texto: `[data-theme="dark"]` sale
 * antes en un comentario de cabecera, y cortar ahí dejaba el «bloque claro» en 263 caracteres
 * — los ocho casos fallaban diciendo que los tokens no existían, y sí existían.
 */
const CORTE = CSS.search(/^\[data-theme="dark"\]\s*\{/m);
const BLOQUE_OSCURO = CSS.slice(CORTE);
const BLOQUE_CLARO = CSS.slice(0, CORTE);

/** Cada chip: su token de texto, el color cuyo tinte lo respalda, el alfa y la superficie. */
const CHIPS = [
  {
    chip: "delta positivo",
    texto: "--pos-texto",
    base: "--success",
    alfa: 0.12,
    sup: "#ffffff",
    tema: "claro",
  },
  {
    chip: "delta negativo",
    texto: "--neg-texto",
    base: "--danger",
    alfa: 0.12,
    sup: "#ffffff",
    tema: "claro",
  },
  {
    chip: "aviso ámbar",
    texto: "--warn-texto",
    base: "--warning",
    alfa: 0.12,
    sup: "#ffffff",
    tema: "claro",
  },
  {
    chip: "delta positivo",
    texto: "--pos-texto",
    base: "--success",
    alfa: 0.14,
    sup: "#1e1c16",
    tema: "oscuro",
  },
  {
    chip: "delta negativo",
    texto: "--neg-texto",
    base: "--danger",
    alfa: 0.16,
    sup: "#1e1c16",
    tema: "oscuro",
  },
  {
    chip: "aviso ámbar",
    texto: "--warn-texto",
    base: "--warning",
    alfa: 0.16,
    sup: "#1e1c16",
    tema: "oscuro",
  },
] as const;

describe("tokens de texto sobre su tinte", () => {
  for (const c of CHIPS) {
    it(`${c.tema} · ${c.chip}: al menos 4,5:1`, () => {
      const bloque = c.tema === "claro" ? BLOQUE_CLARO : BLOQUE_OSCURO;
      // El token de texto puede ser un hex propio o remitir al color base cuando ya cumple.
      const declara = new RegExp(`${c.texto}:\\s*(#[0-9a-fA-F]{6}|var\\(${c.base}\\))`);
      const m = bloque.match(declara);
      expect(m, `${c.texto} no está declarado en el tema ${c.tema}`).not.toBeNull();
      const base = hex(c.base, bloque);
      const texto = m![1]!.startsWith("#") ? m![1]! : base;
      const r = contraste(rgb(texto), tinte(rgb(base), c.alfa, rgb(c.sup)));
      expect(r, `${texto} sobre el tinte de ${base} = ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        4.5,
      );
    });
  }
});

describe("la marca no se toca", () => {
  it("`--accent` sigue siendo el verde del wordmark", () => {
    // Si algún día hay que cambiarlo, que sea una decisión de marca y no el efecto colateral
    // de arreglar el contraste de un chip.
    expect(hex("--accent", BLOQUE_CLARO)).toBe("#378451");
  });

  it("`--success` y `--danger` tampoco cambian: el arreglo es un token APARTE", () => {
    expect(hex("--success", BLOQUE_CLARO)).toBe("#378451");
    expect(hex("--danger", BLOQUE_CLARO)).toBe("#c34f4b");
  });
});

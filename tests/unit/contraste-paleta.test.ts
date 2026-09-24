/**
 * El validador de contraste de las paletas de entidad.
 *
 * WCAG 1.4.11 pide **3:1 contra el fondo adyacente** para cualquier objeto gráfico que haga
 * falta para entender el contenido, y una porción de anillo lo es: sin ella no hay dato.
 * Esto no lo cubre `axe` —no sabe que un `fill` de SVG es una porción de dona ni contra qué
 * superficie se recorta—, así que se mide acá.
 *
 * Los valores de los tokens se copian de `tokens.css` a propósito. Leer el CSS en el test
 * obligaría a un parser de `var()` encadenados y a resolver `color-mix` igual que el
 * navegador; con la copia, si alguien cambia un token el test NO se entera — por eso hay un
 * caso que compara la lista contra el fichero y falla si dejaron de coincidir.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/** Tokens tal y como están en `src/styles/tokens.css`. */
const TEMAS = {
  claro: {
    surface: "#ffffff",
    bg: "#f4f2ec",
    text: "#1e1c16",
    chart: ["#378451", "#3a6ea5", "#be862d", "#7b5ea7", "#c34f4b", "#0f9aa8"],
  },
  oscuro: {
    surface: "#1e1c16",
    bg: "#15140f",
    text: "#f4f2ec",
    chart: ["#3f9560", "#5a8ccb", "#c4862c", "#9b7cc8", "#d46460", "#28a2b0"],
  },
} as const;

type RGB = [number, number, number];
const rgb = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;

const canal = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const luminancia = ([r, g, b]: RGB) => 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);

/** Razón de contraste WCAG entre dos colores opacos. */
export function contraste(a: RGB, b: RGB): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return ((x as number) + 0.05) / ((y as number) + 0.05);
}

/** `color-mix(in srgb, C p%, otro)` — mezcla lineal, como la resuelve el navegador. */
const mezclar = (c: RGB, p: number, otro: RGB): RGB =>
  c.map((v, i) => Math.round(v * (p / 100) + otro[i]! * (1 - p / 100))) as RGB;

function lab([r, g, b]: RGB): [number, number, number] {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [R, G, B] = [f(r), f(g), f(b)];
  const g2 = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const X = g2((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const Y = g2(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const Z = g2((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}

/** ΔE76. El umbral de percepción está en ~2,3; por debajo, dos colores son el mismo. */
export function deltaE(a: RGB, b: RGB): number {
  const [A, B] = [lab(a), lab(b)];
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}

/** Los pasos de la rampa de pasivos, en el mismo orden que `LIAB_COLOR`. */
const RAMPA = [
  { clase: "critico", hacia: "text" as const, pct: 65 },
  { clase: "consumo", hacia: null, pct: 100 },
  { clase: "patrimonial", hacia: "bg" as const, pct: 86 },
  { clase: "productivo", hacia: "bg" as const, pct: 72 },
];

/** Índice de `--chart-N` (1-based) por clase de activo, como en `ASSET_COLOR`. */
const ACTIVOS: Record<string, number> = {
  liquido: 6,
  inversion: 2,
  productivo: 1,
  uso_personal: 3,
  especial: 5,
};

describe.each(Object.entries(TEMAS))("contraste en tema %s", (nombre, T) => {
  const surface = rgb(T.surface);
  const base = rgb(T.chart[3]!); // --chart-4, el tono de la rampa

  const pasos = RAMPA.map((p) => ({
    ...p,
    color: p.hacia === null ? base : mezclar(base, p.pct, rgb(p.hacia === "text" ? T.text : T.bg)),
  }));

  it("cada paso de la rampa de pasivos llega a 3:1 contra la superficie", () => {
    for (const p of pasos) {
      const r = contraste(p.color, surface);
      expect(r, `${nombre} · ${p.clase} → ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    }
  });

  it("los pasos contiguos se distinguen a simple vista", () => {
    // Con la rampa anterior (100/74/50/30 % toda hacia `--bg`) los dos últimos pasos ni
    // siquiera llegaban a 3:1 — 2,21 y 1,65 en claro.
    for (let i = 0; i < pasos.length - 1; i++) {
      const d = deltaE(pasos[i]!.color, pasos[i + 1]!.color);
      expect(
        d,
        `${nombre} · ${pasos[i]!.clase}↔${pasos[i + 1]!.clase} → ΔE ${d.toFixed(1)}`,
      ).toBeGreaterThan(5);
    }
  });

  it("más grave es más contraste, y el orden es el mismo en los dos temas", () => {
    // Es lo que hace que la rampa se lea igual en claro y en oscuro sin escribir dos: se
    // mezcla hacia `--text` (máximo contraste de cada tema) y hacia `--bg` (mínimo).
    const razones = pasos.map((p) => contraste(p.color, surface));
    for (let i = 0; i < razones.length - 1; i++) {
      expect(razones[i]!, `${nombre} · paso ${i}`).toBeGreaterThan(razones[i + 1]!);
    }
  });

  it("las clases de activo llegan a 3:1, sin excepciones", () => {
    // Hubo una: `--chart-3` daba 2,99:1 sobre blanco. Se corrigió en el TOKEN, no
    // cambiándole el color a la clase — lo usan todos los gráficos, no solo este anillo.
    for (const [clase, n] of Object.entries(ACTIVOS)) {
      const r = contraste(rgb(T.chart[n - 1]!), surface);
      expect(r, `${nombre} · ${clase} → ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    }
  });

  it("los SEIS tokens de gráfico llegan a 3:1, no solo los que usa esta paleta", () => {
    for (let i = 0; i < 6; i++) {
      const r = contraste(rgb(T.chart[i]!), surface);
      expect(r, `${nombre} · --chart-${i + 1} → ${r.toFixed(2)}:1`).toBeGreaterThanOrEqual(3);
    }
  });

  it("no hay dos clases de activo con el mismo color", () => {
    const usados = Object.values(ACTIVOS).map((n) => T.chart[n - 1]);
    expect(new Set(usados).size).toBe(usados.length);
  });
});

describe("la copia de tokens sigue al día", () => {
  it("los valores del test son los de tokens.css", () => {
    // Sin esto, cambiar un token dejaría este validador midiendo colores que ya no existen.
    const css = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8");
    // La REGLA, no la primera mención: el comentario de cabecera del fichero ya nombra
    // `[data-theme="dark"]` y partir por ahí dejaba el bloque claro en 263 caracteres.
    const oscuroDesde = css.indexOf('\n[data-theme="dark"] {');
    const claro = css.slice(0, oscuroDesde);
    const oscuro = css.slice(oscuroDesde);

    for (let i = 0; i < 6; i++) {
      expect(claro, `--chart-${i + 1} claro`).toContain(
        `--chart-${i + 1}: ${TEMAS.claro.chart[i]}`,
      );
      expect(oscuro, `--chart-${i + 1} oscuro`).toContain(
        `--chart-${i + 1}: ${TEMAS.oscuro.chart[i]}`,
      );
    }
    expect(claro).toContain(`--surface: ${TEMAS.claro.surface}`);
    expect(oscuro).toContain(`--surface: ${TEMAS.oscuro.surface}`);
  });
});

/**
 * Simulación de daltonismo (Viénot–Brettel en espacio LMS). Devuelve el color tal y como lo
 * percibiría alguien con esa dicromacia.
 */
function comoLoVe([r, g, b]: RGB, tipo: "prot" | "deut" | "trit"): RGB {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const inv = (v: number) =>
    (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255;
  const [R, G, B] = [f(r), f(g), f(b)];
  const L = 0.31399 * R + 0.63951 * G + 0.04649 * B;
  const M = 0.15537 * R + 0.75789 * G + 0.0867 * B;
  const S = 0.01775 * R + 0.10945 * G + 0.87262 * B;
  let [l, m, s2] = [L, M, S];
  if (tipo === "prot") l = 1.05118294 * M - 0.05116099 * S;
  if (tipo === "deut") m = 0.9513092 * L + 0.04866992 * S;
  if (tipo === "trit") s2 = -0.86744736 * L + 1.86727089 * M;
  return [
    inv(5.47221206 * l - 4.6419601 * m + 0.16963708 * s2),
    inv(-1.1252419 * l + 2.29317094 * m - 0.1678952 * s2),
    inv(0.02980165 * l - 0.19318073 * m + 1.16364789 * s2),
  ].map((v) => Math.max(0, Math.min(255, Math.round(v)))) as RGB;
}

/** El par más parecido de la paleta, con su ΔE. */
function parMasParecido(
  chart: readonly string[],
  ver: (c: RGB) => RGB = (c) => c,
): { a: number; b: number; d: number } {
  let peor = { a: 0, b: 1, d: Number.POSITIVE_INFINITY };
  for (let i = 0; i < chart.length; i++) {
    for (let j = i + 1; j < chart.length; j++) {
      const d = deltaE(ver(rgb(chart[i]!)), ver(rgb(chart[j]!)));
      if (d < peor.d) peor = { a: i + 1, b: j + 1, d };
    }
  }
  return peor;
}

describe.each(Object.entries(TEMAS))("separación de la paleta en tema %s", (nombre, T) => {
  it("con visión normal, ningún par se confunde", () => {
    const p = parMasParecido(T.chart);
    expect(
      p.d,
      `${nombre} · --chart-${p.a} vs --chart-${p.b} → ΔE ${p.d.toFixed(1)}`,
    ).toBeGreaterThan(20);
  });

  /**
   * Con dicromacia la paleta NO cumple, y el test lo dice en vez de callarlo.
   *
   * El par que se cae es siempre el mismo: `--chart-2` (azul) y `--chart-4` (morado), que se
   * diferencian sobre todo en el canal rojo — justo el que pierde la protanopía. En oscuro
   * quedan en ΔE 1,2, por debajo del umbral de percepción (~2,3): para esa persona son el
   * MISMO color. Y los dos conviven en `/mi-rich-life` (inversión y la rampa de pasivos).
   *
   * El umbral de este test es el valor MEDIDO, no el deseable: sirve para que no empeore
   * mientras se decide qué hacer. Arreglarlo es re-espaciar los tonos de la paleta
   * categórica, que es una decisión de diseño y no un ajuste. Anotado en 11-open-questions.
   */
  it("con dicromacia hay pares que se confunden, y queda registrado", () => {
    const medidos = (["prot", "deut", "trit"] as const).map((t) => ({
      tipo: t,
      ...parMasParecido(T.chart, (c) => comoLoVe(c, t)),
    }));
    const resumen = medidos
      .map((m) => `${m.tipo}: --chart-${m.a}/${m.b} ΔE ${m.d.toFixed(1)}`)
      .join(" · ");

    // Piso medido hoy. Si baja, algo se juntó todavía más.
    // Medido con ESTA implementación (que redondea y acota a 0-255, como haría una pantalla).
    const piso = nombre === "claro" ? 3.2 : 1.1;
    for (const m of medidos) {
      expect(m.d, `${nombre} · ${resumen}`).toBeGreaterThan(piso);
    }
    // Y el par problemático es el conocido: si cambia, es que se movió la paleta.
    const peor = medidos.reduce((x, y) => (y.d < x.d ? y : x));
    expect([peor.a, peor.b], resumen).toEqual([2, 4]);
  });
});
